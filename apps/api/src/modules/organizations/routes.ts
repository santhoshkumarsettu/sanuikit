import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseApiEnvironment } from '@vstudio/config'
import { organizationRoleDefinitions, permissionGroups, permissionIds, permissionsFor, type Permission } from '@vstudio/auth'
import { withTenant } from '@vstudio/database/tenant'
import { generateSecret, hashToken } from '../../lib/hash.js'

const environment = parseApiEnvironment()
const inviteSchema = z.object({
  email: z.string().trim().email().max(320).transform(value => value.toLowerCase()),
  role: z.string().trim().min(1).max(64),
})
const roleIdSchema = z.string().trim().min(1).max(64)
const customRoleSchema = z.object({
  name: z.string().trim().min(2, 'Enter a role name.').max(80),
  description: z.string().trim().max(240).optional().default(''),
})
const permissionSchema = z.enum(permissionIds as [Permission, ...Permission[]])
const rolePermissionsSchema = z.object({ permissions: z.array(permissionSchema).max(permissionIds.length) })
  .superRefine((value, context) => {
    if (new Set(value.permissions).size !== value.permissions.length) context.addIssue({ code: 'custom', message: 'A permission cannot be listed more than once.' })
  })

function permissionOverrides(rows: Array<{ role: string; permission: string; granted: boolean }>, roleId: string) {
  return Object.fromEntries(rows.filter(row => row.role === roleId).map(row => [row.permission, row.granted])) as Partial<Record<Permission, boolean>>
}

function roleNameKey(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'custom-role'
}

function isBuiltInRole(roleId: string) {
  return organizationRoleDefinitions.some(role => role.id === roleId)
}

function isRoleId(roleId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roleId)
}

export async function registerOrganizationRoutes(app: FastifyInstance) {
  app.post('/organization/roles', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async (request, reply) => {
    const parsed = customRoleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Role details are invalid.' })
    const context = request.auth!
    if (context.role !== 'OWNER') return reply.code(403).send({ code: 'OWNER_REQUIRED', message: 'Only the workspace owner can create roles.' })
    const nameKey = roleNameKey(parsed.data.name)
    if (organizationRoleDefinitions.some(role => roleNameKey(role.label) === nameKey || role.id.toLowerCase() === nameKey)) {
      return reply.code(409).send({ code: 'ROLE_NAME_RESERVED', message: 'Choose a name that does not conflict with a built-in role.' })
    }
    const created = await withTenant(context, async tx => {
      const role = await tx.organizationCustomRole.create({
        data: { organizationId: context.organizationId, name: parsed.data.name, nameKey, description: parsed.data.description },
      })
      await tx.auditLog.create({ data: {
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'CUSTOM_ROLE_CREATED',
        entityType: 'OrganizationRole',
        entityId: role.id,
        after: { name: role.name, description: role.description, permissions: [] },
        ipAddress: request.ip,
      } })
      return role
    })
    return reply.code(201).send({ role: { id: created.id, label: created.name, description: created.description, editable: true, builtIn: false, permissions: [], defaults: [] } })
  })

  app.get('/organization/role-permissions', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async request => {
    const context = request.auth!
    return withTenant(context, async tx => {
      const [rows, customRoles] = await Promise.all([
        tx.organizationRolePermission.findMany({ where: { organizationId: context.organizationId } }),
        tx.organizationCustomRole.findMany({ where: { organizationId: context.organizationId }, orderBy: { createdAt: 'asc' } }),
      ])
      return {
        permissionGroups,
        roles: [
          ...organizationRoleDefinitions.map(role => {
          const overrides = permissionOverrides(rows, role.id)
          return {
            id: role.id,
            label: role.label,
            description: role.description,
            editable: role.id !== 'OWNER' && context.role === 'OWNER',
            builtIn: true,
            permissions: [...permissionsFor(role.id, overrides)],
            defaults: [...permissionsFor(role.id)],
          }
          }),
          ...customRoles.map(role => ({
            id: role.id,
            label: role.name,
            description: role.description,
            editable: context.role === 'OWNER',
            builtIn: false,
            permissions: [...permissionsFor(role.id, permissionOverrides(rows, role.id))],
            defaults: [],
          })),
        ],
      }
    })
  })

  app.patch('/organization/role-permissions/:role', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async (request, reply) => {
    const params = z.object({ role: roleIdSchema }).safeParse(request.params)
    const body = rolePermissionsSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: !body.success ? body.error.issues[0]?.message ?? 'Permission selection is invalid.' : 'Role is invalid.' })
    const context = request.auth!
    if (context.role !== 'OWNER') return reply.code(403).send({ code: 'OWNER_REQUIRED', message: 'Only the workspace owner can change role permissions.' })
    const role = params.data.role
    if (role === 'OWNER') return reply.code(400).send({ code: 'OWNER_PERMISSIONS_LOCKED', message: 'Owner permissions are always enabled.' })
    const selected = new Set(body.data.permissions)
    const defaults = permissionsFor(role)
    const outcome = await withTenant(context, async tx => {
      const customRole = isBuiltInRole(role) || !isRoleId(role) ? null : await tx.organizationCustomRole.findFirst({ where: { id: role, organizationId: context.organizationId } })
      if (!isBuiltInRole(role) && !customRole) return false
      const before = await tx.organizationRolePermission.findMany({ where: { organizationId: context.organizationId, role } })
      await tx.organizationRolePermission.deleteMany({ where: { organizationId: context.organizationId, role } })
      const changes = permissionIds
        .filter(permission => isBuiltInRole(role) ? selected.has(permission) !== defaults.has(permission) : selected.has(permission))
        .map(permission => ({ organizationId: context.organizationId, role, permission, granted: selected.has(permission) }))
      if (changes.length) await tx.organizationRolePermission.createMany({ data: changes })
      await tx.auditLog.create({ data: {
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'ROLE_PERMISSIONS_UPDATED',
        entityType: 'OrganizationRole',
        entityId: role,
        before: { permissions: [...permissionsFor(role, Object.fromEntries(before.map(row => [row.permission, row.granted]) as [string, boolean][]))] },
        after: { permissions: [...selected] },
        ipAddress: request.ip,
      } })
      return true
    })
    if (!outcome) return reply.code(404).send({ code: 'ROLE_NOT_FOUND', message: 'That workspace role could not be found.' })

    return { role, permissions: [...selected] }
  })

  app.get('/organization/members', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async request => {
    const context = request.auth!
    const now = new Date()
    return withTenant(context, async tx => {
      const [members, invitations, customRoles, permissionRows] = await Promise.all([
        tx.organizationMember.findMany({
          where: { organizationId: context.organizationId },
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true, lastLoginAt: true } }, customRole: true },
          orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
        }),
        tx.invitation.findMany({
          where: { organizationId: context.organizationId, acceptedAt: null, expiresAt: { gt: now } },
          include: { invitedBy: { select: { name: true } }, customRole: true },
          orderBy: { expiresAt: 'asc' },
        }),
        tx.organizationCustomRole.findMany({ where: { organizationId: context.organizationId }, orderBy: { name: 'asc' } }),
        tx.organizationRolePermission.findMany({ where: { organizationId: context.organizationId } }),
      ])
      const roleOptions = [
        ...organizationRoleDefinitions.filter(role => role.id !== 'OWNER').map(role => ({
          id: role.id,
          label: role.label,
          assignable: context.role === 'OWNER' || !permissionsFor(role.id, permissionOverrides(permissionRows, role.id)).has('MANAGE_USERS'),
        })),
        ...customRoles.map(role => ({
          id: role.id,
          label: role.name,
          assignable: context.role === 'OWNER' || !permissionsFor(role.id, permissionOverrides(permissionRows, role.id)).has('MANAGE_USERS'),
        })),
      ]
      return {
        roleOptions,
        members: members.map(member => ({
          id: member.id,
          userId: member.user.id,
          name: member.user.name,
          email: member.user.email,
          avatarUrl: member.user.avatarUrl,
          role: member.customRoleId ?? member.role,
          roleLabel: member.customRole?.name ?? organizationRoleDefinitions.find(role => role.id === member.role)?.label ?? member.role,
          roleIsPrivileged: member.role === 'ADMIN' || permissionsFor(member.customRoleId ?? member.role, permissionOverrides(permissionRows, member.customRoleId ?? member.role)).has('MANAGE_USERS'),
          active: member.active,
          joinedAt: member.createdAt.toISOString(),
          lastLoginAt: member.user.lastLoginAt?.toISOString() ?? null,
        })),
        invitations: invitations.map(invitation => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.customRoleId ?? invitation.role,
          roleLabel: invitation.customRole?.name ?? organizationRoleDefinitions.find(role => role.id === invitation.role)?.label ?? invitation.role,
          expiresAt: invitation.expiresAt.toISOString(),
          invitedBy: invitation.invitedBy.name,
        })),
      }
    })
  })

  app.patch('/organization/members/:memberId', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async (request, reply) => {
    const params = z.object({ memberId: z.string().uuid() }).safeParse(request.params)
    const body = z.object({ role: roleIdSchema.optional(), active: z.boolean().optional() })
      .refine(value => value.role !== undefined || value.active !== undefined, { message: 'Choose a role or active state to update.' })
      .safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Member update details are invalid.' })
    const context = request.auth!
    const outcome = await withTenant(context, async tx => {
      const member = await tx.organizationMember.findFirst({ where: { id: params.data.memberId, organizationId: context.organizationId }, include: { user: { select: { name: true, email: true } }, customRole: true } })
      if (!member) return { notFound: true as const }
      if (member.role === 'OWNER') return { owner: true as const }
      if (member.userId === context.userId && body.data.active === false) return { self: true as const }
      const currentRoleId = member.customRoleId ?? member.role
      const permissionRows = await tx.organizationRolePermission.findMany({ where: { organizationId: context.organizationId } })
      const currentRoleIsPrivileged = member.role === 'ADMIN' || permissionsFor(currentRoleId, permissionOverrides(permissionRows, currentRoleId)).has('MANAGE_USERS')
      let targetRole: { id: string; label: string; builtIn: boolean } | null = null
      let targetRoleIsPrivileged = false
      if (body.data.role) {
        const builtIn = organizationRoleDefinitions.find(role => role.id === body.data.role && role.id !== 'OWNER')
        const custom = builtIn || !isRoleId(body.data.role) ? null : await tx.organizationCustomRole.findFirst({ where: { id: body.data.role, organizationId: context.organizationId } })
        if (!builtIn && !custom) return { invalidRole: true as const }
        targetRole = builtIn
          ? { id: builtIn.id, label: builtIn.label, builtIn: true }
          : { id: custom!.id, label: custom!.name, builtIn: false }
        targetRoleIsPrivileged = permissionsFor(targetRole.id, permissionOverrides(permissionRows, targetRole.id)).has('MANAGE_USERS')
        if (targetRole.id === 'ADMIN') targetRoleIsPrivileged = true
      }
      if (context.role !== 'OWNER' && (currentRoleIsPrivileged || targetRoleIsPrivileged)) return { role: true as const }
      if (body.data.active === false && member.active && await tx.organizationMember.count({ where: { organizationId: context.organizationId, role: 'OWNER', active: true } }) === 0) return { lastOwner: true as const }

      const updated = await tx.organizationMember.update({ where: { id: member.id }, data: {
        ...(targetRole ? { role: targetRole.builtIn ? targetRole.id as 'ADMIN' | 'EDITOR' | 'SALES' | 'VIEWER' : 'VIEWER', customRoleId: targetRole.builtIn ? null : targetRole.id } : {}),
        ...(body.data.active !== undefined ? { active: body.data.active } : {}),
      } })
      const action = targetRole && targetRole.id !== currentRoleId ? 'MEMBER_ROLE_CHANGED' : body.data.active === false ? 'MEMBER_DEACTIVATED' : body.data.active === true ? 'MEMBER_REACTIVATED' : 'MEMBER_UPDATED'
      await tx.auditLog.create({ data: {
        organizationId: context.organizationId,
        actorId: context.userId,
        action,
        entityType: 'OrganizationMember',
        entityId: member.id,
        before: { email: member.user.email, role: currentRoleId, active: member.active },
        after: { email: member.user.email, role: targetRole?.id ?? currentRoleId, active: updated.active },
        ipAddress: request.ip,
      } })
      return { updated: true as const }
    })
    if ('notFound' in outcome) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Member not found.' })
    if ('owner' in outcome) return reply.code(403).send({ code: 'OWNER_PROTECTED', message: 'The organization owner cannot be changed or deactivated here.' })
    if ('self' in outcome) return reply.code(409).send({ code: 'SELF_DEACTIVATION', message: 'You cannot deactivate your own account.' })
    if ('invalidRole' in outcome) return reply.code(400).send({ code: 'ROLE_INVALID', message: 'Choose a role from this workspace.' })
    if ('role' in outcome) return reply.code(403).send({ code: 'ROLE_ASSIGNMENT_FORBIDDEN', message: 'Only an owner can manage administrator access.' })
    if ('lastOwner' in outcome) return reply.code(409).send({ code: 'LAST_OWNER', message: 'The organization must have at least one active owner.' })
    return { success: true }
  })

  app.post('/organization/invitations', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async (request, reply) => {
    const parsed = inviteSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message ?? 'Invitation details are invalid.' })
    const context = request.auth!

    const now = new Date()
    const token = generateSecret()
    const invitation = await withTenant(context, async tx => {
      const builtIn = organizationRoleDefinitions.find(role => role.id === parsed.data.role && role.id !== 'OWNER')
      const custom = builtIn || !isRoleId(parsed.data.role) ? null : await tx.organizationCustomRole.findFirst({ where: { id: parsed.data.role, organizationId: context.organizationId } })
      if (!builtIn && !custom) return { invalidRole: true as const }
      const permissionRows = await tx.organizationRolePermission.findMany({ where: { organizationId: context.organizationId } })
      const roleId = custom?.id ?? builtIn!.id
      const privileged = roleId === 'ADMIN' || permissionsFor(roleId, permissionOverrides(permissionRows, roleId)).has('MANAGE_USERS')
      if (context.role !== 'OWNER' && privileged) return { roleForbidden: true as const }
      const user = await tx.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })
      const existingMember = user ? await tx.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: context.organizationId, userId: user.id } } }) : null
      if (existingMember?.active) return { alreadyMember: true as const }
      const pending = await tx.invitation.findFirst({ where: { organizationId: context.organizationId, email: parsed.data.email, acceptedAt: null, expiresAt: { gt: now } } })
      if (pending) return { alreadyInvited: true as const }

      await tx.invitation.deleteMany({ where: { organizationId: context.organizationId, email: parsed.data.email } })
      const created = await tx.invitation.create({
        data: {
          organizationId: context.organizationId,
          invitedById: context.userId,
          email: parsed.data.email,
          role: custom ? 'VIEWER' : builtIn!.id as 'ADMIN' | 'EDITOR' | 'SALES' | 'VIEWER',
          customRoleId: custom?.id ?? null,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      })
      await tx.auditLog.create({ data: {
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'MEMBER_INVITED',
        entityType: 'Invitation',
        entityId: created.id,
        after: { email: created.email, role: roleId, roleLabel: custom?.name ?? builtIn!.label, expiresAt: created.expiresAt.toISOString() },
        ipAddress: request.ip,
      } })
      return { invitation: created, roleId, roleLabel: custom?.name ?? builtIn!.label }
    })

    if ('invalidRole' in invitation) return reply.code(400).send({ code: 'ROLE_INVALID', message: 'Choose a role from this workspace.' })
    if ('roleForbidden' in invitation) return reply.code(403).send({ code: 'ROLE_ASSIGNMENT_FORBIDDEN', message: 'Only an organization owner can invite an administrator or a role with member management access.' })
    if ('alreadyMember' in invitation) return reply.code(409).send({ code: 'ALREADY_MEMBER', message: 'This person is already a member of the workspace.' })
    if ('alreadyInvited' in invitation) return reply.code(409).send({ code: 'INVITATION_PENDING', message: 'A valid invitation already exists for this email.' })
    return reply.code(201).send({
      invitation: {
        id: invitation.invitation.id,
        email: invitation.invitation.email,
        role: invitation.roleId,
        roleLabel: invitation.roleLabel,
        expiresAt: invitation.invitation.expiresAt.toISOString(),
        inviteUrl: `${environment.ADMIN_ORIGIN}/invite?token=${encodeURIComponent(token)}`,
      },
    })
  })

  app.delete('/organization/invitations/:invitationId', { preHandler: [app.authenticate, app.requirePermission('MANAGE_USERS')] }, async (request, reply) => {
    const params = z.object({ invitationId: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: 'Invitation ID is invalid.' })
    const context = request.auth!
    const removed = await withTenant(context, async tx => {
      const invitation = await tx.invitation.findFirst({ where: { id: params.data.invitationId, organizationId: context.organizationId, acceptedAt: null } })
      if (!invitation) return false
      await tx.invitation.delete({ where: { id: invitation.id } })
      await tx.auditLog.create({ data: {
        organizationId: context.organizationId,
        actorId: context.userId,
        action: 'INVITATION_REVOKED',
        entityType: 'Invitation',
        entityId: invitation.id,
        before: { email: invitation.email, role: invitation.role },
        ipAddress: request.ip,
      } })
      return true
    })
    if (!removed) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Pending invitation not found.' })
    return reply.code(204).send()
  })
}
