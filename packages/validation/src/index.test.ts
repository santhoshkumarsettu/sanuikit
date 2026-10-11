import { describe, expect, it } from 'vitest'
import { geometryFitsLayout, projectCreateSchema, unitCreateSchema } from './index.js'

describe('domain validation', () => {
  it('normalizes project slugs and rejects malformed identifiers', () => {
    expect(projectCreateSchema.parse({ name: '  Green Valley ', slug: 'green-valley', projectType: 'PLOT_LAYOUT' }).name).toBe('Green Valley')
    expect(projectCreateSchema.safeParse({ name: 'Green Valley', slug: '../private', projectType: 'PLOT_LAYOUT' }).success).toBe(false)
  })

  it('validates shapes against the layout coordinate space', () => {
    const rectangle = { kind: 'RECTANGLE' as const, x: 10, y: 20, width: 30, height: 40 }
    expect(geometryFitsLayout(rectangle, 100, 100)).toBe(true)
    expect(geometryFitsLayout(rectangle, 30, 100)).toBe(false)
  })

  it('requires positive inventory area and valid geometry', () => {
    const input = { layoutId: 'e2c2d0c6-1a51-4baa-8e38-c8dcb02c0653', unitNumber: 'P-101', unitType: 'PLOT', area: 0, areaUnit: 'SQFT', price: 3000000, geometry: { kind: 'RECTANGLE', x: 0, y: 0, width: 20, height: 30 } }
    expect(unitCreateSchema.safeParse(input).success).toBe(false)
  })
})
