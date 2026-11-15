import { Redis } from 'ioredis'
import type { FastifyInstance } from 'fastify'
import { parseApiEnvironment } from '@vstudio/config'
import { permissionsFor, type Permission } from '@vstudio/auth'
import { withTenant } from '@vstudio/database/tenant'
import { eventChannel } from './bus.js'

const env = parseApiEnvironment()
export async function registerRealtimeRoutes(app: FastifyInstance) {
  app.get('/events', { websocket: true, preHandler: [app.authenticate] }, async (socket, request) => {
    if (!env.REDIS_URL) { socket.close(1013, 'Realtime service unavailable'); return }
    const context = request.auth!
    const overrides = context.role === 'OWNER' ? undefined : await withTenant(context, async tx => {
      const rows = await tx.organizationRolePermission.findMany({
        where: { organizationId: context.organizationId, role: context.role },
        select: { permission: true, granted: true },
      })
      return Object.fromEntries(rows.map(row => [row.permission, row.granted])) as Partial<Record<Permission, boolean>>
    })
    const grants = permissionsFor(context.role, overrides)
    const canViewInventory = grants.has('VIEW_INVENTORY')
    const canViewBookings = grants.has('VIEW_BOOKINGS')
    if (!canViewInventory && !canViewBookings) {
      socket.close(1008, 'Realtime access is not granted')
      return
    }
    const organizationId = context.organizationId
    const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
    subscriber.subscribe(eventChannel(organizationId)).catch(error => { request.log.error({ err: error }, 'Unable to subscribe to inventory events'); socket.close(1011, 'Subscription failed') })
    subscriber.on('message', (_channel, message) => {
      if (socket.readyState !== socket.OPEN) return
      try {
        const event = JSON.parse(message) as { type?: string }
        const requiredPermission = event.type?.startsWith('BOOKING_')
          ? 'VIEW_BOOKINGS'
          : event.type?.startsWith('UNIT_') || event.type?.startsWith('UNITS_')
            ? 'VIEW_INVENTORY'
            : undefined
        if (requiredPermission && grants.has(requiredPermission)) socket.send(message)
      } catch (error) {
        request.log.warn({ err: error }, 'Unable to filter a realtime organization event')
      }
    })
    socket.send(JSON.stringify({ type: 'CONNECTED', organizationId, occurredAt: new Date().toISOString() }))
    socket.on('close', () => { void subscriber.quit() })
    socket.on('error', (error: Error) => { request.log.warn({ err: error }, 'Realtime client connection error'); void subscriber.quit() })
  })
}
