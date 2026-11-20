import { randomUUID } from 'node:crypto'
import type { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectCreateSchema, projectUpdateSchema } from '@vstudio/validation'
import type { Prisma } from '@vstudio/database/client'
import { withTenant, type TenantContext } from '@vstudio/database/tenant'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { s3, storageBucket } from '../layouts/storage.js'
import { deleteProjectLogo, readProjectInput, storeProjectLogo, withProjectLogo } from './logo.js'
import { lockProject, publicConfigObject } from './project-config.js'

function applySalesContacts(config: Prisma.JsonValue, contactEmail?: string, contactPhone?: string) {
  const updated = { ...publicConfigObject(config) }
  if (contactEmail !== undefined) {
    if (contactEmail) updated.contactEmail = contactEmail
    else delete updated.contactEmail
  }
  if (contactPhone !== undefined) {
    if (contactPhone) updated.contactPhone = contactPhone
    else delete updated.contactPhone
  }
  return updated
}

async function discardUnusedLogo(key: string | undefined, context: TenantContext, log: FastifyBaseLogger) {
  if (!key) return
  try {
    const project = await withTenant(context, tx => tx.project.findFirst({ where: { organizationId: context.organizationId, logoAssetKey: key }, select: { id: true } }))
    if (!project) await deleteProjectLogo(key, log)
  } catch (error) {
    log.warn({ err: error, key }, 'Could not verify whether a project image is in use')
  }
}

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [app.authenticate, app.requirePermission('VIEW_PROJECTS')] }, async request => {
    const context = request.auth!
    const includeArchived = (request.query as { includeArchived?: string }).includeArchived === 'true'
    const projects = await withTenant(context, tx => tx.project.findMany({ where: { organizationId: context.organizationId, ...(includeArchived ? {} : { status: { not: 'ARCHIVED' as const } }) }, orderBy: { updatedAt: 'desc' }, take: 100, include: { _count: { select: { units: true, layouts: true } } } }))
    return Promise.all(projects.map(project => withProjectLogo(project, request.log)))
  })

  app.post('/projects', { preHandler: [app.authenticate, app.requirePermission('CREATE_PROJECT')] }, async (request, reply) => {
    const input = await readProjectInput(request, projectCreateSchema)
    if ('error' in input) return reply.code(input.status).send({ code: 'VALIDATION_ERROR', message: input.error })
    if (input.logo && !storageBucket) return reply.code(503).send({ code: 'STORAGE_UNAVAILABLE', message: 'Project image storage is not configured.' })
    const context = request.auth!
    const { contactEmail, contactPhone, ...details } = input.details
    const projectId = randomUUID()
    const logoAssetKey = input.logo ? await storeProjectLogo(context.organizationId, projectId, input.logo, request.log) : undefined
    const project = await withTenant(context, async tx => {
      const created = await tx.project.create({ data: {
        ...details,
        id: projectId,
        organizationId: context.organizationId,
        publicConfig: applySalesContacts({}, contactEmail, contactPhone),
        logoAssetKey,
      } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_CREATED', entityType: 'Project', entityId: created.id, after: { name: created.name, slug: created.slug, projectType: created.projectType } } })
      return created
    }).catch(async error => {
      await discardUnusedLogo(logoAssetKey, context, request.log)
      throw error
    })
    return reply.code(201).send(await withProjectLogo(project, request.log))
  })

  app.get('/projects/:slug', { preHandler: [app.authenticate, app.requirePermission('VIEW_PROJECTS')] }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const context = request.auth!
    const isId = z.string().uuid().safeParse(slug).success
    const project = await withTenant(context, tx => tx.project.findFirst({ where: { organizationId: context.organizationId, ...(isId ? { OR: [{ slug }, { id: slug }] } : { slug }) }, include: { layouts: { orderBy: { createdAt: 'asc' } }, _count: { select: { units: true } } } }))
    if (!project) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    return withProjectLogo(project, request.log)
  })

  app.patch('/projects/:projectId', { preHandler: [app.authenticate, app.requirePermission('EDIT_PROJECT')] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    if (!z.uuid().safeParse(projectId).success) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    const input = await readProjectInput(request, projectUpdateSchema)
    if ('error' in input) return reply.code(input.status).send({ code: 'VALIDATION_ERROR', message: input.error })
    const { contactEmail, contactPhone, removeLogo, ...details } = input.details
    if (input.logo && removeLogo) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Choose whether to replace or remove the project image.' })
    if (input.logo && !storageBucket) return reply.code(503).send({ code: 'STORAGE_UNAVAILABLE', message: 'Project image storage is not configured.' })
    const context = request.auth!
    let uploadedLogo: string | undefined
    if (input.logo) {
      const exists = await withTenant(context, tx => tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId }, select: { id: true } }))
      if (!exists) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
      uploadedLogo = await storeProjectLogo(context.organizationId, projectId, input.logo, request.log)
    }
    const result = await withTenant(context, async tx => {
      const existing = await lockProject(tx, projectId, context.organizationId)
      if (!existing) return null
      const updateContacts = contactEmail !== undefined || contactPhone !== undefined
      const updated = await tx.project.update({ where: { id: projectId }, data: {
        ...details,
        ...(details.status === 'DRAFT' ? { publicEnabled: false } : {}),
        publicConfig: updateContacts ? applySalesContacts(existing.publicConfig, contactEmail, contactPhone) : undefined,
        logoAssetKey: removeLogo ? null : uploadedLogo,
      } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_UPDATED', entityType: 'Project', entityId: projectId, before: { name: existing.name, status: existing.status }, after: { name: updated.name, status: updated.status }, metadata: { salesContactUpdated: updateContacts, logoUpdated: updated.logoAssetKey !== existing.logoAssetKey } } })
      return { updated, previousLogo: existing.logoAssetKey }
    }).catch(async error => {
      await discardUnusedLogo(uploadedLogo, context, request.log)
      throw error
    })
    if (!result) {
      await deleteProjectLogo(uploadedLogo, request.log)
      return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    }
    if (result.previousLogo !== result.updated.logoAssetKey) await deleteProjectLogo(result.previousLogo, request.log)
    return withProjectLogo(result.updated, request.log)
  })

  app.post('/projects/:projectId/publish', { preHandler: [app.authenticate, app.requirePermission('EDIT_PROJECT')] }, async (request, reply) => {
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const result = await withTenant(context, async tx => {
      const project = await tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId }, include: { _count: { select: { layouts: true, units: true } } } })
      if (!project) return { notFound: true as const }
      if (!project._count.layouts || !project._count.units) return { incomplete: true as const }
      const updated = await tx.project.update({ where: { id: projectId }, data: { status: 'ACTIVE', publicEnabled: true } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_PUBLISHED', entityType: 'Project', entityId: projectId, before: { status: project.status, publicEnabled: project.publicEnabled }, after: { status: updated.status, publicEnabled: updated.publicEnabled }, ipAddress: request.ip } })
      return { project: updated }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    if ('incomplete' in result) return reply.code(409).send({ code: 'PROJECT_INCOMPLETE', message: 'Add a layout and at least one inventory unit before publishing this map.' })
    return withProjectLogo(result.project, request.log)
  })

  app.post('/projects/:projectId/archive', { preHandler: [app.authenticate, app.requirePermission('DELETE_PROJECT')] }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const context = request.auth!
    const updated = await withTenant(context, async tx => {
      const current = await tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId } })
      if (!current) return null
      const project = await tx.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED', publicEnabled: false } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_ARCHIVED', entityType: 'Project', entityId: projectId, before: { status: current.status }, after: { status: project.status } } })
      return project
    })
    if (!updated) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    return withProjectLogo(updated, request.log)
  })

  app.delete('/projects/:projectId', { preHandler: [app.authenticate, app.requirePermission('DELETE_PROJECT')] }, async (request, reply) => {
    const parsed = z.object({ confirmation: z.string().min(1).max(120) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Type the project name to confirm permanent deletion.' })
    const { projectId } = request.params as { projectId: string }
    const context = request.auth!
    const result = await withTenant(context, async tx => {
      const current = await lockProject(tx, projectId, context.organizationId)
      if (!current) return { notFound: true as const }
      if (parsed.data.confirmation !== current.name) return { confirmationMismatch: true as const }
      const project = await tx.project.findUniqueOrThrow({ where: { id: current.id }, include: { layouts: { select: { originalAssetKey: true, optimizedAssetKey: true, thumbnailAssetKey: true } }, uploadIntents: { select: { assetKey: true } } } })

      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_DELETED', entityType: 'Project', entityId: project.id, before: { name: project.name, slug: project.slug, status: project.status, layoutCount: project.layouts.length, unitCount: await tx.unit.count({ where: { organizationId: context.organizationId, projectId } }) }, ipAddress: request.ip } })
      await tx.booking.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.unit.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.layoutUploadIntent.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.layout.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.project.delete({ where: { id: projectId } })
      const assetKeys = [project.logoAssetKey, ...project.layouts.flatMap(layout => [layout.originalAssetKey, layout.optimizedAssetKey, layout.thumbnailAssetKey]), ...project.uploadIntents.map(intent => intent.assetKey)].filter((key): key is string => Boolean(key))
      return { deleted: true as const, projectName: project.name, assetKeys }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    if ('confirmationMismatch' in result) return reply.code(400).send({ code: 'CONFIRMATION_MISMATCH', message: 'The project name did not match. Nothing was deleted.' })
    if (storageBucket && result.assetKeys.length) {
      try {
        const keys = [...new Set(result.assetKeys)]
        for (let offset = 0; offset < keys.length; offset += 1000) {
          const response = await s3.send(new DeleteObjectsCommand({ Bucket: storageBucket, Delete: { Objects: keys.slice(offset, offset + 1000).map(Key => ({ Key })), Quiet: true } }))
          if (response.Errors?.length) request.log.warn({ errors: response.Errors, projectName: result.projectName }, 'Some project assets could not be removed from object storage')
        }
      } catch (error) {
        request.log.warn({ err: error, projectName: result.projectName }, 'Project was deleted, but one or more assets could not be removed from object storage')
      }
    }
    return reply.code(204).send()
  })
}
