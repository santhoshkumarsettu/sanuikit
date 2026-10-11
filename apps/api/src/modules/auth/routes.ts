import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '@vstudio/database/tenant'
import { withTenant } from '@vstudio/database/tenant'
import { hashToken } from '../../lib/hash.js'

const registerSchema = z.object({ organizationName: z.string().trim().min(2).max(160), organizationSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).transform(value => value.toLowerCase()), password: z.string().min(12).max(128) })
const loginSchema = z.object({ email: z.string().email().max(320).transform(value => value.toLowerCase()), password: z.string().min(1).max(128), organizationId: z.string().uuid().optional() })
const switchSchema = z.object({ organizationId: z.string().uuid() })
const SESSION_HOURS = 12

async function createSession(app: FastifyInstance, reply: FastifyReply, user: { id: string; email: string; name: string }, organization: { id: string; name: string; slug: string }, role: 'OWNER' | 'ADMIN' | 'EDITOR' | 'SALES' | 'VIEWER') {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
  const sessionId = randomUUID()
  const token = app.jwt.sign({ sub: user.id, sid: sessionId, organizationId: organization.id, role }, { expiresIn: `${SESSION_HOURS}h` })
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`
    await tx.session.create({ data: { id: sessionId, userId: user.id, tokenHash: hashToken(token), expiresAt } })
  })
  reply.setCookie('vstudio_session', token, { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', expires: expiresAt })
  return { user: { id: user.id, email: user.email, name: user.name }, organization, role, expiresAt: expiresAt.toISOString() }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/register', { config: { rateLimit: { max: 4, timeWindow: '1 hour' } } }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invalid registration.' })
    const input = parsed.data
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 })
    try {
      const { organization, user } = await prisma.$transaction(async tx => {
        const organization = await tx.organization.create({ data: { name: input.organizationName, slug: input.organizationSlug } })
        const user = await tx.user.create({ data: { email: input.email, name: input.name, passwordHash } })
        await tx.$executeRaw`SELECT set_config('app.organization_id', ${organization.id}, true)`
        await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`
        await tx.organizationMember.create({ data: { organizationId: organization.id, userId: user.id, role: 'OWNER' } })
        return { organization, user }
      })
      return reply.code(201).send(await createSession(app, reply, user, organization, 'OWNER'))
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return reply.code(409).send({ code: 'ALREADY_EXISTS', message: 'An account or organization with those details already exists.' })
      throw error
    }
  })

  app.post('/auth/login', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Enter a valid email and password.' })
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
    if (!user || user.disabledAt || !(await argon2.verify(user.passwordHash, parsed.data.password))) return reply.code(401).send({ code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' })
    const memberships = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`
      return tx.organizationMember.findMany({ where: { userId: user.id, active: true }, include: { organization: true }, orderBy: { createdAt: 'asc' } })
    })
    const membership = parsed.data.organizationId ? memberships.find(item => item.organizationId === parsed.data.organizationId) : memberships[0]
    if (!membership) return reply.code(403).send({ code: 'NO_ORGANIZATION', message: 'This user does not have access to an active organization.' })
    const response = await createSession(app, reply, user, membership.organization, membership.role)
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    return response
  })

  app.post('/auth/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    if (request.auth) await withTenant(request.auth, tx => tx.session.updateMany({ where: { id: request.auth!.sessionId, userId: request.auth!.userId, revokedAt: null }, data: { revokedAt: new Date() } }))
    reply.clearCookie('vstudio_session', { path: '/' })
    return reply.code(204).send()
  })

  app.get('/auth/me', { preHandler: [app.authenticate] }, async request => {
    const context = request.auth!
    const membership = await withTenant(context, tx => tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } }, include: { user: true, organization: true } }))
    if (!membership) return null
    return { user: { id: membership.user.id, name: membership.user.name, email: membership.user.email, avatarUrl: membership.user.avatarUrl }, organization: { id: membership.organization.id, name: membership.organization.name, slug: membership.organization.slug }, role: membership.role }
  })

  app.post('/auth/switch-organization', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = switchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Organization ID is invalid.' })
    const context = request.auth!
    const membership = await prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.user_id', ${context.userId}, true)`; return tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: context.userId } }, include: { organization: true } }) })
    if (!membership?.active) return reply.code(403).send({ code: 'FORBIDDEN', message: 'You are not a member of that organization.' })
    await withTenant(context, tx => tx.session.updateMany({ where: { id: context.sessionId }, data: { revokedAt: new Date() } }))
    const user = await prisma.user.findUniqueOrThrow({ where: { id: context.userId } })
    return createSession(app, reply, user, membership.organization, membership.role)
  })
}
