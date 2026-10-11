import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectCreateSchema } from '@vstudio/validation'
import { withTenant } from '@vstudio/database/tenant'

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get('/projects', { preHandler: [app.authenticate] }, async request => {
    const context = request.auth!
    return withTenant(context, tx => tx.project.findMany({ where: { organizationId: context.organizationId, status: { not: 'ARCHIVED' } }, orderBy: { updatedAt: 'desc' }, take: 100, include: { _count: { select: { units: true, layouts: true } } } }))
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
      const updated = await tx.project.update({ where: { id: projectId }, data: parsed.data })
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
}
