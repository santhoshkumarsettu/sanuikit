import type { OrganizationRole } from '@vstudio/types'
import type { Permission } from '@vstudio/auth'
import 'fastify'

declare module 'fastify' {
  interface FastifyRequest { auth: { userId: string; organizationId: string; role: string; sessionId: string } | null }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    requirePermission: (permission: Permission) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}
