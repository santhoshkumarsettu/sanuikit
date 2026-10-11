'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { vstudioApi } from '@vstudio/api-client'
import { ApiError } from '@vstudio/api-client'
import { Modal, Button } from 'sanui'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import type { DrawingTool, MapShape } from '@vstudio/map-engine'
import { InteractiveMap } from '@vstudio/map-engine'
import { allowedUnitStatuses, UNIT_STATUS_PRESENTATION, type UnitGeometry, type UnitStatus } from '@vstudio/types'
import { demoLayout } from '@vstudio/utils'
import { formatArea, formatCurrency } from '@vstudio/utils'
import { useMapStudio } from '../../store/map-studio'

const toolItems: { tool: DrawingTool; label: string; icon: string }[] = [
  { tool: 'select', label: 'Select', icon: '↖' }, { tool: 'pan', label: 'Pan', icon: '✥' }, { tool: 'rectangle', label: 'Rectangle', icon: '▱' }, { tool: 'polygon', label: 'Polygon', icon: '⬠' }, { tool: 'edit', label: 'Edit vertices', icon: '⌖' },
]
const unitSchema = z.object({ unitNumber: z.string().trim().min(1, 'Enter a unit number').max(40), unitType: z.enum(['PLOT', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOP', 'PARKING', 'ROOM', 'WAREHOUSE', 'CUSTOM']), area: z.number().positive('Area must be greater than zero'), areaUnit: z.enum(['SQFT', 'SQM', 'ACRE', 'HECTARE']), price: z.number().nonnegative('Price cannot be negative'), currency: z.enum(['INR', 'USD', 'EUR']) })
type UnitFormValues = z.infer<typeof unitSchema>

export function MapStudio() {
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const projectId = searchParams.get('project') ?? undefined
  const requestedUnitId = searchParams.get('unit') ?? undefined
  const projectQuery = useQuery({ queryKey: ['project', projectId], queryFn: () => vstudioApi.project(projectId!), enabled: Boolean(projectId), retry: false })
  const unitsQuery = useQuery({ queryKey: ['units', projectId], queryFn: () => vstudioApi.units(projectId!), enabled: Boolean(projectId), retry: false })
  const activeProject = projectQuery.data
  const activeLayout = activeProject?.layouts[0]
  const assetQuery = useQuery({ queryKey: ['layout-asset', activeLayout?.id], queryFn: () => vstudioApi.layoutAssetUrl(activeLayout!.id), enabled: Boolean(activeLayout?.id), retry: false })
  const isConnected = Boolean(projectId && activeProject)
  const hydrate = useMapStudio(state => state.hydrate)
  useEffect(() => { if (unitsQuery.data) hydrate(unitsQuery.data) }, [unitsQuery.data, hydrate])
  const units = useMapStudio(state => state.units)
  const selectedId = useMapStudio(state => state.selectedId)
  const tool = useMapStudio(state => state.tool)
  const undoStack = useMapStudio(state => state.undoStack)
  const redoStack = useMapStudio(state => state.redoStack)
  const setTool = useMapStudio(state => state.setTool)
  const select = useMapStudio(state => state.select)
  const createUnit = useMapStudio(state => state.createUnit)
  const updateGeometry = useMapStudio(state => state.updateGeometry)
  const updateStatus = useMapStudio(state => state.updateStatus)
  const removeSelected = useMapStudio(state => state.removeSelected)
  const undo = useMapStudio(state => state.undo)
  const redo = useMapStudio(state => state.redo)
  const selected = units.find(unit => unit.id === selectedId)
  useEffect(() => { if (requestedUnitId && units.some(unit => unit.id === requestedUnitId)) select(requestedUnitId) }, [requestedUnitId, units, select])
  const [newGeometry, setNewGeometry] = useState<UnitGeometry>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [message, setMessage] = useState('')
  const form = useForm<UnitFormValues>({ resolver: zodResolver(unitSchema), defaultValues: { unitNumber: '', unitType: 'PLOT', area: 1500, areaUnit: 'SQFT', price: 3_500_000, currency: 'INR' } })
  const shapes: MapShape[] = useMemo(() => units.map(unit => ({ id: unit.id, geometry: unit.geometry, label: unit.unitNumber, fill: UNIT_STATUS_PRESENTATION[unit.status].fill })), [units])

  function onCreateGeometry(geometry: UnitGeometry) { setNewGeometry(geometry); form.reset({ unitNumber: '', unitType: 'PLOT', area: 1500, areaUnit: 'SQFT', price: 3_500_000, currency: 'INR' }); setDialogOpen(true) }
  async function onSubmit(values: UnitFormValues) {
    if (!newGeometry) return
    if (isConnected) {
      if (!activeLayout) { setMessage('Upload a layout before adding inventory units.'); return }
      try {
        const created = await vstudioApi.createUnit(projectId!, { ...values, layoutId: activeLayout.id, geometry: newGeometry })
        await unitsQuery.refetch(); select(created.id); setDialogOpen(false); setTool('select'); setMessage(`Unit ${values.unitNumber} saved to ${activeProject.name}.`)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'The unit could not be saved.') }
      return
    }
    const id = createUnit(newGeometry, values); select(id); setDialogOpen(false); setTool('select'); setMessage(`Unit ${values.unitNumber} added to the map.`)
  }
  async function uploadBackground(file?: File) {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type) || file.size > 20 * 1024 * 1024) { setMessage('Choose a PNG, JPG, or WebP plan under 20 MB.'); return }
    if (!isConnected) { setMessage('Choose a project from Projects before uploading a persistent layout.'); return }
    setMessage('Uploading and validating layout…')
    try {
      const bitmap = await createImageBitmap(file)
      const intent = await vstudioApi.createLayoutUploadIntent(projectId!, { name: file.name.replace(/\.[^.]+$/, '') || 'Site layout', fileName: file.name, contentType: file.type, size: file.size, width: bitmap.width, height: bitmap.height })
      bitmap.close()
      const upload = await fetch(intent.uploadUrl, { method: 'PUT', headers: intent.uploadHeaders, body: file })
      if (!upload.ok) throw new Error('Object storage rejected the upload. Check the bucket CORS and signed URL settings.')
      await vstudioApi.confirmLayoutUpload(intent.layoutId)
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      await projectQuery.refetch()
      setMessage('Layout uploaded and validated. You can now map units onto it.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The layout could not be uploaded.') }
  }
  async function saveChanges() {
    if (!isConnected || !unitsQuery.data) { setMessage('Map changes are saved in this local demo session.'); return }
    const original = new Map(unitsQuery.data.map(unit => [unit.id, JSON.stringify(unit.geometry)]))
    const changed = units.filter(unit => original.has(unit.id) && original.get(unit.id) !== JSON.stringify(unit.geometry))
    try {
      await Promise.all(changed.map(unit => vstudioApi.updateUnitGeometry(unit.id, unit.geometry, unit.version ?? 1)))
      await unitsQuery.refetch()
      setMessage(changed.length ? `Saved geometry for ${changed.length} unit${changed.length === 1 ? '' : 's'}.` : 'All map changes are saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Map changes could not be saved.') }
  }
  async function changeStatus(id: string, status: UnitStatus) {
    if (!isConnected) { updateStatus(id, status); return }
    try { await vstudioApi.updateUnitStatus(id, { status }); await unitsQuery.refetch(); setMessage('Unit availability updated.') }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'The unit status could not be updated.') }
  }
  async function deleteSelected() {
    if (!selected) return
    if (isConnected) {
      if (!window.confirm(`Remove ${selected.unitNumber} from inventory?`)) return
      try { await vstudioApi.deleteUnit(selected.id); await unitsQuery.refetch(); select(undefined); setMessage('Unit removed from inventory.') }
      catch (error) { setMessage(error instanceof Error ? error.message : 'The unit could not be removed.') }
      return
    }
    removeSelected()
  }

  return <div className="map-studio-page">
    <div className="page-title-row"><div><p className="page-eyebrow">PROJECT · {activeProject?.name.toUpperCase() ?? 'GREEN VALLEY'} / LAYOUT · {activeLayout?.name.toUpperCase() ?? 'MASTER SITE PLAN'}</p><h1 className="page-title">Map Studio</h1><p className="page-subtitle">Draw and manage units against the layout’s {activeLayout?.width ?? demoLayout.width} × {activeLayout?.height ?? demoLayout.height} coordinate space.</p></div><div className="title-actions"><label className="sanui-button sanui-button--secondary sanui-button--md upload-label">↑ Upload layout<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadBackground(event.target.files?.[0])} hidden /></label><Button onClick={() => void saveChanges()}>Save changes</Button></div></div>
    <div className="map-studio-toolbar" aria-label="Map drawing tools">
      {toolItems.map(item => <button key={item.tool} type="button" className={`tool-button${tool === item.tool ? ' is-active' : ''}`} aria-pressed={tool === item.tool} onClick={() => setTool(item.tool)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
      <span className="tool-divider" />
      <button className="tool-button" type="button" disabled={!undoStack.length} onClick={undo} aria-label="Undo">↶ Undo</button><button className="tool-button" type="button" disabled={!redoStack.length} onClick={redo} aria-label="Redo">↷ Redo</button>
      <span className="tool-divider" />
      <button className="tool-button" type="button" disabled={!selected} onClick={() => void deleteSelected()}>⌫ Delete</button>
    </div>
    {message && <div className="studio-message" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
    <div className="map-studio-shell">
      <section className="map-studio-main" aria-label="Map canvas">
        <div className="map-canvas-wrap"><InteractiveMap width={activeLayout?.width ?? demoLayout.width} height={activeLayout?.height ?? demoLayout.height} backgroundUrl={assetQuery.data?.url} shapes={shapes} selectedId={selectedId} tool={tool} onSelect={select} onCreate={onCreateGeometry} onGeometryChange={updateGeometry} ariaLabel={`${activeLayout?.name ?? demoLayout.name}, interactive unit layout`} /><div className="map-meta"><span>{units.length} mapped units · {activeLayout?.name ?? demoLayout.name}</span><span>Coordinates: layout-pixel-v1</span></div></div>
      </section>
      <aside>
        {selected ? <section className="detail-panel"><header className="detail-panel__head"><p>Selected unit</p><h2>{selected.unitNumber}</h2></header><div className="detail-fields"><div className="detail-field"><label>Unit type</label><strong>{selected.unitType}</strong></div><div className="detail-field"><label>Area</label><strong>{formatArea(selected.area, selected.areaUnit)}</strong></div><div className="detail-field"><label>List price</label><strong>{formatCurrency(selected.price, selected.currency)}</strong></div><div className="detail-field"><label>Status</label><select className="sanui-select filter-select status-select" value={selected.status} onChange={event => void changeStatus(selected.id, event.target.value as UnitStatus)} aria-label="Change unit status">{Array.from(allowedUnitStatuses(selected.status)).map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></div><div className="detail-field"><label>Updated</label><strong>{new Date(selected.updatedAt).toLocaleString()}</strong></div></div><div className="detail-panel__actions"><Button variant="secondary" onClick={() => setTool('edit')}>Edit geometry</Button><Button variant="ghost" onClick={() => void deleteSelected()}>Remove from inventory</Button></div></section> : <section className="detail-panel"><header className="detail-panel__head"><p>Map selection</p><h2>Select a unit</h2></header><div className="detail-fields"><p className="no-margin preview-note">Choose a unit on the map to view its inventory details, or use Rectangle and Polygon to add a shape.</p><div className="detail-field"><label>Current tool</label><strong>{toolItems.find(item => item.tool === tool)?.label}</strong></div></div></section>}
        <section className="detail-panel map-legend"><span className="legend-title">Availability legend</span>{(['AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED'] as UnitStatus[]).map(status => <span className="legend-item" key={status}><i className={`legend-swatch legend-swatch--${status.toLowerCase()}`} />{status.replace('_', ' ')}</span>)}</section>
      </aside>
    </div>
    <Modal open={dialogOpen} title="Create inventory unit" onClose={() => setDialogOpen(false)} footer={<><Button variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={form.handleSubmit(onSubmit)}>Create unit</Button></>}>
      <form className="unit-create-form" onSubmit={form.handleSubmit(onSubmit)}>
        <p className="modal-description">This shape will be linked to a database unit after you save it.</p>
        <div className="form-grid"><div className="form-field"><label htmlFor="unitNumber">Unit number</label><input id="unitNumber" {...form.register('unitNumber')} placeholder="e.g. A-104" />{form.formState.errors.unitNumber && <small className="form-error">{form.formState.errors.unitNumber.message}</small>}</div>
          <div className="form-field"><label htmlFor="unitType">Unit type</label><select id="unitType" {...form.register('unitType')}><option value="PLOT">Residential plot</option><option value="APARTMENT">Apartment</option><option value="VILLA">Villa</option><option value="OFFICE">Office</option><option value="SHOP">Shop</option><option value="PARKING">Parking</option><option value="ROOM">Room</option><option value="WAREHOUSE">Warehouse</option><option value="CUSTOM">Custom</option></select></div>
          <div className="form-field"><label htmlFor="unitArea">Area</label><input id="unitArea" type="number" min="0" step="any" {...form.register('area', { valueAsNumber: true })} />{form.formState.errors.area && <small className="form-error">{form.formState.errors.area.message}</small>}</div>
          <div className="form-field"><label htmlFor="areaUnit">Area unit</label><select id="areaUnit" {...form.register('areaUnit')}><option value="SQFT">sq.ft</option><option value="SQM">sq.m</option><option value="ACRE">acre</option><option value="HECTARE">hectare</option></select></div>
          <div className="form-field"><label htmlFor="unitPrice">Price</label><input id="unitPrice" type="number" min="0" step="1" {...form.register('price', { valueAsNumber: true })} />{form.formState.errors.price && <small className="form-error">{form.formState.errors.price.message}</small>}</div>
          <div className="form-field"><label htmlFor="currency">Currency</label><select id="currency" {...form.register('currency')}><option value="INR">INR · ₹</option><option value="USD">USD · $</option><option value="EUR">EUR · €</option></select></div>
        </div>
        <button className="visually-hidden-submit" type="submit" aria-hidden="true" tabIndex={-1}>Create unit</button>
      </form>
    </Modal>
  </div>
}
