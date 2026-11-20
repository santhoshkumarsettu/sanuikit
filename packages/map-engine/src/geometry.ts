import type { Point, UnitGeometry } from '@vstudio/types'

export interface ViewBox { x: number; y: number; width: number; height: number }
type Viewport = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

/** Keep pointer-derived geometry inside the uploaded layout's coordinate space. */
export function clampPointToLayout(point: Point, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y)),
  }
}

/** The area occupied by an SVG viewBox using xMidYMid meet. */
export function fittedViewport(rect: Viewport, viewBox: ViewBox): Viewport {
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height)
  const width = viewBox.width * scale
  const height = viewBox.height * scale
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  }
}

export function screenToWorld(clientX: number, clientY: number, rect: Viewport, viewBox: ViewBox): Point {
  return { x: viewBox.x + (clientX - rect.left) * viewBox.width / rect.width, y: viewBox.y + (clientY - rect.top) * viewBox.height / rect.height }
}

export function geometryBounds(geometry: UnitGeometry): ViewBox {
  if (geometry.kind === 'RECTANGLE') return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }
  const xs = geometry.points.map(point => point.x)
  const ys = geometry.points.map(point => point.y)
  const minX = Math.min(...xs); const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
}

/** Keep the user's zoom unless the selected bounds need more space. */
export function revealBounds(viewBox: ViewBox, bounds: ViewBox): ViewBox {
  if (
    bounds.x >= viewBox.x && bounds.y >= viewBox.y &&
    bounds.x + bounds.width <= viewBox.x + viewBox.width &&
    bounds.y + bounds.height <= viewBox.y + viewBox.height
  ) return viewBox

  const scale = Math.max(1, bounds.width * 1.15 / viewBox.width, bounds.height * 1.15 / viewBox.height)
  const width = viewBox.width * scale
  const height = viewBox.height * scale
  return {
    x: bounds.x + (bounds.width - width) / 2,
    y: bounds.y + (bounds.height - height) / 2,
    width,
    height,
  }
}

/** Translate a whole shape without allowing any part of it to leave the layout. */
export function translateGeometryWithinLayout(
  geometry: UnitGeometry,
  delta: Point,
  width: number,
  height: number,
): UnitGeometry {
  const bounds = geometryBounds(geometry)
  const minX = -bounds.x
  const maxX = width - bounds.x - bounds.width
  const minY = -bounds.y
  const maxY = height - bounds.y - bounds.height
  const dx = maxX < minX ? 0 : Math.max(minX, Math.min(maxX, delta.x))
  const dy = maxY < minY ? 0 : Math.max(minY, Math.min(maxY, delta.y))

  if (geometry.kind === 'RECTANGLE') {
    return { ...geometry, x: geometry.x + dx, y: geometry.y + dy }
  }
  return {
    ...geometry,
    points: geometry.points.map(point => ({ x: point.x + dx, y: point.y + dy })),
  }
}

export function zoomAt(viewBox: ViewBox, point: Point, factor: number, minSize = 40, maxSize = 100_000): ViewBox {
  const width = Math.min(maxSize, Math.max(minSize, viewBox.width * factor))
  const height = Math.min(maxSize, Math.max(minSize, viewBox.height * factor))
  const rx = (point.x - viewBox.x) / viewBox.width; const ry = (point.y - viewBox.y) / viewBox.height
  return { x: point.x - rx * width, y: point.y - ry * height, width, height }
}

export function fitBounds(bounds: ViewBox, viewportWidth: number, viewportHeight: number, padding = 0.04): ViewBox {
  const width = bounds.width * (1 + padding * 2); const height = bounds.height * (1 + padding * 2)
  const aspect = viewportWidth / viewportHeight
  const adjustedWidth = Math.max(width, height * aspect); const adjustedHeight = Math.max(height, width / aspect)
  return { x: bounds.x - (adjustedWidth - bounds.width) / 2, y: bounds.y - (adjustedHeight - bounds.height) / 2, width: adjustedWidth, height: adjustedHeight }
}

export function closePolygon(points: Point[], tolerance = 5): boolean {
  if (points.length < 3) return false
  const first = points[0]!; const last = points[points.length - 1]!
  return Math.hypot(first.x - last.x, first.y - last.y) <= tolerance
}
