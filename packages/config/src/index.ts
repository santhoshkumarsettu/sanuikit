import { z } from 'zod'

const optionalUrl = z.string().url().optional()
export const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'), PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  TRUST_PROXY: z.string().optional(),
  DATABASE_URL: z.string().min(1), JWT_SECRET: z.string().min(32),
  ADMIN_ORIGIN: optionalUrl.default('http://localhost:3000'), PUBLIC_ORIGIN: optionalUrl.default('http://localhost:3001'),
  REDIS_URL: optionalUrl, OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  STORAGE_ENDPOINT: optionalUrl, STORAGE_REGION: z.string().default('us-east-1'), STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(), STORAGE_SECRET_KEY: z.string().optional(), STORAGE_PUBLIC_BASE_URL: optionalUrl,
})

export type ApiEnvironment = z.infer<typeof apiEnvSchema>
export function parseApiEnvironment(env: NodeJS.ProcessEnv = process.env): ApiEnvironment { const parsed = apiEnvSchema.safeParse(env); if (!parsed.success) throw new Error(`Invalid API environment configuration: ${z.prettifyError(parsed.error)}`); return parsed.data }
