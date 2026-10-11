import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { assertUnitStatusTransition } from '@vstudio/types'
import { withTenant } from '@vstudio/database/tenant'
import { publishOrganizationEvent } from '../realtime/bus.js'

const createBookingSchema = z.object({ projectId: z.string().uuid(), unitId: z.string().uuid(), customerName: z.string().trim().min(2).max(160), customerEmail: z.string().email().max(320).optional(), customerPhone: z.string().trim().min(7).max(32).optional(), notes: z.string().max(2000).optional() })

export async function registerBookingRoutes(app: FastifyInstance) {
  app.get('/projects/:projectId/bookings', { preHandler: [app.authenticate] }, async request => {
    const context = request.auth!; const { projectId } = request.params as { projectId: string }
    const bookings = await withTenant(context, tx => tx.booking.findMany({ where: { organizationId: context.organizationId, projectId }, include: { unit: { select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, price: true, currency: true } } }, orderBy: { createdAt: 'desc' }, take: 500 }))
    return bookings.map(item => ({ ...item, unit: { ...item.unit, area: Number(item.unit.area), price: Number(item.unit.price) } }))
  })

  app.post('/bookings', { preHandler: [app.authenticate, app.requirePermission('CREATE_BOOKING')] }, async (request, reply) => {
    const parsed = createBookingSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid booking details.' })
    const context = request.auth!; const input = parsed.data
    const booking = await withTenant(context, async tx => {
      const unit = await tx.unit.findFirst({ where: { id: input.unitId, projectId: input.projectId, organizationId: context.organizationId } })
      if (!unit) return { notFound: true as const }
      if (unit.status !== 'AVAILABLE') return { conflict: true as const }
      assertUnitStatusTransition(unit.status, 'RESERVED')
      const locked = await tx.unit.updateMany({ where: { id: unit.id, version: unit.version, status: unit.status }, data: { status: 'RESERVED', version: { increment: 1 } } })
      if (!locked.count) return { conflict: true as const }
      const created = await tx.booking.create({ data: { organizationId: context.organizationId, projectId: input.projectId, unitId: input.unitId, createdById: context.userId, customerName: input.customerName, customerEmail: input.customerEmail, customerPhone: input.customerPhone, notes: input.notes, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'BOOKING_CREATED', entityType: 'Booking', entityId: created.id, after: { unitId: unit.id, unitNumber: unit.unitNumber, customerName: input.customerName }, ipAddress: request.ip } })
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'UNIT_STATUS_CHANGED', entityType: 'Unit', entityId: unit.id, before: { status: unit.status }, after: { status: 'RESERVED' }, metadata: { bookingId: created.id }, ipAddress: request.ip } })
      return { booking: created }
    })
    if ('notFound' in booking) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Available unit not found in this project.' })
    if ('conflict' in booking) return reply.code(409).send({ code: 'WRITE_CONFLICT', message: 'The unit changed; reload availability and try again.' })
    void publishOrganizationEvent(context.organizationId, { type: 'BOOKING_CREATED', id: booking.booking.id, data: { unitId: input.unitId } }).catch(error => request.log.warn({ err: error }, 'Unable to publish booking event'))
    return reply.code(201).send(booking.booking)
  })

  app.post('/bookings/:bookingId/cancel', { preHandler: [app.authenticate, app.requirePermission('CANCEL_BOOKING')] }, async (request, reply) => {
    const context = request.auth!; const { bookingId } = request.params as { bookingId: string }
    const result = await withTenant(context, async tx => {
      const booking = await tx.booking.findFirst({ where: { id: bookingId, organizationId: context.organizationId }, include: { unit: true } })
      if (!booking) return { notFound: true as const }
      if (booking.status === 'CANCELLED' || booking.status === 'EXPIRED') return { booking }
      if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') return { invalid: true as const }
      const updatedBooking = await tx.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } })
      if (booking.unit.status === 'RESERVED' || booking.unit.status === 'BOOKED') {
        const nextStatus = booking.unit.status === 'BOOKED' ? 'AVAILABLE' : 'AVAILABLE'
        assertUnitStatusTransition(booking.unit.status, nextStatus)
        await tx.unit.updateMany({ where: { id: booking.unitId, version: booking.unit.version }, data: { status: nextStatus, version: { increment: 1 } } })
      }
      await tx.auditLog.create({ data: { organizationId: context.organizationId, actorId: context.userId, action: 'BOOKING_CANCELLED', entityType: 'Booking', entityId: booking.id, before: { status: booking.status }, after: { status: 'CANCELLED' }, ipAddress: request.ip } })
      return { booking: updatedBooking }
    })
    if ('notFound' in result) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Booking not found.' })
    if ('invalid' in result) return reply.code(409).send({ code: 'INVALID_BOOKING_STATE', message: 'Completed bookings cannot be cancelled.' })
    void publishOrganizationEvent(context.organizationId, { type: 'BOOKING_CANCELLED', id: result.booking.id }).catch(error => request.log.warn({ err: error }, 'Unable to publish booking cancellation'))
    return result.booking
  })
}
