import { describe, expect, it } from 'vitest'
import { canTransitionUnitStatus } from './status.js'

describe('unit status transitions', () => {
  it('allows the reservation and sale lifecycle', () => {
    expect(canTransitionUnitStatus('AVAILABLE', 'RESERVED')).toBe(true)
    expect(canTransitionUnitStatus('RESERVED', 'BOOKED')).toBe(true)
    expect(canTransitionUnitStatus('BOOKED', 'SOLD')).toBe(true)
  })
  it('rejects invalid and terminal transitions', () => {
    expect(canTransitionUnitStatus('AVAILABLE', 'SOLD')).toBe(false)
    expect(canTransitionUnitStatus('SOLD', 'AVAILABLE')).toBe(false)
  })
  it('allows cancellation to restore a reserved unit', () => {
    expect(canTransitionUnitStatus('RESERVED', 'AVAILABLE')).toBe(true)
  })
})
