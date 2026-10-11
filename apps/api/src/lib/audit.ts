import type { Prisma } from '@vstudio/database/client'
import type { TenantContext } from '@vstudio/database/tenant'
import { withTenant } from '@vstudio/database/tenant'

export async function recordAudit(context: TenantContext, data: { actorId?: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: unknown; ipAddress?: string }) {
  return withTenant(context, tx => tx.auditLog.create({ data: {
    organizationId: context.organizationId, actorId: data.actorId, action: data.action, entityType: data.entityType,
    entityId: data.entityId, before: data.before as Prisma.InputJsonValue | undefined,
    after: data.after as Prisma.InputJsonValue | undefined, metadata: (data.metadata ?? {}) as Prisma.InputJsonValue,
    ipAddress: data.ipAddress,
  } }))
}
