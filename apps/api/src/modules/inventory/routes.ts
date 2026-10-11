import { parse } from 'csv-parse/sync'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { Prisma } from '@vstudio/database/client'
import { canTransitionUnitStatus, assertUnitStatusTransition, type UnitStatus } from '@vstudio/types'
import { csvImportRowSchema, geometryFitsLayout, geometrySchema, unitCreateSchema, unitStatusTransitionSchema } from '@vstudio/validation'
import { withTenant } from '@vstudio/database/tenant'
import { publishOrganizationEvent } from '../realtime/bus.js'

function serializeUnit<T extends { area: { toNumber(): number }; price: { toNumber(): number } }>(unit: T) { return { ...unit, area: unit.area.toNumber(), price: unit.price.toNumber() } }
function parseCsvRows(csv: string) {
  if (csv.length > 1_000_000) throw Object.assign(new Error('CSV exceeds the 1 MB import limit.'), { statusCode: 413 })
  const records = parse(csv, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: false }) as Record<string, unknown>[]
  if (records.length > 5000) throw Object.assign(new Error('CSV imports are limited to 5,000 rows.'), { statusCode: 413 })
  return records.map((record, index) => ({ line: index + 2, result: csvImportRowSchema.safeParse(record) }))
}

async function inspectImport(tx: Prisma.TransactionClient, organizationId: string, projectId: string, csv: string) {
  const parsedRows = parseCsvRows(csv)
  const valid = parsedRows.flatMap(row => row.result.success ? [{ ...row, data: row.result.data }] : [])
  const errors: { line: number; unitNumber?: string; message: string }[] = parsedRows.flatMap(row => row.result.success ? [] : [{ line: row.line, message: row.result.error.issues[0]?.message ?? 'Invalid row.' }])
  const duplicateNumbers = new Set<string>()
  const seen = new Set<string>()
  for (const row of valid) {
    const number = row.data.unit_number.toLowerCase()
    if (seen.has(number)) duplicateNumbers.add(number)
    seen.add(number)
  }
  for (const row of valid) if (duplicateNumbers.has(row.data.unit_number.toLowerCase())) errors.push({ line: row.line, unitNumber: row.data.unit_number, message: 'Duplicate unit number in this import.' })
  const units = await tx.unit.findMany({ where: { organizationId, projectId, unitNumber: { in: valid.map(row => row.data.unit_number) } } })
  const byNumber = new Map<string, { id: string; unitNumber: string; status: UnitStatus }>(units.map(unit => [unit.unitNumber.toLowerCase(), unit]))
  const accepted: { line: number; data: z.infer<typeof csvImportRowSchema>; unitId: string; currentStatus: UnitStatus }[] = []
  for (const row of valid) {
    const data = row.data
    const unit = byNumber.get(data.unit_number.toLowerCase())
    if (!unit) { errors.push({ line: row.line, unitNumber: data.unit_number, message: 'No mapped visual unit has this unit number.' }); continue }
    if (!canTransitionUnitStatus(unit.status, data.status)) { errors.push({ line: row.line, unitNumber: data.unit_number, message: `Status cannot change from ${unit.status} to ${data.status}.` }); continue }
    if (duplicateNumbers.has(data.unit_number.toLowerCase())) continue
    accepted.push({ line: row.line, data, unitId: unit.id, currentStatus: unit.status })
  }
  return { totalRows: parsedRows.length, accepted, errors }
}

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get('/projects/:projectId/units', { preHandler: [app.authenticate] }, async (request, reply) => {
    const context = request.auth!
    const params = request.params as { projectId: string }
    const query = request.query as Record<string, string | undefined>
    const status = query.status?.split(',').filter(Boolean) as UnitStatus[] | undefined
    const minPrice = query.minPrice ? Number(query.minPrice) : undefined
    const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined
    const minArea = query.minArea ? Number(query.minArea) : undefined
    const maxArea = query.maxArea ? Number(query.maxArea) : undefined
    if ([minPrice, maxPrice, minArea, maxArea].some(value => value !== undefined && !Number.isFinite(value))) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Price and area filters must be numeric.' })
    const sort = ['unitNumber', 'price', 'area', 'updatedAt'].includes(query.sort ?? '') ? query.sort! : 'unitNumber'
    const orderBy = { [sort]: query.order === 'desc' ? 'desc' : 'asc' } as const
    const units = await withTenant(context, tx => tx.unit.findMany({
      where: { organizationId: context.organizationId, projectId: params.projectId, unitNumber: query.search ? { contains: query.search, mode: 'insensitive' } : undefined, unitType: query.type as never, status: status?.length ? { in: status } : undefined, price: { gte: minPrice, lte: maxPrice }, area: { gte: minArea, lte: maxArea } },
      orderBy, take: Math.min(Number(query.limit) || 500, 1000),
    }))
    return units.map(serializeUnit)
  })

  app.post('/projects/:projectId/units', { preHandler: [app.authenticate, app.requirePermission('CREATE_UNIT')] }, async (request, reply) => {
    const parsed = unitCreateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid unit details.' })
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const result = await withTenant(context, async tx => {
      const [project, layout] = await Promise.all([
        tx.project.findFirst({ where: { id: projectId, organizationId: context.organizationId } }),
        tx.layout.findFirst({ where: { id: parsed.data.layoutId, projectId, organizationId: context.organizationId } }),
      ])
      if (!project || !layout) return { notFound: true as const }
      if (!geometryFitsLayout(parsed.data.geometry, layout.width, layout.height)) return { geometryError: true as const }
      const unit = await tx.unit.create({ data: { organizationId: context.organizationId, projectId, ...parsed.data, geometry: parsed.data.geometry } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_CREATED', entityType: 'Unit', entityId: unit.id, after: { unitNumber: unit.unitNumber, status: unit.status, geometry: parsed.data.geometry }, ipAddress: request.ip } })
      return { unit }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Project or layout not found.' })
    if ('geometryError' in result) return reply.code(400).send({ code: 'GEOMETRY_OUT_OF_BOUNDS', message: 'Unit geometry must fit within its layout coordinate space.' })
    return reply.code(201).send(serializeUnit(result.unit))
  })

  app.patch('/units/:unitId/geometry', { preHandler: [app.authenticate, app.requirePermission('EDIT_MAP')] }, async (request, reply) => {
    const parsed = z.object({ geometry: geometrySchema, expectedVersion: z.number().int().positive() }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid unit geometry.' })
    const context = request.auth!; const { unitId } = request.params as { unitId: string }
    const result = await withTenant(context, async tx => {
      const current = await tx.unit.findFirst({ where: { id: unitId, organizationId: context.organizationId }, include: { layout: { select: { width: true, height: true } } } })
      if (!current) return { notFound: true as const }
      if (current.version !== parsed.data.expectedVersion) return { conflict: true as const }
      if (!geometryFitsLayout(parsed.data.geometry, current.layout.width, current.layout.height)) return { geometryError: true as const }
      const updatedCount = await tx.unit.updateMany({ where: { id: unitId, organizationId: context.organizationId, version: current.version }, data: { geometry: parsed.data.geometry, version: { increment: 1 } } })
      if (!updatedCount.count) return { conflict: true as const }
      const updated = await tx.unit.findUniqueOrThrow({ where: { id: unitId } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_GEOMETRY_UPDATED', entityType: 'Unit', entityId: unitId, before: { geometry: current.geometry, version: current.version }, after: { geometry: parsed.data.geometry, version: updated.version }, ipAddress: request.ip } })
      return { unit: updated }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Unit not found.' })
    if ('conflict' in result) return reply.code(409).send({ code: 'WRITE_CONFLICT', message: 'This unit changed in another session. Reload the layout before saving.' })
    if ('geometryError' in result) return reply.code(400).send({ code: 'GEOMETRY_OUT_OF_BOUNDS', message: 'Unit geometry must fit within its layout coordinate space.' })
    void publishOrganizationEvent(context.organizationId, { type: 'UNIT_GEOMETRY_UPDATED', id: unitId }).catch(error => request.log.warn({ err: error }, 'Unable to publish unit geometry update'))
    return serializeUnit(result.unit)
  })

  app.delete('/units/:unitId', { preHandler: [app.authenticate, app.requirePermission('DELETE_UNIT')] }, async (request, reply) => {
    const context = request.auth!; const { unitId } = request.params as { unitId: string }
    const removed = await withTenant(context, async tx => {
      const unit = await tx.unit.findFirst({ where: { id: unitId, organizationId: context.organizationId } })
      if (!unit) return false
      if (await tx.booking.count({ where: { unitId: unit.id } })) return { conflict: true as const }
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_DELETED', entityType: 'Unit', entityId: unit.id, before: { unitNumber: unit.unitNumber, status: unit.status, geometry: unit.geometry }, ipAddress: request.ip } })
      await tx.unit.delete({ where: { id: unit.id } })
      return { removed: true as const }
    })
    if (!removed) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Unit not found.' })
    if ('conflict' in removed) return reply.code(409).send({ code: 'UNIT_HAS_BOOKINGS', message: 'Units with booking history cannot be deleted. Change their availability instead.' })
    void publishOrganizationEvent(context.organizationId, { type: 'UNIT_DELETED', id: unitId }).catch(error => request.log.warn({ err: error }, 'Unable to publish unit removal'))
    return reply.code(204).send()
  })

  app.patch('/units/:unitId/status', { preHandler: [app.authenticate, app.requirePermission('UPDATE_STATUS')] }, async (request, reply) => {
    const parsed = unitStatusTransitionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid unit status.' })
    const context = request.auth!; const { unitId } = request.params as { unitId: string }
    const changed = await withTenant(context, async tx => {
      const current = await tx.unit.findFirst({ where: { id: unitId, organizationId: context.organizationId } })
      if (!current) return { notFound: true as const }
      assertUnitStatusTransition(current.status, parsed.data.status)
      const result = await tx.unit.updateMany({ where: { id: unitId, organizationId: context.organizationId, status: current.status, version: current.version }, data: { status: parsed.data.status, version: { increment: 1 } } })
      if (!result.count) return { conflict: true as const }
      const updated = await tx.unit.findUniqueOrThrow({ where: { id: unitId } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_STATUS_CHANGED', entityType: 'Unit', entityId: unitId, before: { status: current.status, version: current.version }, after: { status: updated.status, version: updated.version }, metadata: { reason: parsed.data.reason }, ipAddress: request.ip } })
      return { unit: updated }
    })
    if ('notFound' in changed) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Unit not found.' })
    if ('conflict' in changed) return reply.code(409).send({ code: 'WRITE_CONFLICT', message: 'This unit was updated by someone else. Refresh and try again.' })
    void publishOrganizationEvent(context.organizationId, { type: 'UNIT_STATUS_CHANGED', id: unitId, data: { status: changed.unit.status } }).catch(error => request.log.warn({ err: error }, 'Unable to publish unit status update'))
    return serializeUnit(changed.unit)
  })

  app.patch('/units/bulk/status', { preHandler: [app.authenticate, app.requirePermission('UPDATE_STATUS')] }, async (request, reply) => {
    const schema = unitStatusTransitionSchema.extend({ unitIds: z.array(z.string().uuid()).min(1).max(500) })
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Select one to 500 valid units and a target status.' })
    const context = request.auth!
    const updated = await withTenant(context, async tx => {
      const units = await tx.unit.findMany({ where: { id: { in: parsed.data.unitIds }, organizationId: context.organizationId } })
      if (units.length !== parsed.data.unitIds.length) return { notFound: true as const }
      for (const unit of units) assertUnitStatusTransition(unit.status, parsed.data.status)
      const results = []
      for (const unit of units) {
        const result = await tx.unit.updateMany({ where: { id: unit.id, version: unit.version }, data: { status: parsed.data.status, version: { increment: 1 } } })
        if (!result.count) throw Object.assign(new Error('A unit changed during the bulk update.'), { name: 'OptimisticConcurrencyError' })
        await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_STATUS_CHANGED', entityType: 'Unit', entityId: unit.id, before: { status: unit.status }, after: { status: parsed.data.status }, metadata: { reason: parsed.data.reason, bulk: true }, ipAddress: request.ip } })
        results.push({ id: unit.id, status: parsed.data.status })
      }
      return { units: results }
    })
    if ('notFound' in updated) return reply.code(404).send({ code: 'NOT_FOUND', message: 'One or more units were not found in this organization.' })
    void publishOrganizationEvent(context.organizationId, { type: 'UNITS_BULK_STATUS_CHANGED', data: updated.units }).catch(error => request.log.warn({ err: error }, 'Unable to publish bulk unit status update'))
    return updated
  })

  app.get('/projects/:projectId/units/import/template', { preHandler: [app.authenticate, app.requirePermission('EXPORT_DATA')] }, async (_request, reply) => reply.type('text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="vstudio-inventory-template.csv"').send('unit_number,unit_type,area,price,status\nP-101,PLOT,1500,3500000,AVAILABLE\n'))

  app.post('/projects/:projectId/units/import/preview', { preHandler: [app.authenticate, app.requirePermission('EDIT_UNIT')] }, async (request, reply) => {
    const body = request.body as { csv?: unknown }
    if (typeof body?.csv !== 'string') return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'CSV text is required.' })
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const csv = body.csv
    const result = await withTenant(context, tx => inspectImport(tx, context.organizationId, projectId, csv))
    return { totalRows: result.totalRows, validRows: result.accepted.map(row => ({ line: row.line, ...row.data })), invalidRows: result.errors, canImport: result.totalRows > 0 && result.errors.length === 0 }
  })

  app.post('/projects/:projectId/units/import/commit', { preHandler: [app.authenticate, app.requirePermission('EDIT_UNIT')] }, async (request, reply) => {
    const body = request.body as { csv?: unknown }
    if (typeof body?.csv !== 'string') return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'CSV text is required.' })
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const csv = body.csv
    const result = await withTenant(context, async tx => {
      const checked = await inspectImport(tx, context.organizationId, projectId, csv)
      if (checked.totalRows === 0 || checked.errors.length) return { invalid: checked }
      const updated = []
      for (const row of checked.accepted) {
        const unit = await tx.unit.update({ where: { id: row.unitId }, data: { unitType: row.data.unit_type, area: row.data.area, price: row.data.price, status: row.data.status, version: { increment: 1 } } })
        await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_IMPORTED', entityType: 'Unit', entityId: unit.id, before: { status: row.currentStatus }, after: { status: unit.status, area: row.data.area, price: row.data.price }, metadata: { source: 'csv', line: row.line }, ipAddress: request.ip } })
        updated.push(unit.unitNumber)
      }
      return { updated }
    })
    if ('invalid' in result) return reply.code(422).send({ code: 'IMPORT_VALIDATION_FAILED', message: 'No rows were imported. Fix the errors and retry.', ...result.invalid })
    return reply.code(200).send({ imported: result.updated.length, unitNumbers: result.updated })
  })

  app.get('/projects/:projectId/units/export', { preHandler: [app.authenticate, app.requirePermission('EXPORT_DATA')] }, async (request, reply) => {
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const units = await withTenant(context, tx => tx.unit.findMany({ where: { organizationId: context.organizationId, projectId }, orderBy: { unitNumber: 'asc' } }))
    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
    const rows = ['unit_number,unit_type,area,price,status', ...units.map(unit => [unit.unitNumber, unit.unitType, unit.area.toString(), unit.price.toString(), unit.status].map(escape).join(','))]
    return reply.type('text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="vstudio-inventory.csv"').send(rows.join('\n'))
  })
}
