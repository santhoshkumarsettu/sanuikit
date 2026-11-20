import type { Prisma } from '@vstudio/database/client'

export function publicConfigObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

// Serialize read-modify-write updates to the project's public settings and logo.
export async function lockProject(tx: Prisma.TransactionClient, projectId: string, organizationId: string) {
  const [locked] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM projects
    WHERE id = ${projectId}::uuid AND organization_id = ${organizationId}::uuid
    FOR UPDATE
  `
  return locked ? tx.project.findUnique({ where: { id: locked.id } }) : null
}
