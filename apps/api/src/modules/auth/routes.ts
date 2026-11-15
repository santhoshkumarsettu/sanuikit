import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { organizationRoleDefinitions, permissionsFor, type Permission } from '@vstudio/auth'
import { prisma } from '@vstudio/database/tenant'
import { withTenant } from '@vstudio/database/tenant'
import { hashToken } from '../../lib/hash.js'

const registerSchema = z.object({ organizationName: z.string().trim().min(2).max(160), organizationSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100), name: z.string().trim().min(2).max(160), email: z.string().trim().email().max(320).transform(value => value.toLowerCase()), password: z.string().min(12).max(128) })
const organizationUpdateSchema = z.object({ name: z.string().trim().min(2).max(160).optional(), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100).optional() }).refine(data => data.name !== undefined || data.slug !== undefined, { message: 'Provide at least one organization field to update.', path: ['name'] })
const loginSchema = z.object({ email: z.string().email().max(320).transform(value => value.toLowerCase()), password: z.string().min(1).max(128), organizationId: z.string().uuid().optional() })
const switchSchema = z.object({ organizationId: z.string().uuid() })
const invitationAcceptSchema = z.object({ name: z.string().trim().min(2).max(160), password: z.string().min(12).max(128) })
const SESSION_HOURS = 12
const roleLabelFor = (role: string) => organizationRoleDefinitions.find(item => item.id === role)?.label ?? role

async function invitationDetails(token: string) {
  const tokenHash = hashToken(token)
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`
    const invitation = await tx.invitation.findUnique({ where: { tokenHash } })
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return null
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${invitation.organizationId}, true)`
    const [organization, customRole] = await Promise.all([
      tx.organization.findUnique({ where: { id: invitation.organizationId }, select: { id: true, name: true, slug: true } }),
      invitation.customRoleId ? tx.organizationCustomRole.findFirst({ where: { id: invitation.customRoleId, organizationId: invitation.organizationId } }) : null,
    ])
    return organization ? { invitation, organization, customRole } : null
  })
}

async function createSession(app: FastifyInstance, reply: FastifyReply, user: { id: string; email: string; name: string }, organization: { id: string; name: string; slug: string }, role: string, roleLabel = role) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)
  const sessionId = randomUUID()
  const token = app.jwt.sign({ sub: user.id, sid: sessionId, organizationId: organization.id, role }, { expiresIn: `${SESSION_HOURS}h` })
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`
    await tx.session.create({ data: { id: sessionId, userId: user.id, tokenHash: hashToken(token), expiresAt } })
  })
  reply.setCookie('vstudio_session', token, { path: '/', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', expires: expiresAt })
  return { user: { id: user.id, email: user.email, name: user.name }, organization, role, roleLabel, expiresAt: expiresAt.toISOString() }
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.get('/invitations/:token', { config: { rateLimit: { max: 30, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const params = z.object({ token: z.string().min(32).max(128) }).safeParse(request.params)
    if (!params.success) return reply.code(404).send({ code: 'INVITATION_INVALID', message: 'This invitation is invalid or has expired.' })
    const result = await invitationDetails(params.data.token)
    if (!result) return reply.code(404).send({ code: 'INVITATION_INVALID', message: 'This invitation is invalid or has expired.' })
    const role = result.invitation.customRoleId ?? result.invitation.role
    return { email: result.invitation.email, role, roleLabel: result.customRole?.name ?? roleLabelFor(role), organizationName: result.organization.name, expiresAt: result.invitation.expiresAt.toISOString() }
  })

  app.post('/invitations/:token/accept', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    const params = z.object({ token: z.string().min(32).max(128) }).safeParse(request.params)
    const parsed = invitationAcceptSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.success ? 'Invitation token is invalid.' : parsed.error.issues[0]?.message ?? 'Enter your name and a password with at least 12 characters.' })
    const tokenHash = hashToken(params.data.token)
    const candidatePasswordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 })
    const result = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('app.invitation_token_hash', ${tokenHash}, true)`
      const invitation = await tx.invitation.findUnique({ where: { tokenHash } })
      if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return { invalid: true as const }
      await tx.$executeRaw`SELECT set_config('app.organization_id', ${invitation.organizationId}, true)`
      const customRole = invitation.customRoleId
        ? await tx.organizationCustomRole.findFirst({ where: { id: invitation.customRoleId, organizationId: invitation.organizationId } })
        : null
      const organization = await tx.organization.findUnique({ where: { id: invitation.organizationId }, select: { id: true, name: true, slug: true } })
      if (!organization) return { invalid: true as const }

      let user = await tx.user.findUnique({ where: { email: invitation.email } })
      if (user) {
        if (user.disabledAt || !(await argon2.verify(user.passwordHash, parsed.data.password))) return { accountMismatch: true as const }
      } else {
        user = await tx.user.create({ data: { email: invitation.email, name: parsed.data.name, passwordHash: candidatePasswordHash } })
      }

      await tx.$executeRaw`SELECT set_config('app.user_id', ${user.id}, true)`
      const existingMember = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: organization.id, userId: user.id } } })
      if (existingMember?.active) return { alreadyMember: true as const }
      const membership = await tx.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
        create: { organizationId: organization.id, userId: user.id, role: invitation.role, customRoleId: invitation.customRoleId, active: true },
        update: { role: invitation.role, customRoleId: invitation.customRoleId, active: true },
      })
      await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } })
      await tx.auditLog.create({ data: {
        organizationId: organization.id,
        actorId: user.id,
        action: 'MEMBER_JOINED',
        entityType: 'OrganizationMember',
        entityId: membership.id,
        after: { email: user.email, role: membership.customRoleId ?? membership.role, roleLabel: customRole?.name ?? roleLabelFor(invitation.role) },
      } })
      return { user: { id: user.id, email: user.email, name: user.name }, organization, role: membership.customRoleId ?? membership.role, roleLabel: customRole?.name ?? roleLabelFor(invitation.role) }
    })

    if ('invalid' in result) return reply.code(404).send({ code: 'INVITATION_INVALID', message: 'This invitation is invalid or has expired.' })
    if ('accountMismatch' in result) return reply.code(401).send({ code: 'ACCOUNT_PASSWORD_MISMATCH', message: 'An account already exists for this email. Enter that account’s password to accept the invitation.' })
    if ('alreadyMember' in result) return reply.code(409).send({ code: 'ALREADY_MEMBER', message: 'This account is already a member of the workspace.' })
    const session = await createSession(app, reply, result.user, result.organization, result.role, result.roleLabel)
    return reply.code(201).send(session)
  })

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
    const customRole = membership.customRoleId
      ? await withTenant({ organizationId: membership.organizationId, userId: user.id }, tx => tx.organizationCustomRole.findFirst({ where: { id: membership.customRoleId!, organizationId: membership.organizationId } }))
      : null
    const response = await createSession(app, reply, user, membership.organization, membership.customRoleId ?? membership.role, customRole?.name ?? roleLabelFor(membership.role))
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
    const membership = await withTenant(context, async tx => {
      const row = await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: context.userId } }, include: { user: true, organization: true, customRole: true } })
      if (!row) return null
      const role = row.customRoleId ?? row.role
      const overrides = role === 'OWNER' ? {} : Object.fromEntries((await tx.organizationRolePermission.findMany({ where: { organizationId: context.organizationId, role }, select: { permission: true, granted: true } })).map(item => [item.permission, item.granted])) as Partial<Record<Permission, boolean>>
      return { row, role, roleLabel: row.customRole?.name ?? roleLabelFor(role), permissions: [...permissionsFor(role, overrides)] }
    })
    if (!membership) return null
    const { row, role, roleLabel, permissions } = membership
    return { user: { id: row.user.id, name: row.user.name, email: row.user.email, avatarUrl: row.user.avatarUrl }, organization: { id: row.organization.id, name: row.organization.name, slug: row.organization.slug }, role, roleLabel, permissions }
  })

  app.patch('/auth/organization', { preHandler: [app.authenticate, app.requirePermission('EDIT_ORGANIZATION_SETTINGS')] }, async (request, reply) => {
    const context = request.auth!
    const parsed = organizationUpdateSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Organization details are invalid.' })

    const update = parsed.data
    if (update.slug) {
      const duplicate = await prisma.organization.findUnique({ where: { slug: update.slug } })
      if (duplicate && duplicate.id !== context.organizationId) return reply.code(409).send({ code: 'ALREADY_EXISTS', message: 'That workspace slug is already in use.' })
    }
    try {
      const organization = await withTenant(context, tx => tx.organization.update({
        where: { id: context.organizationId },
        data: {
          ...(update.name ? { name: update.name } : {}),
          ...(update.slug ? { slug: update.slug } : {}),
        },
      }))
      return { organization: { id: organization.id, name: organization.name, slug: organization.slug } }
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return reply.code(409).send({ code: 'ALREADY_EXISTS', message: 'An organization with those details already exists.' })
      throw error
    }
  })

  app.post('/auth/switch-organization', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = switchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Organization ID is invalid.' })
    const context = request.auth!
    const membership = await prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.user_id', ${context.userId}, true)`; return tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: parsed.data.organizationId, userId: context.userId } }, include: { organization: true } }) })
    if (!membership?.active) return reply.code(403).send({ code: 'FORBIDDEN', message: 'You are not a member of that organization.' })
    await withTenant(context, tx => tx.session.updateMany({ where: { id: context.sessionId }, data: { revokedAt: new Date() } }))
    const user = await prisma.user.findUniqueOrThrow({ where: { id: context.userId } })
    const customRole = membership.customRoleId
      ? await withTenant({ organizationId: membership.organizationId, userId: context.userId }, tx => tx.organizationCustomRole.findFirst({ where: { id: membership.customRoleId!, organizationId: membership.organizationId } }))
      : null
    return createSession(app, reply, user, membership.organization, membership.customRoleId ?? membership.role, customRole?.name ?? roleLabelFor(membership.role))
  })
}
