import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@vstudio/database/client'
import { layoutCreateSchema } from '@vstudio/validation'
import { withTenant } from '@vstudio/database/tenant'
import { enqueueAssetOptimization } from './asset-jobs.js'
import type { UnitGeometry } from '@vstudio/types'
import { s3, storageBucket, storageReady } from './storage.js'

const uploadIntentSchema = z.object({ name: z.string().trim().min(2).max(120), layoutId: z.string().uuid().optional(), fileName: z.string().trim().min(1).max(255), contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']), size: z.number().int().positive().max(20 * 1024 * 1024), width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000) })
const extensions: Record<string, string[]> = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'] }

function scaleGeometry(geometry: UnitGeometry, scaleX: number, scaleY: number): UnitGeometry {
  if (geometry.kind === 'RECTANGLE') return { ...geometry, x: geometry.x * scaleX, y: geometry.y * scaleY, width: geometry.width * scaleX, height: geometry.height * scaleY }
  return { kind: 'POLYGON', points: geometry.points.map(point => ({ x: point.x * scaleX, y: point.y * scaleY })) }
}

export async function registerLayoutRoutes(app: FastifyInstance) {
  app.get('/projects/:projectId/layouts', { preHandler: [app.authenticate, app.requirePermission('VIEW_MAP')] }, async request => {
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    return withTenant(context, tx => tx.layout.findMany({ where: { organizationId: context.organizationId, projectId }, orderBy: { createdAt: 'asc' } }))
  })

  app.delete('/layouts/:layoutId', { preHandler: [app.authenticate, app.requirePermission('UPLOAD_LAYOUT')] }, async (request, reply) => {
    const context = request.auth!; const { layoutId } = request.params as { layoutId: string }
    const result = await withTenant(context, async tx => {
      const layout = await tx.layout.findFirst({ where: { id: layoutId, organizationId: context.organizationId }, include: { uploadIntent: true } })
      if (!layout) return { notFound: true as const }
      const unitCount = await tx.unit.count({ where: { organizationId: context.organizationId, layoutId } })
      if (unitCount) return { hasUnits: true as const, unitCount }
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'LAYOUT_DELETED', entityType: 'Layout', entityId: layout.id, before: { name: layout.name, width: layout.width, height: layout.height }, ipAddress: request.ip } })
      await tx.layoutUploadIntent.deleteMany({ where: { layoutId, organizationId: context.organizationId } })
      await tx.layout.delete({ where: { id: layoutId } })
      return { deleted: true as const, assetKeys: [layout.originalAssetKey, layout.optimizedAssetKey, layout.thumbnailAssetKey, layout.uploadIntent?.assetKey].filter((key): key is string => Boolean(key)) }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Layout not found.' })
    if ('hasUnits' in result) return reply.code(409).send({ code: 'LAYOUT_HAS_UNITS', message: `This layout has ${result.unitCount} mapped unit${result.unitCount === 1 ? '' : 's'}. Replace its plan or remove those units before deleting it.` })
    if (storageBucket) for (const key of new Set(result.assetKeys)) {
      try { await s3.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: key })) }
      catch (error) { request.log.warn({ err: error, key }, 'Layout was deleted, but an asset could not be removed from object storage') }
    }
    return reply.code(204).send()
  })

  app.post('/projects/:projectId/layouts/upload-intents', { preHandler: [app.authenticate, app.requirePermission('UPLOAD_LAYOUT')] }, async (request, reply) => {
    if (!storageReady || !storageBucket) return reply.code(503).send({ code: 'STORAGE_UNAVAILABLE', message: 'Layout storage is not configured.' })
    const parsed = uploadIntentSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid image details.' })
    const input = parsed.data
    if (!extensions[input.contentType]?.includes(extname(input.fileName).toLowerCase())) return reply.code(400).send({ code: 'FILE_TYPE_MISMATCH', message: 'File extension does not match the declared image type.' })
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const project = await withTenant(context, tx => tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId }, select: { id: true } }))
    if (!project) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    const layoutId = input.layoutId ?? randomUUID()
    const uploadVersion = randomUUID()
    const assetKey = `${context.organizationId}/projects/${projectId}/layouts/${layoutId}/${uploadVersion}/original${extname(input.fileName).toLowerCase()}`
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: storageBucket, Key: assetKey, ContentType: input.contentType, CacheControl: 'private, max-age=0' }), { expiresIn: 300 })
    const prepared = await withTenant(context, async tx => {
      if (input.layoutId) {
        const layout = await tx.layout.findFirst({ where: { id: layoutId, projectId, organizationId: context.organizationId } })
        if (!layout) return false
        const existingIntent = await tx.layoutUploadIntent.findUnique({ where: { layoutId } })
        const intentData = { assetKey, contentType: input.contentType, expectedSize: input.size, expiresAt: new Date(Date.now() + 5 * 60 * 1000), finalizedAt: null }
        if (existingIntent) await tx.layoutUploadIntent.update({ where: { id: existingIntent.id }, data: intentData })
        else await tx.layoutUploadIntent.create({ data: { organizationId: context.organizationId, projectId, layoutId, ...intentData } })
        await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'LAYOUT_REPLACEMENT_STARTED', entityType: 'Layout', entityId: layoutId, before: { width: layout.width, height: layout.height }, metadata: { fileName: input.fileName, size: input.size, contentType: input.contentType }, ipAddress: request.ip } })
        return true
      }
      await tx.layout.create({ data: { id: layoutId, organizationId: context.organizationId, projectId, name: input.name, originalAssetKey: assetKey, width: input.width, height: input.height } })
      await tx.layoutUploadIntent.create({ data: { organizationId: context.organizationId, projectId, layoutId, assetKey, contentType: input.contentType, expectedSize: input.size, expiresAt: new Date(Date.now() + 5 * 60 * 1000) } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'LAYOUT_UPLOAD_STARTED', entityType: 'Layout', entityId: layoutId, metadata: { fileName: input.fileName, size: input.size, contentType: input.contentType }, ipAddress: request.ip } })
      return true
    })
    if (!prepared) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Layout not found in this project.' })
    return reply.code(201).send({ layoutId, uploadUrl, uploadHeaders: { 'Content-Type': input.contentType }, expiresInSeconds: 300 })
  })

  app.post('/layouts/:layoutId/confirm-upload', { preHandler: [app.authenticate, app.requirePermission('UPLOAD_LAYOUT')] }, async (request, reply) => {
    if (!storageReady || !storageBucket) return reply.code(503).send({ code: 'STORAGE_UNAVAILABLE', message: 'Layout storage is not configured.' })
    const context = request.auth!; const { layoutId } = request.params as { layoutId: string }
    const upload = await withTenant(context, tx => tx.layoutUploadIntent.findFirst({ where: { layoutId, organizationId: context.organizationId }, include: { layout: true } }))
    if (!upload) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Layout upload not found.' })
    if (upload.finalizedAt) return reply.code(409).send({ code: 'UPLOAD_ALREADY_FINALIZED', message: 'This upload was already confirmed.' })
    if (upload.expiresAt <= new Date()) return reply.code(410).send({ code: 'UPLOAD_EXPIRED', message: 'Request a new upload URL and retry.' })
    const layout = upload.layout
    const head = await s3.send(new HeadObjectCommand({ Bucket: storageBucket, Key: upload.assetKey }))
    if (!head.ContentLength || head.ContentLength !== upload.expectedSize || head.ContentLength > 20 * 1024 * 1024) return reply.code(400).send({ code: 'INVALID_ASSET_SIZE', message: 'The uploaded image size does not match the upload request.' })
    const object = await s3.send(new GetObjectCommand({ Bucket: storageBucket, Key: upload.assetKey }))
    if (!object.Body) return reply.code(400).send({ code: 'ASSET_NOT_FOUND', message: 'Upload the image before confirming it.' })
    const bytes = Buffer.from(await object.Body.transformToByteArray())
    const detected = await fileTypeFromBuffer(bytes)
    if (!detected || !['image/png', 'image/jpeg', 'image/webp'].includes(detected.mime)) return reply.code(415).send({ code: 'UNSUPPORTED_FILE', message: 'The file content is not a supported PNG, JPEG, or WebP image.' })
    if (head.ContentType !== detected.mime || upload.contentType !== detected.mime) return reply.code(415).send({ code: 'CONTENT_TYPE_MISMATCH', message: 'The uploaded content type does not match the file signature.' })
    const normalized = await sharp(bytes, { limitInputPixels: 100_000_000 }).rotate().toBuffer({ resolveWithObject: true })
    const { width, height } = normalized.info
    if (!width || !height || width > 100_000 || height > 100_000) return reply.code(400).send({ code: 'INVALID_IMAGE_DIMENSIONS', message: 'Image dimensions are invalid or too large.' })
    const updated = await withTenant(context, async tx => {
      const current = await tx.layout.findFirst({ where: { id: layoutId, organizationId: context.organizationId } })
      if (!current) return null
      const isReplacement = current.originalAssetKey !== upload.assetKey
      const scaledUnitCount = isReplacement && (current.width !== width || current.height !== height)
        ? await (async () => {
            const units = await tx.unit.findMany({ where: { organizationId: context.organizationId, layoutId } })
            for (const unit of units) {
              const before = unit.geometry as UnitGeometry
              const after = scaleGeometry(before, width / current.width, height / current.height)
              await tx.unit.update({ where: { id: unit.id }, data: { geometry: after as Prisma.InputJsonValue, version: { increment: 1 } } })
              await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_GEOMETRY_SCALED_FOR_LAYOUT_REPLACEMENT', entityType: 'Unit', entityId: unit.id, before: { geometry: before as Prisma.InputJsonValue }, after: { geometry: after as Prisma.InputJsonValue }, metadata: { layoutId }, ipAddress: request.ip } })
            }
            return units.length
          })()
        : 0
      const row = await tx.layout.update({ where: { id: layoutId }, data: { originalAssetKey: upload.assetKey, optimizedAssetKey: null, thumbnailAssetKey: null, width, height, version: { increment: 1 } } })
      await tx.layoutUploadIntent.update({ where: { id: upload.id }, data: { finalizedAt: new Date() } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: isReplacement ? 'LAYOUT_REPLACED' : 'LAYOUT_UPLOADED', entityType: 'Layout', entityId: layoutId, before: isReplacement ? { width: current.width, height: current.height } : undefined, after: { width, height, contentType: detected.mime, size: head.ContentLength }, metadata: { scaledUnitCount }, ipAddress: request.ip } })
      return { row, oldAssetKeys: isReplacement ? [current.originalAssetKey, current.optimizedAssetKey, current.thumbnailAssetKey].filter((key): key is string => Boolean(key)) : [], scaledUnitCount }
    })
    if (!updated) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Layout not found.' })
    if (storageBucket) for (const key of new Set(updated.oldAssetKeys)) {
      try { await s3.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: key })) }
      catch (error) { request.log.warn({ err: error, key }, 'New layout is active, but the previous image asset could not be removed') }
    }
    const optimizationJob = await enqueueAssetOptimization({ organizationId: context.organizationId, layoutId, assetKey: upload.assetKey })
    return { ...updated.row, optimization: optimizationJob ? 'QUEUED' : 'READY', scaledUnitCount: updated.scaledUnitCount }
  })

  app.post('/projects/:projectId/layouts', { preHandler: [app.authenticate, app.requirePermission('UPLOAD_LAYOUT')] }, async (request, reply) => {
    const parsed = layoutCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid layout.' })
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const body = request.body as z.infer<typeof layoutCreateSchema> & { type?: 'SITE_PLAN' | 'FLOOR_PLAN' | 'PARKING' | 'CUSTOM' }
    const created = await withTenant(context, async tx => {
      const project = await tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId } })
      if (!project) return null
      const layout = await tx.layout.create({ data: { organizationId: context.organizationId, projectId, name: parsed.data.name, originalAssetKey: parsed.data.imageKey, width: parsed.data.width, height: parsed.data.height, type: body.type ?? 'SITE_PLAN' } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'LAYOUT_CREATED', entityType: 'Layout', entityId: layout.id, after: { name: layout.name, width: layout.width, height: layout.height }, ipAddress: request.ip } })
      return layout
    })
    if (!created) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project not found.' })
    return reply.code(201).send(created)
  })

  app.get('/layouts/:layoutId/asset-url', { preHandler: [app.authenticate, app.requirePermission('VIEW_MAP')] }, async (request, reply) => {
    if (!storageBucket) return reply.code(503).send({ code: 'STORAGE_UNAVAILABLE', message: 'Layout storage is not configured.' })
    const context = request.auth!; const { layoutId } = request.params as { layoutId: string }
    const layout = await withTenant(context, tx => tx.layout.findFirst({ where: { id: layoutId, organizationId: context.organizationId } }))
    if (!layout) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Layout not found.' })
    const assetUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: storageBucket, Key: layout.optimizedAssetKey ?? layout.originalAssetKey }), { expiresIn: 300 })
    return { url: assetUrl, expiresInSeconds: 300 }
  })
}
