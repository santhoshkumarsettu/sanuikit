import type { UnitStatus } from './index.js'

export const UNIT_STATUS_PRESENTATION: Record<UnitStatus, { label: string; fill: string; text: string }> = {
  AVAILABLE: { label: 'Available', fill: '#53a27680', text: '#286347' },
  RESERVED: { label: 'Reserved', fill: '#e5b54d88', text: '#785719' },
  BOOKED: { label: 'Booked', fill: '#8097d080', text: '#394c85' },
  SOLD: { label: 'Sold', fill: '#9da69f80', text: '#4c5650' },
  BLOCKED: { label: 'Blocked', fill: '#d5877d88', text: '#813b32' },
  OFF_MARKET: { label: 'Off market', fill: '#9b8ab180', text: '#594d70' },
}
