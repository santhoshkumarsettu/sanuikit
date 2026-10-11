import { Redis } from 'ioredis'
import { parseApiEnvironment } from '@vstudio/config'

const env = parseApiEnvironment()
const publisher = env.REDIS_URL ? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }) : undefined
export const eventChannel = (organizationId: string) => `vstudio:org:${organizationId}:events`
export async function publishOrganizationEvent(organizationId: string, event: { type: string; id?: string; data?: unknown; occurredAt?: string }) {
  if (!publisher) return false
  await publisher.publish(eventChannel(organizationId), JSON.stringify({ ...event, occurredAt: event.occurredAt ?? new Date().toISOString() }))
  return true
}
export async function closeEventPublisher() { await publisher?.quit() }
