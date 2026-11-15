import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { withTenant } from '@vstudio/database/tenant'

const querySchema = z.object({ take: z.coerce.number().int().min(1).max(50).default(8) })
type JsonObject = Record<string, unknown>

function record(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function statusLabel(value: unknown): string | undefined {
  const status = text(value)
  return status ? status.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) : undefined
}

export async function registerAuditRoutes(app: FastifyInstance) {
  app.get('/activity', { preHandler: [app.authenticate, app.requirePermission('VIEW_AUDIT_LOGS')] }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Activity limit must be between 1 and 50.' })
    const context = request.auth!

    return withTenant(context, async tx => {
      const logs = await tx.auditLog.findMany({
        where: { organizationId: context.organizationId },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: parsed.data.take,
      })
      const unitIds = [...new Set(logs.filter(log => log.entityType === 'Unit').map(log => log.entityId))]
      const projectIds = [...new Set(logs.filter(log => log.entityType === 'Project').map(log => log.entityId))]
      const layoutIds = [...new Set(logs.filter(log => log.entityType === 'Layout').map(log => log.entityId))]
      const bookingIds = [...new Set(logs.filter(log => log.entityType === 'Booking').map(log => log.entityId))]
      const [units, projects, layouts, bookings] = await Promise.all([
        unitIds.length ? tx.unit.findMany({ where: { id: { in: unitIds }, organizationId: context.organizationId }, select: { id: true, unitNumber: true, project: { select: { name: true } } } }) : [],
        projectIds.length ? tx.project.findMany({ where: { id: { in: projectIds }, organizationId: context.organizationId }, select: { id: true, name: true } }) : [],
        layoutIds.length ? tx.layout.findMany({ where: { id: { in: layoutIds }, organizationId: context.organizationId }, select: { id: true, name: true, project: { select: { name: true } } } }) : [],
        bookingIds.length ? tx.booking.findMany({ where: { id: { in: bookingIds }, organizationId: context.organizationId }, select: { id: true, unit: { select: { unitNumber: true } }, project: { select: { name: true } } } }) : [],
      ])
      const unitById = new Map(units.map(unit => [unit.id, unit]))
      const projectById = new Map(projects.map(project => [project.id, project]))
      const layoutById = new Map(layouts.map(layout => [layout.id, layout]))
      const bookingById = new Map(bookings.map(booking => [booking.id, booking]))

      return logs.map(log => {
        const before = record(log.before)
        const after = record(log.after)
        const unit = log.entityType === 'Unit' ? unitById.get(log.entityId) : undefined
        const booking = log.entityType === 'Booking' ? bookingById.get(log.entityId) : undefined
        const layout = log.entityType === 'Layout' ? layoutById.get(log.entityId) : undefined
        const project = log.entityType === 'Project' ? projectById.get(log.entityId) : undefined
        const unitNumber = unit?.unitNumber ?? booking?.unit.unitNumber ?? text(after.unitNumber) ?? text(before.unitNumber)
        const projectName = project?.name ?? layout?.project.name ?? booking?.project.name ?? unit?.project.name
        const entityName = unitNumber ? `Unit ${unitNumber}` : layout?.name ?? project?.name ?? text(after.name) ?? text(before.name) ?? log.entityType.toLowerCase()
        let summary: string

        switch (log.action) {
          case 'BOOKING_CREATED': summary = `created a booking for ${entityName}`; break
          case 'BOOKING_CONFIRMED': summary = `confirmed the booking for ${entityName}`; break
          case 'BOOKING_CANCELLED': summary = `cancelled the booking for ${entityName}`; break
          case 'UNIT_CREATED': summary = `added ${entityName}${projectName ? ` to ${projectName}` : ''}`; break
          case 'UNIT_IMPORTED': summary = `imported ${entityName}${projectName ? ` into ${projectName}` : ''}`; break
          case 'UNIT_DETAILS_UPDATED': summary = `updated the details for ${entityName}`; break
          case 'UNIT_GEOMETRY_UPDATED': summary = `edited the map outline for ${entityName}`; break
          case 'UNIT_GEOMETRY_SCALED_FOR_LAYOUT_REPLACEMENT': summary = `adjusted the map outline for ${entityName}`; break
          case 'UNIT_STATUS_CHANGED': {
            const from = statusLabel(before.status)
            const to = statusLabel(after.status)
            summary = `changed ${entityName}${from && to ? ` from ${from} to ${to}` : ' status'}`
            break
          }
          case 'UNIT_DELETED': summary = `removed ${entityName} from inventory`; break
          case 'PROJECT_CREATED': summary = `created project ${projectName ?? entityName}`; break
          case 'PROJECT_UPDATED': summary = `updated project ${projectName ?? entityName}`; break
          case 'PROJECT_PUBLISHED': summary = `published ${projectName ?? entityName}`; break
          case 'PROJECT_ARCHIVED': summary = `archived ${projectName ?? entityName}`; break
          case 'PROJECT_DELETED': summary = `deleted project ${text(before.name) ?? entityName}`; break
          case 'LAYOUT_CREATED': summary = `added layout ${layout?.name ?? entityName}`; break
          case 'LAYOUT_UPLOADED': summary = `uploaded layout ${layout?.name ?? entityName}`; break
          case 'LAYOUT_REPLACED': summary = `replaced the image for ${layout?.name ?? entityName}`; break
          case 'LAYOUT_DELETED': summary = `deleted layout ${text(before.name) ?? entityName}`; break
          case 'PUBLIC_MAP_SETTINGS_UPDATED': summary = `updated public map settings for ${projectName ?? entityName}`; break
          case 'MEMBER_INVITED': summary = `invited ${text(after.email) ?? 'a teammate'} as ${statusLabel(after.role) ?? 'a member'}`; break
          case 'INVITATION_REVOKED': summary = `revoked the invitation for ${text(before.email) ?? 'a teammate'}`; break
          case 'MEMBER_JOINED': summary = `${text(after.email) ?? 'a teammate'} joined as ${statusLabel(after.role) ?? 'a member'}`; break
          case 'MEMBER_ROLE_CHANGED': summary = `changed ${text(after.email) ?? 'a teammate'} from ${statusLabel(before.role) ?? 'a member'} to ${statusLabel(after.role) ?? 'a member'}`; break
          case 'MEMBER_DEACTIVATED': summary = `deactivated ${text(after.email) ?? 'a teammate'}`; break
          case 'MEMBER_REACTIVATED': summary = `reactivated ${text(after.email) ?? 'a teammate'}`; break
          case 'ROLE_PERMISSIONS_UPDATED': summary = `updated access permissions for the ${statusLabel(log.entityId) ?? 'workspace'} role`; break
          default: summary = `${log.action.toLowerCase().replaceAll('_', ' ')} · ${entityName}`
        }

        return {
          id: log.id,
          actorName: log.actor?.name ?? (log.actorId ? 'Former teammate' : 'System'),
          action: log.action,
          summary,
          projectName,
          occurredAt: log.createdAt.toISOString(),
          category: log.entityType.toLowerCase(),
        }
      })
    })
  })
}
