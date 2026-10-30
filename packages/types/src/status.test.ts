import { describe, expect, it } from 'vitest'
import { canTransitionUnitStatus } from './status.js'

describe('unit lifecycle', () => {
  it('allows reservation and sale transitions', () => {
    expect(canTransitionUnitStatus('AVAILABLE', 'RESERVED')).toBe(true)
    expect(canTransitionUnitStatus('RESERVED', 'BOOKED')).toBe(true)
    expect(canTransitionUnitStatus('BOOKED', 'SOLD')).toBe(true)
  })
  it('allows a direct sale and keeps sold units terminal', () => {
    expect(canTransitionUnitStatus('AVAILABLE', 'SOLD')).toBe(true)
    expect(canTransitionUnitStatus('RESERVED', 'SOLD')).toBe(true)
    expect(canTransitionUnitStatus('SOLD', 'AVAILABLE')).toBe(false)
  })
})
