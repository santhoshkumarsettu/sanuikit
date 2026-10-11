import type { Prisma, PrismaClient } from '../generated/index.js'

export declare const prisma: PrismaClient
export interface TenantContext { organizationId: string; userId?: string }
export declare function withTenant<T>(context: TenantContext, operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>
