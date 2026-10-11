import type { Point, UnitGeometry } from '@vstudio/types'

export interface ViewBox { x: number; y: number; width: number; height: number }

export function screenToWorld(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, viewBox: ViewBox): Point {
  return { x: viewBox.x + (clientX - rect.left) * viewBox.width / rect.width, y: viewBox.y + (clientY - rect.top) * viewBox.height / rect.height }
}

export function geometryBounds(geometry: UnitGeometry): ViewBox {
  if (geometry.kind === 'RECTANGLE') return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height }
  const xs = geometry.points.map(point => point.x)
  const ys = geometry.points.map(point => point.y)
  const minX = Math.min(...xs); const minY = Math.min(...ys)
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
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
