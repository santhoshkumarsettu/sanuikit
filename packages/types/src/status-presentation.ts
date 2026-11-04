import type { UnitStatus } from './index.js'

export const UNIT_STATUS_PRESENTATION: Record<UnitStatus, { label: string; fill: string; text: string }> = {
  AVAILABLE: { label: 'Available', fill: '#10b98166', text: '#065f46' },
  RESERVED: { label: 'Reserved', fill: '#f59e0b66', text: '#92400e' },
  BOOKED: { label: 'Booked', fill: '#3b82f666', text: '#1e40af' },
  SOLD: { label: 'Sold', fill: '#ef444466', text: '#991b1b' },
  BLOCKED: { label: 'Blocked', fill: '#8b5cf666', text: '#5b21b6' },
  OFF_MARKET: { label: 'Off market', fill: '#6b728066', text: '#374151' },
}
