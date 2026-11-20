import { describe, expect, it } from 'vitest'
import { fitBounds, fittedViewport, geometryBounds, revealBounds, screenToWorld, zoomAt } from './geometry.js'

describe('map geometry', () => {
  it('converts client coordinates into layout coordinates', () => {
    expect(screenToWorld(150, 100, { left: 50, top: 50, width: 200, height: 100 }, { x: 100, y: 200, width: 800, height: 400 })).toEqual({ x: 500, y: 400 })
  })

  it('accounts for the gutters around an aspect-fitted map', () => {
    const viewBox = { x: 100, y: 200, width: 800, height: 400 }
    const viewport = fittedViewport({ left: 50, top: 50, width: 200, height: 200 }, viewBox)
    expect(viewport).toEqual({ left: 50, top: 100, width: 200, height: 100 })
    expect(screenToWorld(150, 125, viewport, viewBox)).toEqual({ x: 500, y: 300 })
    expect(fittedViewport({ left: 50, top: 50, width: 300, height: 100 }, viewBox))
      .toEqual({ left: 100, top: 50, width: 200, height: 100 })
  })

  it('reveals an off-screen shape and preserves the camera scale where possible', () => {
    const viewBox = { x: 0, y: 0, width: 100, height: 70 }
    expect(revealBounds(viewBox, { x: 1, y: 1, width: 30, height: 40 })).toBe(viewBox)
    expect(revealBounds(viewBox, { x: 200, y: 50, width: 20, height: 20 }))
      .toEqual({ x: 160, y: 25, width: 100, height: 70 })
    const zoomedOut = revealBounds(viewBox, { x: 200, y: 50, width: 130, height: 20 })
    expect(zoomedOut.width).toBeGreaterThan(130)
    expect(zoomedOut.width / zoomedOut.height).toBeCloseTo(100 / 70)
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
