import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { prisma } from '@vstudio/database/tenant'
import { withTenant } from '@vstudio/database/tenant'
import { s3, storageBucket } from '../layouts/storage.js'

const publicConfigSchema = z.object({ showPrice: z.boolean().default(true), showArea: z.boolean().default(true), showUnitType: z.boolean().default(true), allowEnquiries: z.boolean().default(true), showSoldUnits: z.boolean().default(false), contactEmail: z.string().email().max(320).optional(), contactPhone: z.string().max(32).optional() })

export async function registerPublicRoutes(app: FastifyInstance) {
  app.get('/public/projects/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string }
    const project = await prisma.project.findFirst({ where: { slug, publicEnabled: true, status: 'ACTIVE' }, select: { id: true, organizationId: true, name: true, slug: true, description: true, projectType: true, location: true, publicConfig: true, layouts: { orderBy: { createdAt: 'asc' }, take: 1, select: { id: true, name: true, width: true, height: true, optimizedAssetKey: true, originalAssetKey: true } } } })
    if (!project) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Public project not found.' })
    const config = publicConfigSchema.safeParse(project.publicConfig).success ? publicConfigSchema.parse(project.publicConfig) : publicConfigSchema.parse({})
    const units = await withTenant({ organizationId: project.organizationId }, tx => tx.unit.findMany({ where: { projectId: project.id, organizationId: project.organizationId, status: config.showSoldUnits ? undefined : { notIn: ['SOLD', 'OFF_MARKET'] } }, orderBy: { unitNumber: 'asc' }, select: { id: true, projectId: true, layoutId: true, unitNumber: true, unitType: true, area: true, areaUnit: true, price: true, currency: true, status: true, geometry: true, publicMetadata: true, updatedAt: true } }))
    const publicUnits = units.map(unit => ({ ...unit, area: config.showArea ? Number(unit.area) : null, price: config.showPrice ? Number(unit.price) : null, unitType: config.showUnitType ? unit.unitType : null, publicMetadata: unit.publicMetadata }))
    const layouts = await Promise.all(project.layouts.map(async layout => ({ id: layout.id, name: layout.name, width: layout.width, height: layout.height, assetUrl: storageBucket ? await getSignedUrl(s3, new GetObjectCommand({ Bucket: storageBucket, Key: layout.optimizedAssetKey ?? layout.originalAssetKey }), { expiresIn: 3600 }) : undefined })))
    return { project: { id: project.id, organizationId: project.organizationId, name: project.name, slug: project.slug, description: project.description, projectType: project.projectType, location: project.location, status: 'ACTIVE' as const, updatedAt: new Date().toISOString(), publicConfig: config }, layouts, units: publicUnits }
  })

  app.patch('/projects/:projectId/public-settings', { preHandler: [app.authenticate, app.requirePermission('EDIT_PROJECT')] }, async (request, reply) => {
    const parsed = z.object({ enabled: z.boolean(), config: publicConfigSchema }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid public map settings.' })
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const updated = await withTenant(context, tx => tx.project.updateMany({ where: { id: projectId, organizationId: context.organizationId }, data: { publicEnabled: parsed.data.enabled, publicConfig: parsed.data.config } }))
    if (!updated.count) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    await withTenant(context, tx => tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'PUBLIC_MAP_SETTINGS_UPDATED', entityType: 'Project', entityId: projectId, after: { enabled: parsed.data.enabled, config: parsed.data.config }, ipAddress: request.ip } }))
    return { enabled: parsed.data.enabled, publicUrl: parsed.data.enabled ? `${process.env.PUBLIC_ORIGIN ?? 'http://localhost:3001'}/p/${(await withTenant(context, tx => tx.project.findUnique({ where: { id: projectId }, select: { slug: true } })))?.slug}` : null }
  })
}
