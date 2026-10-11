import { describe, expect, it } from 'vitest'
import { fitBounds, geometryBounds, screenToWorld, zoomAt } from './geometry.js'

describe('map geometry', () => {
  it('converts client coordinates into layout coordinates', () => {
    expect(screenToWorld(150, 100, { left: 50, top: 50, width: 200, height: 100 }, { x: 100, y: 200, width: 800, height: 400 })).toEqual({ x: 500, y: 400 })
  })

  it('calculates polygon bounds and fits them into a viewport', () => {
    const bounds = geometryBounds({ kind: 'POLYGON', points: [{ x: 20, y: 10 }, { x: 80, y: 15 }, { x: 70, y: 40 }] })
    expect(bounds).toEqual({ x: 20, y: 10, width: 60, height: 30 })
    const fitted = fitBounds(bounds, 600, 400)
    expect(fitted.x).toBeLessThan(bounds.x)
    expect(fitted.width).toBeGreaterThan(bounds.width)
  })

  it('keeps the chosen world point fixed while zooming', () => {
    const initial = { x: 0, y: 0, width: 100, height: 100 }
    const zoomed = zoomAt(initial, { x: 25, y: 75 }, 0.5)
    expect(zoomed).toEqual({ x: 12.5, y: 37.5, width: 50, height: 50 })
  })
})
