import { Redis } from 'ioredis'
import type { FastifyInstance } from 'fastify'
import { parseApiEnvironment } from '@vstudio/config'
import { eventChannel } from './bus.js'

const env = parseApiEnvironment()
export async function registerRealtimeRoutes(app: FastifyInstance) {
  app.get('/events', { websocket: true, preHandler: [app.authenticate] }, (socket, request) => {
    if (!env.REDIS_URL) { socket.close(1013, 'Realtime service unavailable'); return }
    const organizationId = request.auth!.organizationId
    const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null })
    subscriber.subscribe(eventChannel(organizationId)).catch(error => { request.log.error({ err: error }, 'Unable to subscribe to inventory events'); socket.close(1011, 'Subscription failed') })
    subscriber.on('message', (_channel, message) => { if (socket.readyState === socket.OPEN) socket.send(message) })
    socket.send(JSON.stringify({ type: 'CONNECTED', organizationId, occurredAt: new Date().toISOString() }))
    socket.on('close', () => { void subscriber.quit() })
    socket.on('error', (error: Error) => { request.log.warn({ err: error }, 'Realtime client connection error'); void subscriber.quit() })
  })
}
