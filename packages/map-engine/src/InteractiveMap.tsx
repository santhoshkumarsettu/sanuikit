'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type WheelEvent } from 'react'
import type { Point, UnitGeometry } from '@vstudio/types'
import { screenToWorld, zoomAt, type ViewBox } from './geometry.js'

export type DrawingTool = 'select' | 'pan' | 'rectangle' | 'polygon' | 'edit'
export interface MapShape { id: string; geometry: UnitGeometry; label?: string; fill?: string; stroke?: string }
export interface InteractiveMapProps {
  width: number; height: number; backgroundUrl?: string; shapes: MapShape[]; selectedId?: string; focusId?: string; selectionPopover?: ReactNode; tool: DrawingTool
  onSelect?: (id: string | undefined) => void; onCreate?: (geometry: UnitGeometry) => void
  onGeometryChange?: (id: string, geometry: UnitGeometry) => void; className?: string; ariaLabel?: string
}

export function InteractiveMap({ width, height, backgroundUrl, shapes, selectedId, focusId, selectionPopover, tool, onSelect, onCreate, onGeometryChange, className = '', ariaLabel = 'Interactive property layout' }: InteractiveMapProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const mapRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const shapesRef = useRef(shapes)
  shapesRef.current = shapes
  const [viewBox, setViewBox] = useState<ViewBox>({ x: 0, y: 0, width, height })
  const viewBoxRef = useRef(viewBox)
  viewBoxRef.current = viewBox
  const [popoverPosition, setPopoverPosition] = useState({ left: 12, top: 12, arrowX: 50, direction: 'is-above' })
  const [origin, setOrigin] = useState<Point>()
  const [cursor, setCursor] = useState<Point>()
  const [polygon, setPolygon] = useState<Point[]>([])
  const [panOrigin, setPanOrigin] = useState<{ clientX: number; clientY: number; box: ViewBox }>()
  const [dragVertex, setDragVertex] = useState<{ id: string; index: number }>()
  const selected = shapes.find(shape => shape.id === selectedId)
  useEffect(() => {
    if (!focusId) return
    const shape = shapesRef.current.find(item => item.id === focusId)
    if (!shape) return
    const bounds = shape.geometry.kind === 'RECTANGLE'
      ? { x: shape.geometry.x, y: shape.geometry.y, width: shape.geometry.width, height: shape.geometry.height }
      : {
          x: Math.min(...shape.geometry.points.map(point => point.x)),
          y: Math.min(...shape.geometry.points.map(point => point.y)),
          width: Math.max(...shape.geometry.points.map(point => point.x)) - Math.min(...shape.geometry.points.map(point => point.x)),
          height: Math.max(...shape.geometry.points.map(point => point.y)) - Math.min(...shape.geometry.points.map(point => point.y)),
        }
    const currentView = viewBoxRef.current
    const targetWidth = Math.min(width, Math.max(bounds.width * 3.5, Math.min(currentView.width, width * 0.62)))
    const targetHeight = Math.min(height, Math.max(bounds.height * 3.5, Math.min(currentView.height, height * 0.62)))
    const centerX = shape.geometry.kind === 'RECTANGLE'
      ? bounds.x + bounds.width / 2
      : shape.geometry.points.reduce((sum, point) => sum + point.x, 0) / shape.geometry.points.length
    const centerY = shape.geometry.kind === 'RECTANGLE'
      ? bounds.y + bounds.height / 2
      : shape.geometry.points.reduce((sum, point) => sum + point.y, 0) / shape.geometry.points.length
    setViewBox({
      x: Math.max(0, Math.min(width - targetWidth, centerX - targetWidth / 2)),
      y: Math.max(0, Math.min(height - targetHeight, centerY - targetHeight / 2)),
      width: targetWidth,
      height: targetHeight,
    })
  }, [focusId, height, width])
  const worldPoint = (event: PointerEvent<SVGSVGElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return screenToWorld(event.clientX, event.clientY, rect, viewBox) }
  const startCapture = (event: PointerEvent<SVGSVGElement>) => event.currentTarget.setPointerCapture(event.pointerId)
  const finishRectangle = (end: Point) => { if (!origin || !onCreate) return; const x = Math.min(origin.x, end.x); const y = Math.min(origin.y, end.y); const rectWidth = Math.abs(end.x - origin.x); const rectHeight = Math.abs(end.y - origin.y); if (rectWidth >= 3 && rectHeight >= 3) onCreate({ kind: 'RECTANGLE', x, y, width: rectWidth, height: rectHeight }); setOrigin(undefined); setCursor(undefined) }
  const finishPolygon = () => { if (polygon.length >= 3) onCreate?.({ kind: 'POLYGON', points: polygon }); setPolygon([]) }
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    const point = worldPoint(event)
    if (tool === 'pan' || event.button === 1 || event.shiftKey) { startCapture(event); setPanOrigin({ clientX: event.clientX, clientY: event.clientY, box: viewBox }); return }
    if (tool === 'rectangle') { startCapture(event); setOrigin(point); setCursor(point); return }
    if (tool === 'polygon') { if (event.detail >= 2 && polygon.length >= 3) { finishPolygon(); return } setPolygon(current => [...current, point]); return }
    if (tool === 'select') onSelect?.(undefined)
  }
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = worldPoint(event)
    if (panOrigin) { const rect = event.currentTarget.getBoundingClientRect(); setViewBox({ ...panOrigin.box, x: panOrigin.box.x - (event.clientX - panOrigin.clientX) * panOrigin.box.width / rect.width, y: panOrigin.box.y - (event.clientY - panOrigin.clientY) * panOrigin.box.height / rect.height }); return }
    if (origin) { setCursor(point); return }
    if (dragVertex && selected?.geometry.kind === 'POLYGON') { const points = selected.geometry.points.map((item, index) => index === dragVertex.index ? point : item); onGeometryChange?.(dragVertex.id, { kind: 'POLYGON', points }) }
  }
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => { if (origin) finishRectangle(worldPoint(event)); setPanOrigin(undefined); setDragVertex(undefined) }
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const point = screenToWorld(event.clientX, event.clientY, rect, viewBox); setViewBox(current => zoomAt(current, point, event.deltaY < 0 ? 0.85 : 1.18)) }
  const fit = useCallback(() => setViewBox({ x: 0, y: 0, width, height }), [width, height])
  const draftRectangle = useMemo(() => origin && cursor ? { x: Math.min(origin.x, cursor.x), y: Math.min(origin.y, cursor.y), width: Math.abs(cursor.x - origin.x), height: Math.abs(cursor.y - origin.y) } : undefined, [origin, cursor])
  useLayoutEffect(() => {
    if (!selected || !selectionPopover) return
    const map = mapRef.current
    const popoverElement = popoverRef.current
    if (!map || !popoverElement) return
    const place = () => {
      const mapRect = map.getBoundingClientRect()
      const popoverRect = popoverElement.getBoundingClientRect()
      if (!mapRect.width || !mapRect.height || !popoverRect.width || !popoverRect.height) return
      const center = selected.geometry.kind === 'RECTANGLE'
        ? { x: selected.geometry.x + selected.geometry.width / 2, y: selected.geometry.y + selected.geometry.height / 2 }
        : { x: selected.geometry.points.reduce((sum, point) => sum + point.x, 0) / selected.geometry.points.length, y: selected.geometry.points.reduce((sum, point) => sum + point.y, 0) / selected.geometry.points.length }
      const centerX = (center.x - viewBox.x) / viewBox.width * mapRect.width
      const centerY = (center.y - viewBox.y) / viewBox.height * mapRect.height
      const width = Math.min(popoverRect.width, mapRect.width - 24)
      const height = Math.min(popoverRect.height, mapRect.height - 24)
      const left = Math.max(12, Math.min(mapRect.width - width - 12, centerX - width / 2))
      const canFitAbove = centerY >= height + 18
      const canFitBelow = mapRect.height - centerY >= height + 18
      const isAbove = canFitAbove || !canFitBelow
      const top = Math.max(12, Math.min(mapRect.height - height - 12, isAbove ? centerY - height - 18 : centerY + 18))
      const arrowX = Math.max(8, Math.min(92, ((centerX - left) / width) * 100))
      const direction = isAbove ? 'is-above' : 'is-below'
      setPopoverPosition(current => Math.abs(current.left - left) < 0.5 && Math.abs(current.top - top) < 0.5 && Math.abs(current.arrowX - arrowX) < 0.5 && current.direction === direction ? current : { left, top, arrowX, direction })
    }
    place()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(place)
    observer.observe(map)
    observer.observe(popoverElement)
    window.addEventListener('resize', place)
    return () => { observer.disconnect(); window.removeEventListener('resize', place) }
  }, [selected, selectionPopover, viewBox])
  return <div ref={mapRef} className={`vstudio-map ${className}`}>
    <div className="vstudio-map__viewport-tools" aria-label="Map zoom controls"><button type="button" onClick={() => setViewBox(box => zoomAt(box, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 0.8))} aria-label="Zoom in">+</button><button type="button" onClick={() => setViewBox(box => zoomAt(box, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 1.25))} aria-label="Zoom out">−</button><button type="button" onClick={fit}>Fit</button></div>
    <svg ref={svgRef} className={`vstudio-map__svg is-${tool}`} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} preserveAspectRatio="none" role="application" aria-label={ariaLabel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} onWheel={handleWheel} onDoubleClick={() => tool === 'polygon' && finishPolygon()}>
      {backgroundUrl ? <image href={backgroundUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" pointerEvents="none" /> : <rect x={0} y={0} width={width} height={height} fill="#f5f7f4" pointerEvents="none" />}
      {shapes.map(shape => <g key={shape.id} onPointerDown={event => { if (tool === 'select') { event.stopPropagation(); onSelect?.(shape.id) } }} className={`vstudio-map__shape${selectedId === shape.id ? ' is-selected' : ''}`}>
        {shape.geometry.kind === 'RECTANGLE' ? <rect x={shape.geometry.x} y={shape.geometry.y} width={shape.geometry.width} height={shape.geometry.height} fill={shape.fill ?? '#5c987a55'} stroke={shape.stroke ?? '#397457'} vectorEffect="non-scaling-stroke" /> : <polygon points={shape.geometry.points.map(point => `${point.x},${point.y}`).join(' ')} fill={shape.fill ?? '#5c987a55'} stroke={shape.stroke ?? '#397457'} vectorEffect="non-scaling-stroke" />}
        {shape.label && <text x={shape.geometry.kind === 'RECTANGLE' ? shape.geometry.x + shape.geometry.width / 2 : shape.geometry.points.reduce((sum, point) => sum + point.x, 0) / shape.geometry.points.length} y={shape.geometry.kind === 'RECTANGLE' ? shape.geometry.y + shape.geometry.height / 2 : shape.geometry.points.reduce((sum, point) => sum + point.y, 0) / shape.geometry.points.length} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">{shape.label}</text>}
        {tool === 'edit' && selectedId === shape.id && shape.geometry.kind === 'POLYGON' && shape.geometry.points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={10} className="vstudio-map__vertex" onPointerDown={event => { event.stopPropagation(); event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); setDragVertex({ id: shape.id, index }) }} />)}
      </g>)}
      {draftRectangle && <rect {...draftRectangle} className="vstudio-map__draft" />}
      {polygon.length > 0 && <><polyline points={polygon.map(point => `${point.x},${point.y}`).join(' ')} className="vstudio-map__draft-line" />{polygon.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={8} className="vstudio-map__vertex" />)}</>}
    </svg>
    {selected && selectionPopover && <div className="vstudio-map__selection-layer"><div ref={popoverRef} className={`vstudio-map__selection-bubble ${popoverPosition.direction}`} style={{ left: `${popoverPosition.left}px`, top: `${popoverPosition.top}px`, '--callout-arrow-x': `${popoverPosition.arrowX}%` } as CSSProperties} onPointerDown={event => event.stopPropagation()}>{selectionPopover}</div></div>}
    {tool === 'polygon' && <div className="vstudio-map__hint">Click to add points · double-click to finish · {polygon.length} points</div>}
  </div>
}
