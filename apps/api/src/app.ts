import { randomUUID } from 'node:crypto'
import Fastify, { type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import websocket from '@fastify/websocket'
import { assertPermission } from '@vstudio/auth'
import { parseApiEnvironment } from '@vstudio/config'
import { prisma } from '@vstudio/database/tenant'
import { withTenant } from '@vstudio/database/tenant'
import type { OrganizationRole } from '@vstudio/types'
import { hashToken } from './lib/hash.js'
import { registerAuthRoutes } from './modules/auth/routes.js'
import { registerProjectRoutes } from './modules/projects/routes.js'
import { registerInventoryRoutes } from './modules/inventory/routes.js'
import { registerBookingRoutes } from './modules/bookings/routes.js'
import { registerLayoutRoutes } from './modules/layouts/routes.js'
import { registerPublicRoutes } from './modules/public/routes.js'
import { registerRealtimeRoutes } from './modules/realtime/routes.js'

const env = parseApiEnvironment()
interface SessionToken { sub: string; sid: string; organizationId: string; role: OrganizationRole; iat: number; exp: number }

export async function buildApp() {
  const allowedOrigins = new Set([env.ADMIN_ORIGIN, env.PUBLIC_ORIGIN])
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'development' ? 'debug' : 'info', redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'], censor: '[REDACTED]' } },
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY.split(',').map(value => value.trim()).filter(Boolean) : false, bodyLimit: 1_048_576,
    genReqId: request => request.headers['x-request-id']?.toString().slice(0, 128) ?? randomUUID(),
  })
  app.decorateRequest('auth', null)
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'self'", ...allowedOrigins], formAction: ["'self'"], baseUri: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'cross-origin' } })
  await app.register(cors, { credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['content-type', 'authorization', 'x-request-id', 'x-organization-id'], origin(origin, callback) { if (!origin) return callback(null, true); callback(null, allowedOrigins.has(origin)) } })
  await app.register(cookie)
  await app.register(jwt, { secret: env.JWT_SECRET, sign: { iss: 'vstudio-api', aud: 'vstudio-app', algorithm: 'HS256' }, verify: { allowedIss: 'vstudio-api', allowedAud: 'vstudio-app', algorithms: ['HS256'] } })
  await app.register(rateLimit, { max: 300, timeWindow: '15 minutes', keyGenerator: request => request.ip })
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 8 } })
  await app.register(websocket)

  app.decorate('authenticate', async (request: FastifyRequest, reply) => {
    const cookieToken = request.cookies.vstudio_session
    const bearer = request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : undefined
    const token = cookieToken ?? bearer
    if (!token) { reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' }); return }
    if (cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && (!request.headers.origin || !allowedOrigins.has(request.headers.origin))) { reply.code(403).send({ code: 'INVALID_ORIGIN', message: 'Request origin is not allowed.' }); return }
    let payload: SessionToken
    try { payload = app.jwt.verify<SessionToken>(token) }
    catch { reply.code(401).send({ code: 'SESSION_INVALID', message: 'Your session has expired. Sign in again.' }); return }
    if (!payload.sub || !payload.sid || !payload.organizationId) { reply.code(401).send({ code: 'SESSION_INVALID', message: 'Your session is invalid.' }); return }
    const context = { userId: payload.sub, organizationId: payload.organizationId }
    const membership = await withTenant(context, async tx => {
      const [session, member, user] = await Promise.all([
        tx.session.findFirst({ where: { id: payload.sid, userId: payload.sub, tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } } }),
        tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: payload.organizationId, userId: payload.sub } } }),
        tx.user.findUnique({ where: { id: payload.sub }, select: { disabledAt: true } }),
      ])
      return session && member?.active && !user?.disabledAt ? { role: member.role, sessionId: session.id } : null
    })
    if (!membership) { reply.clearCookie('vstudio_session', { path: '/' }); reply.code(401).send({ code: 'SESSION_REVOKED', message: 'Your session is no longer active.' }); return }
    request.auth = { userId: payload.sub, organizationId: payload.organizationId, role: membership.role, sessionId: membership.sessionId }
  })
  app.decorate('requirePermission', permission => async (request, reply) => {
    if (!request.auth) { reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Sign in to continue.' }); return }
    try { assertPermission(request.auth.role, permission) }
    catch { reply.code(403).send({ code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' }) }
  })

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { validation?: unknown; code?: string; statusCode?: number }
    request.log.error({ err, requestId: request.id }, 'Request failed')
    if (err.name === 'InvalidStatusTransitionError') return reply.code(409).send({ code: 'INVALID_TRANSITION', message: err.message })
    if (err.name === 'ForbiddenError') return reply.code(403).send({ code: 'FORBIDDEN', message: err.message })
    if (err.validation) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Request validation failed.' })
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) return reply.code(err.statusCode).send({ code: err.statusCode === 400 ? 'INVALID_REQUEST' : 'REQUEST_REJECTED', message: err.statusCode === 400 ? 'Request body or parameters are invalid.' : 'Request could not be completed.' })
    if (err.code === 'P2002') return reply.code(409).send({ code: 'ALREADY_EXISTS', message: 'A record with those details already exists.' })
    if (err.code === 'P2003') return reply.code(409).send({ code: 'RELATED_RECORD_EXISTS', message: 'This record is referenced by another record and cannot be removed.' })
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: 'The request could not be completed.', requestId: request.id })
  })
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ code: 'NOT_FOUND', message: 'Route not found.' }))
  app.get('/health/live', async () => ({ status: 'ok', service: 'vstudio-api' }))
  app.get('/health/ready', async (_request, reply) => { try { await prisma.$queryRaw`SELECT 1`; return { status: 'ready' } } catch { return reply.code(503).send({ status: 'not_ready', dependency: 'database' }) } })

  await app.register(async versioned => {
    await versioned.register(registerAuthRoutes)
    await versioned.register(registerProjectRoutes)
    await versioned.register(registerInventoryRoutes)
    await versioned.register(registerBookingRoutes)
    await versioned.register(registerLayoutRoutes)
    await versioned.register(registerPublicRoutes)
    await versioned.register(registerRealtimeRoutes)
  }, { prefix: '/api/v1' })
  return app
}
