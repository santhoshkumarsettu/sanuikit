'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Point, UnitGeometry, UnitPurpose } from '@vstudio/types'
import { clampPointToLayout, fittedViewport, geometryBounds, revealBounds, screenToWorld, translateGeometryWithinLayout, zoomAt, type ViewBox } from './geometry.js'

export type DrawingTool = 'select' | 'pan' | 'rectangle' | 'polygon' | 'edit'
export interface MapShape { id: string; geometry: UnitGeometry; label?: string; fill?: string; stroke?: string; purpose?: UnitPurpose }
export interface InteractiveMapProps {
  width: number; height: number; backgroundUrl?: string; backgroundOpacity?: number; shapes: MapShape[]; selectedId?: string; focusId?: string; selectionPopover?: ReactNode; tool: DrawingTool
  preserveAspectRatio?: boolean
  fitOnFullscreenChange?: boolean
  revealShape?: { id: string }
  allowPageScroll?: boolean
  touchHint?: string
  onSelect?: (id: string | undefined) => void; onHover?: (id: string | undefined) => void; onCreate?: (geometry: UnitGeometry) => void
  isFullscreen?: boolean; onFullscreenToggle?: () => void
  onGeometryChange?: (id: string, geometry: UnitGeometry) => void; onGeometryEditStart?: () => void; onGeometryEditEnd?: () => void; className?: string; ariaLabel?: string
  onUndo?: () => void; onRedo?: () => void; onDraftChange?: (hasDraft: boolean) => void
}

export function InteractiveMap({ width, height, backgroundUrl, backgroundOpacity = 1, shapes, selectedId, focusId, selectionPopover, tool, onSelect, onHover, onCreate, onGeometryChange, onGeometryEditStart, onGeometryEditEnd, onUndo, onRedo, onDraftChange, isFullscreen = false, onFullscreenToggle, className = '', ariaLabel = 'Interactive property layout', preserveAspectRatio = false, fitOnFullscreenChange = false, revealShape, allowPageScroll = false, touchHint }: InteractiveMapProps) {
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
  const [dragCorner, setDragCorner] = useState<{ id: string; index: number; geometry: Extract<UnitGeometry, { kind: 'RECTANGLE' }> }>()
  const [dragShape, setDragShape] = useState<{ id: string; start: Point; geometry: UnitGeometry }>()
  const [selectedVertex, setSelectedVertex] = useState<{ id: string; index: number }>()
  const selected = shapes.find(shape => shape.id === selectedId)
  const focusMap = (svg?: SVGSVGElement | null) => svg?.focus({ preventScroll: true })
  const selectOnClick = allowPageScroll && tool === 'select'
  useEffect(() => { onDraftChange?.(polygon.length > 0 || Boolean(origin)) }, [onDraftChange, origin, polygon.length])
  useEffect(() => {
    if (tool !== 'polygon') setPolygon([])
    if (tool !== 'rectangle') { setOrigin(undefined); setCursor(undefined) }
  }, [tool])
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
  useLayoutEffect(() => {
    const shape = shapesRef.current.find(item => item.id === revealShape?.id)
    if (shape) setViewBox(current => revealBounds(current, geometryBounds(shape.geometry)))
  }, [revealShape])
  const worldPoint = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return { x: 0, y: 0 }
    const viewport = preserveAspectRatio ? fittedViewport(rect, viewBox) : rect
    return clampPointToLayout(screenToWorld(event.clientX, event.clientY, viewport, viewBox), width, height)
  }
  const startCapture = (event: PointerEvent<SVGSVGElement>) => event.currentTarget.setPointerCapture(event.pointerId)
  const finishRectangle = (end: Point) => { if (!origin || !onCreate) return; const x = Math.min(origin.x, end.x); const y = Math.min(origin.y, end.y); const rectWidth = Math.abs(end.x - origin.x); const rectHeight = Math.abs(end.y - origin.y); if (rectWidth >= 3 && rectHeight >= 3) onCreate({ kind: 'RECTANGLE', x, y, width: rectWidth, height: rectHeight }); setOrigin(undefined); setCursor(undefined) }
  const finishPolygon = () => { if (polygon.length >= 3) onCreate?.({ kind: 'POLYGON', points: polygon }); setPolygon([]) }
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (selectOnClick && event.pointerType === 'touch') return
    const point = worldPoint(event)
    focusMap(event.currentTarget)
    if (tool === 'pan' || event.button === 1 || event.shiftKey) { startCapture(event); setPanOrigin({ clientX: event.clientX, clientY: event.clientY, box: viewBox }); return }
    if (tool === 'rectangle') { startCapture(event); setOrigin(point); setCursor(point); return }
    if (tool === 'polygon') { if (event.detail >= 2 && polygon.length >= 3) { finishPolygon(); return } setPolygon(current => [...current, point]); return }
    if (tool === 'select' && !selectOnClick) onSelect?.(undefined)
  }
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const point = worldPoint(event)
    if (panOrigin) {
      const rect = event.currentTarget.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const viewport = preserveAspectRatio ? fittedViewport(rect, panOrigin.box) : rect
      setViewBox({
        ...panOrigin.box,
        x: panOrigin.box.x - (event.clientX - panOrigin.clientX) * panOrigin.box.width / viewport.width,
        y: panOrigin.box.y - (event.clientY - panOrigin.clientY) * panOrigin.box.height / viewport.height,
      })
      return
    }
    if (origin) { setCursor(point); return }
    if (dragVertex && selected?.geometry.kind === 'POLYGON') { const points = selected.geometry.points.map((item, index) => index === dragVertex.index ? clampPointToLayout(point, width, height) : item); onGeometryChange?.(dragVertex.id, { kind: 'POLYGON', points }) }
    if (dragCorner) {
      const { geometry, index, id } = dragCorner
      const fixed = index === 0 ? { x: geometry.x + geometry.width, y: geometry.y + geometry.height } : index === 1 ? { x: geometry.x, y: geometry.y + geometry.height } : index === 2 ? { x: geometry.x, y: geometry.y } : { x: geometry.x + geometry.width, y: geometry.y }
      const moving = clampPointToLayout(point, width, height)
      const minWidth = Math.min(3, width)
      const minHeight = Math.min(3, height)
      const x = Math.max(0, Math.min(width - minWidth, Math.min(moving.x, fixed.x)))
      const y = Math.max(0, Math.min(height - minHeight, Math.min(moving.y, fixed.y)))
      onGeometryChange?.(id, { kind: 'RECTANGLE', x, y, width: Math.min(width - x, Math.max(minWidth, Math.abs(moving.x - fixed.x))), height: Math.min(height - y, Math.max(minHeight, Math.abs(moving.y - fixed.y))) })
    }
    if (dragShape) {
      const dx = point.x - dragShape.start.x; const dy = point.y - dragShape.start.y
      const geometry = translateGeometryWithinLayout(dragShape.geometry, { x: dx, y: dy }, width, height)
      onGeometryChange?.(dragShape.id, geometry)
    }
  }
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => { if (origin) finishRectangle(worldPoint(event)); if (dragVertex || dragCorner || dragShape) onGeometryEditEnd?.(); setPanOrigin(undefined); setDragVertex(undefined); setDragCorner(undefined); setDragShape(undefined) }
  const selectedVertexShape = selectedVertex ? shapes.find(item => item.id === selectedVertex.id) : undefined
  const canRemoveSelectedVertex = selectedVertexShape?.geometry.kind === 'POLYGON' && selectedVertexShape.geometry.points.length > 3
  const removeVertexTitle = selectedVertexShape?.geometry.kind !== 'POLYGON'
    ? 'Select a polygon corner to remove it'
    : selectedVertexShape.geometry.points.length <= 3
      ? 'A polygon must keep at least 3 corners'
      : 'Remove the selected polygon corner'
  const removeSelectedVertex = () => {
    if (!selectedVertex || !canRemoveSelectedVertex || !onGeometryChange || selectedVertexShape?.geometry.kind !== 'POLYGON') return
    onGeometryEditStart?.()
    onGeometryChange(selectedVertexShape.id, { kind: 'POLYGON', points: selectedVertexShape.geometry.points.filter((_, index) => index !== selectedVertex.index) })
    onGeometryEditEnd?.()
    setSelectedVertex(undefined)
  }
  const cancelDraft = () => { setPolygon([]); setOrigin(undefined); setCursor(undefined) }
  const handleKeyDown = (event: ReactKeyboardEvent<SVGSVGElement>) => {
    if (event.key === 'Escape' && (polygon.length > 0 || origin)) { event.preventDefault(); cancelDraft(); return }
    if ((event.key === 'Backspace' || event.key === 'Delete') && tool === 'polygon' && polygon.length > 0) { event.preventDefault(); cancelDraft(); return }
    if ((event.metaKey || event.ctrlKey) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const panKey = event.key
      const step = event.shiftKey ? 0.2 : 0.08
      setViewBox(current => ({
        ...current,
        x: current.x + (panKey === 'ArrowLeft' ? current.width * step : panKey === 'ArrowRight' ? -current.width * step : 0),
        y: current.y + (panKey === 'ArrowUp' ? current.height * step : panKey === 'ArrowDown' ? -current.height * step : 0),
      }))
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) onRedo?.()
      else onUndo?.()
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); onRedo?.(); return }
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || tool !== 'edit' || !canRemoveSelectedVertex) return
    event.preventDefault(); removeSelectedVertex()
  }
  const handleDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (tool === 'polygon') { event.preventDefault(); finishPolygon(); return }
    if (tool !== 'edit' || !selectedId || !onGeometryChange) return
    const shape = shapes.find(item => item.id === selectedId)
    if (!shape || shape.geometry.kind !== 'POLYGON') return
    const points = shape.geometry.points
    const point = worldPoint(event)
    let closestIndex = 0; let closestDistance = Infinity
    points.forEach((start, index) => {
      const end = points[(index + 1) % points.length]!
      const distance = Math.hypot(point.x - (start.x + end.x) / 2, point.y - (start.y + end.y) / 2)
      if (distance < closestDistance) { closestDistance = distance; closestIndex = index }
    })
    if (closestDistance >= Math.min(viewBox.width, viewBox.height) * 0.035) return
    const nextPoints = [...points]; const start = nextPoints[closestIndex]!; const next = nextPoints[(closestIndex + 1) % nextPoints.length]!
    nextPoints.splice(closestIndex + 1, 0, { x: (start.x + next.x) / 2, y: (start.y + next.y) / 2 })
    onGeometryEditStart?.(); onGeometryChange(shape.id, { kind: 'POLYGON', points: nextPoints }); onGeometryEditEnd?.()
    setSelectedVertex({ id: shape.id, index: closestIndex + 1 })
  }
  const handleWheel = useCallback((event: globalThis.WheelEvent) => {
    if (allowPageScroll && !isFullscreen && !event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    event.stopPropagation()
    const svg = svgRef.current
    const rect = svg?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return
    const currentView = viewBoxRef.current
    const viewport = preserveAspectRatio ? fittedViewport(rect, currentView) : rect
    const point = screenToWorld(event.clientX, event.clientY, viewport, currentView)
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1
    const delta = Math.max(-120, Math.min(120, event.deltaY * deltaScale))
    const factor = Math.exp(delta * 0.001)
    setViewBox(current => zoomAt(current, point, factor))
  }, [allowPageScroll, isFullscreen, preserveAspectRatio])
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    return () => svg.removeEventListener('wheel', handleWheel, true)
  }, [handleWheel])
  const fit = useCallback(() => setViewBox({ x: 0, y: 0, width, height }), [width, height])
  useLayoutEffect(() => {
    if (fitOnFullscreenChange) fit()
  }, [fit, fitOnFullscreenChange, isFullscreen])
  const draftRectangle = useMemo(() => origin && cursor ? { x: Math.min(origin.x, cursor.x), y: Math.min(origin.y, cursor.y), width: Math.abs(cursor.x - origin.x), height: Math.abs(cursor.y - origin.y) } : undefined, [origin, cursor])
  useLayoutEffect(() => {
    if (!selected || !selectionPopover) return
    const map = mapRef.current
    const svg = svgRef.current
    const popoverElement = popoverRef.current
    if (!map || !svg || !popoverElement) return
    const place = () => {
      const mapRect = map.getBoundingClientRect()
      const popoverRect = popoverElement.getBoundingClientRect()
      if (!mapRect.width || !mapRect.height || !popoverRect.width || !popoverRect.height) return
      const center = selected.geometry.kind === 'RECTANGLE'
        ? { x: selected.geometry.x + selected.geometry.width / 2, y: selected.geometry.y + selected.geometry.height / 2 }
        : { x: selected.geometry.points.reduce((sum, point) => sum + point.x, 0) / selected.geometry.points.length, y: selected.geometry.points.reduce((sum, point) => sum + point.y, 0) / selected.geometry.points.length }
      const viewport = preserveAspectRatio ? fittedViewport(svg.getBoundingClientRect(), viewBox) : mapRect
      const centerX = viewport.left - mapRect.left + (center.x - viewBox.x) / viewBox.width * viewport.width
      const centerY = viewport.top - mapRect.top + (center.y - viewBox.y) / viewBox.height * viewport.height
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
  }, [selected, selectionPopover, viewBox, preserveAspectRatio])
  const polygonEditControls = (shape: MapShape) => {
    if (shape.geometry.kind !== 'POLYGON') return null
    const points = shape.geometry.points
    return <g className="vstudio-map__edit-handles">
      {points.map((point, index) => <g key={`vertex-${index}`} className={`vstudio-map__vertex-handle${selectedVertex?.id === shape.id && selectedVertex.index === index ? ' is-active' : ''}`} role="button" aria-label={`Move vertex ${index + 1}`} tabIndex={0} onFocus={() => setSelectedVertex({ id: shape.id, index })} onPointerDown={event => { event.stopPropagation(); event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); event.currentTarget.ownerSVGElement?.focus({ preventScroll: true }); onGeometryEditStart?.(); setSelectedVertex({ id: shape.id, index }); setDragVertex({ id: shape.id, index }) }}><circle cx={point.x} cy={point.y} r={24} className="vstudio-map__vertex-hit" /><circle cx={point.x} cy={point.y} r={8} className="vstudio-map__vertex" /></g>)}
    </g>
  }
  return <div ref={mapRef} className={`vstudio-map ${className}`} onPointerLeave={() => onHover?.(undefined)}>
    <div className="vstudio-map__viewport-tools" aria-label="Map zoom controls"><button type="button" onClick={() => setViewBox(box => zoomAt(box, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 0.8))} aria-label="Zoom in" title="Zoom in">+</button><button type="button" onClick={() => setViewBox(box => zoomAt(box, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, 1.25))} aria-label="Zoom out" title="Zoom out">−</button><button type="button" onClick={fit} aria-label="Fit layout" title="Fit layout">Fit</button>{onFullscreenToggle && <button type="button" className="vstudio-map__fullscreen-button" onClick={onFullscreenToggle} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'} aria-pressed={isFullscreen}><svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">{isFullscreen ? <path d="M7 3v4H3m10-4v4h4M3 13h4v4m10-4h-4v4" /> : <path d="M3 7V3h4m6 0h4v4m0 6v4h-4m-6 0H3v-4" />}</svg></button>}</div>
    <svg
      ref={svgRef}
      className={`vstudio-map__svg is-${tool}`}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio={preserveAspectRatio ? 'xMidYMid meet' : 'none'}
      role="application"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onClick={selectOnClick ? event => { if (!event.shiftKey) onSelect?.(undefined) } : undefined}
    >
      {backgroundUrl ? <image href={backgroundUrl} x={0} y={0} width={width} height={height} preserveAspectRatio="none" opacity={backgroundOpacity} pointerEvents="none" /> : <rect x={0} y={0} width={width} height={height} fill="var(--sanui-color-canvas)" pointerEvents="none" />}
      {shapes.map(shape => <g
        key={shape.id}
        onPointerEnter={event => {
          if (tool === 'select' && !(selectOnClick && event.pointerType === 'touch')) onHover?.(shape.id)
        }}
        onPointerDown={event => {
          if (tool === 'select') {
            if (selectOnClick && (event.shiftKey || event.button === 1)) return
            event.stopPropagation()
            if (!selectOnClick) {
              focusMap(event.currentTarget.ownerSVGElement)
              onSelect?.(shape.id)
            }
          } else if (tool === 'edit') {
            event.stopPropagation()
            const svg = event.currentTarget.ownerSVGElement
            focusMap(svg)
            if (selectedId === shape.id) {
              svg?.setPointerCapture(event.pointerId)
              onGeometryEditStart?.()
              setDragShape({ id: shape.id, start: worldPoint(event), geometry: shape.geometry })
            } else {
              onSelect?.(shape.id)
            }
          }
        }}
        onClick={selectOnClick ? event => {
          event.stopPropagation()
          if (event.shiftKey) return
          focusMap(event.currentTarget.ownerSVGElement)
          onSelect?.(shape.id)
        } : undefined}
        className={`vstudio-map__shape${selectedId === shape.id ? ' is-selected' : ''}${shape.purpose === 'AMENITY' ? ' is-amenity' : ''}`}
      >
        {shape.geometry.kind === 'RECTANGLE' ? <rect x={shape.geometry.x} y={shape.geometry.y} width={shape.geometry.width} height={shape.geometry.height} fill={shape.fill ?? 'var(--sanui-color-primary-fill)'} stroke={shape.stroke ?? 'var(--sanui-color-primary)'} vectorEffect="non-scaling-stroke" /> : <polygon points={shape.geometry.points.map(point => `${point.x},${point.y}`).join(' ')} fill={shape.fill ?? 'var(--sanui-color-primary-fill)'} stroke={shape.stroke ?? 'var(--sanui-color-primary)'} vectorEffect="non-scaling-stroke" />}
        {shape.label && <text x={shape.geometry.kind === 'RECTANGLE' ? shape.geometry.x + shape.geometry.width / 2 : shape.geometry.points.reduce((sum, point) => sum + point.x, 0) / shape.geometry.points.length} y={shape.geometry.kind === 'RECTANGLE' ? shape.geometry.y + shape.geometry.height / 2 : shape.geometry.points.reduce((sum, point) => sum + point.y, 0) / shape.geometry.points.length} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">{shape.label}</text>}
        {tool === 'edit' && selectedId === shape.id && polygonEditControls(shape)}
        {tool === 'edit' && selectedId === shape.id && shape.geometry.kind === 'RECTANGLE' && <g className="vstudio-map__edit-handles">{[{ x: shape.geometry.x, y: shape.geometry.y }, { x: shape.geometry.x + shape.geometry.width, y: shape.geometry.y }, { x: shape.geometry.x + shape.geometry.width, y: shape.geometry.y + shape.geometry.height }, { x: shape.geometry.x, y: shape.geometry.y + shape.geometry.height }].map((point, index) => <g key={index} className="vstudio-map__vertex-handle" role="button" aria-label={`Resize corner ${index + 1}`} tabIndex={0} onPointerDown={event => { event.stopPropagation(); event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId); event.currentTarget.ownerSVGElement?.focus({ preventScroll: true }); onGeometryEditStart?.(); setDragCorner({ id: shape.id, index, geometry: shape.geometry as Extract<UnitGeometry, { kind: 'RECTANGLE' }> }) }}><circle cx={point.x} cy={point.y} r={24} className="vstudio-map__vertex-hit" /><circle cx={point.x} cy={point.y} r={8} className="vstudio-map__vertex" /></g>)}</g>}
      </g>)}
      {draftRectangle && <rect {...draftRectangle} className="vstudio-map__draft" />}
      {polygon.length > 0 && <><polyline points={polygon.map(point => `${point.x},${point.y}`).join(' ')} className="vstudio-map__draft-line" />{polygon.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={8} className="vstudio-map__vertex" />)}</>}
    </svg>
    {selected && selectionPopover && <div className="vstudio-map__selection-layer"><div ref={popoverRef} className={`vstudio-map__selection-bubble ${popoverPosition.direction}`} style={{ left: `${popoverPosition.left}px`, top: `${popoverPosition.top}px`, '--callout-arrow-x': `${popoverPosition.arrowX}%` } as CSSProperties} onPointerDown={event => event.stopPropagation()}>{selectionPopover}</div></div>}
    {tool === 'polygon' && <div className="vstudio-map__hint"><span>Click to add boundary points · {polygon.length >= 3 ? 'finish when ready' : `${3 - polygon.length} more point${polygon.length === 2 ? '' : 's'} needed`} · Escape to cancel · {polygon.length} points</span>{polygon.length >= 3 && <button type="button" className="is-primary" onClick={finishPolygon}>Finish polygon</button>}{polygon.length > 0 && <button type="button" onClick={cancelDraft}>Cancel drawing</button>}</div>}
    {tool === 'edit' && <div className="vstudio-map__hint"><span>Drag a corner to reshape · click a corner, then remove it · double-click an edge to add one · Ctrl/Cmd+Z to undo</span><button type="button" title={removeVertexTitle} aria-label="Remove selected polygon point" disabled={!canRemoveSelectedVertex} onClick={removeSelectedVertex}>Remove selected point</button></div>}
    {(tool === 'select' || tool === 'pan') && (
      <div className="vstudio-map__hint">
        <span className={touchHint ? 'vstudio-map__keyboard-hint' : undefined}>
          Click the map, then hold Ctrl/⌘ + arrow keys to pan · add Shift for larger steps
        </span>
        {touchHint && <span className="vstudio-map__touch-hint">{touchHint}</span>}
      </div>
    )}
  </div>
}
