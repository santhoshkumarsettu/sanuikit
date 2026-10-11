import type { UnitStatus } from './index.js'

const transitions: Record<UnitStatus, ReadonlySet<UnitStatus>> = {
  AVAILABLE: new Set(['RESERVED', 'BLOCKED', 'OFF_MARKET']),
  RESERVED: new Set(['AVAILABLE', 'BOOKED', 'BLOCKED']),
  BOOKED: new Set(['AVAILABLE', 'SOLD']),
  SOLD: new Set(),
  BLOCKED: new Set(['AVAILABLE', 'OFF_MARKET']),
  OFF_MARKET: new Set(['AVAILABLE', 'BLOCKED']),
}

export function canTransitionUnitStatus(from: UnitStatus, to: UnitStatus): boolean { return from === to || transitions[from].has(to) }
export function assertUnitStatusTransition(from: UnitStatus, to: UnitStatus): void {
  if (!canTransitionUnitStatus(from, to)) { const error = new Error(`Cannot transition a unit from ${from} to ${to}.`); error.name = 'InvalidStatusTransitionError'; throw error }
}
export function allowedUnitStatuses(from: UnitStatus): ReadonlySet<UnitStatus> { return new Set([from, ...transitions[from]]) }
