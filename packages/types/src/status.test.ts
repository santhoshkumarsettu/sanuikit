import { describe, expect, it } from 'vitest'
import { canTransitionUnitStatus } from './status.js'

describe('unit lifecycle', () => {
  it('allows reservation and sale transitions', () => {
    expect(canTransitionUnitStatus('AVAILABLE', 'RESERVED')).toBe(true)
    expect(canTransitionUnitStatus('RESERVED', 'BOOKED')).toBe(true)
    expect(canTransitionUnitStatus('BOOKED', 'SOLD')).toBe(true)
  })
  it('rejects skipping reservations and reviving a sold unit', () => {
    expect(canTransitionUnitStatus('AVAILABLE', 'SOLD')).toBe(false)
    expect(canTransitionUnitStatus('SOLD', 'AVAILABLE')).toBe(false)
  })
})
