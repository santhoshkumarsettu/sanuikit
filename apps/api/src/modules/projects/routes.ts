import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectCreateSchema } from '@vstudio/validation'
import { withTenant } from '@vstudio/database/tenant'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { s3, storageBucket } from '../layouts/storage.js'

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [app.authenticate] }, async request => {
    const context = request.auth!
    const includeArchived = (request.query as { includeArchived?: string }).includeArchived === 'true'
    return withTenant(context, tx => tx.project.findMany({ where: { organizationId: context.organizationId, ...(includeArchived ? {} : { status: { not: 'ARCHIVED' as const } }) }, orderBy: { updatedAt: 'desc' }, take: 100, include: { _count: { select: { units: true, layouts: true } } } }))
  })

  app.post('/projects', { preHandler: [app.authenticate, app.requirePermission('CREATE_PROJECT')] }, async (request, reply) => {
    const parsed = projectCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid project details.' })
    const context = request.auth!
    const project = await withTenant(context, async tx => {
      const created = await tx.project.create({ data: { organizationId: context.organizationId, ...parsed.data } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_CREATED', entityType: 'Project', entityId: created.id, after: { name: created.name, slug: created.slug, projectType: created.projectType } } })
      return created
    })
    return reply.code(201).send(project)
  })

  app.get('/projects/:slug', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const context = request.auth!
    const isId = z.string().uuid().safeParse(slug).success
    const project = await withTenant(context, tx => tx.project.findFirst({ where: { organizationId: context.organizationId, ...(isId ? { OR: [{ slug }, { id: slug }] } : { slug }) }, include: { layouts: { orderBy: { createdAt: 'asc' } }, _count: { select: { units: true } } } }))
    if (!project) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    return project
  })

  app.patch('/projects/:projectId', { preHandler: [app.authenticate, app.requirePermission('EDIT_PROJECT')] }, async (request, reply) => {
    const parsed = projectCreateSchema.partial().extend({ status: z.enum(['DRAFT', 'ACTIVE']).optional() }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid project details.' })
    const { projectId } = request.params as { projectId: string }
    const context = request.auth!
    const existing = await withTenant(context, tx => tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId } }))
    if (!existing) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    return withTenant(context, async tx => {
      const updated = await tx.project.update({ where: { id: projectId }, data: { ...parsed.data, ...(parsed.data.status === 'DRAFT' ? { publicEnabled: false } : {}) } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_UPDATED', entityType: 'Project', entityId: projectId, before: { name: existing.name, status: existing.status }, after: { name: updated.name, status: updated.status } } })
      return updated
    })
  })

  app.post('/projects/:projectId/publish', { preHandler: [app.authenticate, app.requirePermission('EDIT_PROJECT')] }, async (request, reply) => {
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const result = await withTenant(context, async tx => {
      const project = await tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId }, include: { _count: { select: { layouts: true, units: true } } } })
      if (!project) return { notFound: true as const }
      if (!project._count.layouts || !project._count.units) return { incomplete: true as const }
      const publicConfig = typeof project.publicConfig === 'object' && project.publicConfig !== null ? project.publicConfig : { showPrice: true, showArea: true, showUnitType: true, allowEnquiries: true, showSoldUnits: false }
      const updated = await tx.project.update({ where: { id: projectId }, data: { status: 'ACTIVE', publicEnabled: true, publicConfig } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_PUBLISHED', entityType: 'Project', entityId: projectId, before: { status: project.status, publicEnabled: project.publicEnabled }, after: { status: updated.status, publicEnabled: updated.publicEnabled }, ipAddress: request.ip } })
      return { project: updated }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    if ('incomplete' in result) return reply.code(409).send({ code: 'PROJECT_INCOMPLETE', message: 'Add a layout and at least one inventory unit before publishing this map.' })
    return result.project
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
    return updated
  })

  app.delete('/projects/:projectId', { preHandler: [app.authenticate, app.requirePermission('DELETE_PROJECT')] }, async (request, reply) => {
    const parsed = z.object({ confirmation: z.string().min(1).max(120) }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Type the project name to confirm permanent deletion.' })
    const { projectId } = request.params as { projectId: string }
    const context = request.auth!
    const result = await withTenant(context, async tx => {
      const project = await tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId }, include: { layouts: { select: { originalAssetKey: true, optimizedAssetKey: true, thumbnailAssetKey: true } }, uploadIntents: { select: { assetKey: true } } } })
      if (!project) return { notFound: true as const }
      if (parsed.data.confirmation !== project.name) return { confirmationMismatch: true as const }

      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PROJECT_DELETED', entityType: 'Project', entityId: project.id, before: { name: project.name, slug: project.slug, status: project.status, layoutCount: project.layouts.length, unitCount: await tx.unit.count({ where: { organizationId: context.organizationId, projectId } }) }, ipAddress: request.ip } })
      await tx.booking.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.unit.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.layoutUploadIntent.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.layout.deleteMany({ where: { organizationId: context.organizationId, projectId } })
      await tx.project.delete({ where: { id: projectId } })
      const assetKeys = [...project.layouts.flatMap(layout => [layout.originalAssetKey, layout.optimizedAssetKey, layout.thumbnailAssetKey]), ...project.uploadIntents.map(intent => intent.assetKey)].filter((key): key is string => Boolean(key))
      return { deleted: true as const, projectName: project.name, assetKeys }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    if ('confirmationMismatch' in result) return reply.code(400).send({ code: 'CONFIRMATION_MISMATCH', message: 'The project name did not match. Nothing was deleted.' })
    if (storageBucket && result.assetKeys.length) {
      try {
        const keys = [...new Set(result.assetKeys)]
        for (let offset = 0; offset < keys.length; offset += 1000) {
          const response = await s3.send(new DeleteObjectsCommand({ Bucket: storageBucket, Delete: { Objects: keys.slice(offset, offset + 1000).map(Key => ({ Key })), Quiet: true } }))
          if (response.Errors?.length) request.log.warn({ errors: response.Errors, projectName: result.projectName }, 'Some layout assets could not be removed from object storage')
        }
      } catch (error) {
        request.log.warn({ err: error, projectName: result.projectName }, 'Project was deleted, but one or more layout assets could not be removed from object storage')
      }
    }
    return reply.code(204).send()
  })
}
