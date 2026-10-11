import { PrismaClient } from '../generated/index.js'

export const prisma = new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] })

export async function withTenant(context, operation) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.organization_id', ${context.organizationId}, true)`
    if (context.userId) await tx.$executeRaw`SELECT set_config('app.user_id', ${context.userId}, true)`
    return operation(tx)
  }, { maxWait: 5_000, timeout: 15_000 })
}
