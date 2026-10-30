'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { formatArea, formatCurrency } from '@vstudio/utils'
import { useMapStudio } from '../../store/map-studio'

const toolItems: { tool: DrawingTool; label: string; icon: string }[] = [
  { tool: 'select', label: 'Select', icon: '↖' }, { tool: 'pan', label: 'Pan', icon: '✥' }, { tool: 'rectangle', label: 'Rectangle', icon: '▱' }, { tool: 'polygon', label: 'Polygon', icon: '⬠' }, { tool: 'edit', label: 'Edit vertices', icon: '⌖' },
]
const unitSchema = z.object({ unitNumber: z.string().trim().min(1, 'Enter a unit number').max(40), unitType: z.enum(['PLOT', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOP', 'PARKING', 'ROOM', 'WAREHOUSE', 'CUSTOM']), area: z.number().positive('Area must be greater than zero'), areaUnit: z.enum(['SQFT', 'SQM', 'ACRE', 'HECTARE']), price: z.number().nonnegative('Price cannot be negative'), currency: z.enum(['INR', 'USD', 'EUR']) })
type UnitFormValues = z.infer<typeof unitSchema>

export function MapStudio() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const projectId = searchParams.get('project') ?? undefined
  const requestedUnitId = searchParams.get('unit') ?? undefined
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>()
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: () => vstudioApi.projects(), retry: false })
  const projectQuery = useQuery({ queryKey: ['project', projectId], queryFn: () => vstudioApi.project(projectId!), enabled: Boolean(projectId), retry: false })
  const unitsQuery = useQuery({ queryKey: ['units', projectId], queryFn: () => vstudioApi.units(projectId!), enabled: Boolean(projectId), retry: false })
  const activeProject = projectQuery.data?.id === projectId ? projectQuery.data : undefined
  const activeLayout = activeProject?.layouts.find(layout => layout.id === selectedLayoutId) ?? activeProject?.layouts[0]
  const assetQuery = useQuery({ queryKey: ['layout-asset', activeLayout?.id], queryFn: () => vstudioApi.layoutAssetUrl(activeLayout!.id), enabled: Boolean(activeLayout?.id), retry: false })
  const isConnected = Boolean(projectId && activeProject)
  const canEditMap = Boolean(isConnected && activeLayout && !unitsQuery.isLoading && !unitsQuery.isError)
  const hydrate = useMapStudio(state => state.hydrate)
  useEffect(() => { hydrate(isConnected && unitsQuery.data ? unitsQuery.data : []) }, [isConnected, unitsQuery.data, hydrate])
  const storeUnits = useMapStudio(state => state.units)
  const units = isConnected && activeLayout && unitsQuery.data ? storeUnits.filter(unit => unit.projectId === projectId && unit.layoutId === activeLayout.id) : []
  const selectedId = useMapStudio(state => state.selectedId)
  const tool = useMapStudio(state => state.tool)
  const undoStack = useMapStudio(state => state.undoStack)
  const redoStack = useMapStudio(state => state.redoStack)
  const setTool = useMapStudio(state => state.setTool)
  const select = useMapStudio(state => state.select)
  const updateGeometry = useMapStudio(state => state.updateGeometry)
  const beginGeometryEdit = useMapStudio(state => state.beginGeometryEdit)
  const commitGeometryEdit = useMapStudio(state => state.commitGeometryEdit)
  const undo = useMapStudio(state => state.undo)
  const redo = useMapStudio(state => state.redo)
  const selected = units.find(unit => unit.id === selectedId)
  useEffect(() => { if (requestedUnitId && units.some(unit => unit.id === requestedUnitId)) select(requestedUnitId) }, [requestedUnitId, units, select])
  const [newGeometry, setNewGeometry] = useState<UnitGeometry>()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const form = useForm<UnitFormValues>({ resolver: zodResolver(unitSchema), defaultValues: { unitNumber: '', unitType: 'PLOT', area: 1500, areaUnit: 'SQFT', price: 3_500_000, currency: 'INR' } })
  const shapes: MapShape[] = useMemo(() => units.map(unit => ({ id: unit.id, geometry: unit.geometry, label: unit.unitNumber, fill: UNIT_STATUS_PRESENTATION[unit.status].fill })), [units])

  function onCreateGeometry(geometry: UnitGeometry) {
    if (!canEditMap) { setMessage('Choose a project and upload a layout before drawing inventory units.'); return }
    setNewGeometry(geometry); form.reset({ unitNumber: '', unitType: 'PLOT', area: 1500, areaUnit: 'SQFT', price: 3_500_000, currency: 'INR' }); setDialogOpen(true)
  }
  async function onSubmit(values: UnitFormValues) {
    if (!newGeometry) return
    if (!isConnected || !projectId) { setMessage('Choose a project before adding inventory units.'); return }
    if (!activeLayout) { setMessage('Upload a layout before adding inventory units.'); return }
    try {
      const created = await vstudioApi.createUnit(projectId, { ...values, layoutId: activeLayout.id, geometry: newGeometry })
      await unitsQuery.refetch(); select(created.id); setDialogOpen(false); setTool('select'); setMessage(`Unit ${values.unitNumber} saved to ${activeProject?.name ?? 'the project'}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The unit could not be saved.') }
  }
  async function uploadBackground(file?: File) {
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type) || file.size > 20 * 1024 * 1024) { setMessage('Choose a PNG, JPG, or WebP plan under 20 MB.'); return }
    if (!isConnected) { setMessage('Choose a project from Projects before uploading a persistent layout.'); return }
    setMessage('Uploading and validating layout…')
    try {
      const bitmap = await createImageBitmap(file)
      if (bitmap.width < 1 || bitmap.height < 1) { bitmap.close(); throw new Error('The selected image has invalid dimensions.') }
      let intent
      try {
        intent = await vstudioApi.createLayoutUploadIntent(projectId!, { name: file.name.replace(/\.[^.]+$/, '') || 'Site layout', fileName: file.name, contentType: file.type, size: file.size, width: bitmap.width, height: bitmap.height })
      } finally { bitmap.close() }
      const upload = await fetch(intent.uploadUrl, { method: 'PUT', headers: intent.uploadHeaders, body: file })
      if (!upload.ok) throw new Error('Object storage rejected the upload. Check the bucket CORS and signed URL settings.')
      await vstudioApi.confirmLayoutUpload(intent.layoutId)
      await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      const refreshedProject = await projectQuery.refetch()
      if (refreshedProject.data?.layouts.some(layout => layout.id === intent.layoutId)) setSelectedLayoutId(intent.layoutId)
      setMessage('Layout uploaded and validated. You can now map units onto it.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The layout could not be uploaded.') }
  }
  async function saveChanges() {
    if (!isConnected || !activeLayout || !unitsQuery.data) { setMessage('Choose a project and upload a layout before saving map changes.'); return }
    const original = new Map(unitsQuery.data.map(unit => [unit.id, JSON.stringify(unit.geometry)]))
    const changed = units.filter(unit => original.has(unit.id) && original.get(unit.id) !== JSON.stringify(unit.geometry))
    try {
      await Promise.all(changed.map(unit => vstudioApi.updateUnitGeometry(unit.id, unit.geometry, unit.version ?? 1)))
      await unitsQuery.refetch()
      setMessage(changed.length ? `Saved geometry for ${changed.length} unit${changed.length === 1 ? '' : 's'}.` : 'All map changes are saved.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Map changes could not be saved.') }
  }
  async function changeStatus(id: string, status: UnitStatus) {
    const unit = units.find(item => item.id === id)
    if (status === 'SOLD' && unit && !window.confirm(`Mark ${unit.unitNumber} as sold? Sold units cannot be returned to available inventory.`)) return
    if (!isConnected) { setMessage('Choose a project before changing unit availability.'); return }
    try { await vstudioApi.updateUnitStatus(id, { status }); await unitsQuery.refetch(); setMessage('Unit availability updated.') }
    catch (error) { setMessage(error instanceof ApiError ? error.message : 'The unit status could not be updated.') }
  }
  async function deleteSelected() {
    if (!selected) return
    if (!isConnected) { setMessage('Choose a project before removing inventory units.'); return }
    if (!window.confirm(`Remove ${selected.unitNumber} from inventory?`)) return
    try { await vstudioApi.deleteUnit(selected.id); await unitsQuery.refetch(); select(undefined); setMessage('Unit removed from inventory.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'The unit could not be removed.') }
  }

  return <div className="map-studio-page">
    <div className="page-title-row"><div><p className="page-eyebrow">PROJECT · {activeProject?.name.toUpperCase() ?? 'SELECT A PROJECT'} / LAYOUT · {activeLayout?.name.toUpperCase() ?? 'NO LAYOUT SELECTED'}</p><h1 className="page-title">Map Studio</h1><p className="page-subtitle">{activeLayout ? `Draw and manage units against the layout’s ${activeLayout.width} × ${activeLayout.height} coordinate space.` : 'Select a project and upload its layout to start mapping inventory.'}</p></div><div className="title-actions"><label className="studio-project-picker"><span>Project</span><select className="sanui-select filter-select" aria-label="Select project for Map Studio" value={projectId ?? ''} onChange={event => { setSelectedLayoutId(undefined); router.push(event.target.value ? `/studio?project=${encodeURIComponent(event.target.value)}` : '/studio') }}><option value="">{projectsQuery.isLoading ? 'Loading projects…' : 'Select a project'}</option>{(projectsQuery.data ?? []).map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>{activeProject && activeProject.layouts.length > 1 && <label className="studio-project-picker"><span>Layout</span><select className="sanui-select filter-select" aria-label="Select layout for Map Studio" value={activeLayout?.id ?? ''} onChange={event => setSelectedLayoutId(event.target.value)}>{activeProject.layouts.map(layout => <option key={layout.id} value={layout.id}>{layout.name}</option>)}</select></label>}{projectsQuery.data?.length === 0 && !projectsQuery.isLoading && <Link className="sanui-button sanui-button--secondary sanui-button--md studio-create-project" href="/projects/new?from=studio">＋ Create project</Link>}<label className={`sanui-button sanui-button--secondary sanui-button--md upload-label${isConnected ? '' : ' is-disabled'}`} aria-disabled={!isConnected} title={isConnected ? 'Upload a layout to this project' : 'Select a project before uploading'}>↑ Upload layout<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!isConnected} onChange={event => { void uploadBackground(event.target.files?.[0]); event.currentTarget.value = '' }} hidden /></label><Button disabled={!canEditMap} onClick={() => void saveChanges()}>Save changes</Button></div></div>
    {!projectId && !projectsQuery.isError && <div className="studio-message" role="status">Choose a project here to upload its layout and save inventory to it.{projectsQuery.data?.length === 0 && <> <Link href="/projects/new?from=studio">Create your first project</Link></>}</div>}
    {message && <div className="studio-message" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
    {isConnected && activeLayout && !unitsQuery.isLoading && !unitsQuery.isError && !assetQuery.isLoading && !assetQuery.isError && <div className="map-studio-toolbar" aria-label="Map drawing tools">
      {toolItems.map(item => <button key={item.tool} type="button" className={`tool-button${tool === item.tool ? ' is-active' : ''}`} aria-pressed={tool === item.tool} disabled={!canEditMap} onClick={() => setTool(item.tool)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
      <span className="tool-divider" />
      <button className="tool-button" type="button" disabled={!canEditMap || !undoStack.length} onClick={undo} aria-label="Undo">↶ Undo</button><button className="tool-button" type="button" disabled={!canEditMap || !redoStack.length} onClick={redo} aria-label="Redo">↷ Redo</button>
      <span className="tool-divider" />
      <button className="tool-button" type="button" disabled={!canEditMap || (!selected && !hasDraft)} onClick={() => { if (hasDraft) { setTool('select'); setHasDraft(false) } else void deleteSelected() }}>{hasDraft ? '× Cancel drawing' : '⌫ Delete'}</button>
    </div>}
    <div className={`map-studio-shell${!isConnected || !activeLayout ? ' map-studio-shell--empty' : ''}`}>
      <section className="map-studio-main" aria-label="Map canvas">
        {!projectId && !projectsQuery.isError && <div className="studio-start-state"><span className="studio-start-state__icon" aria-hidden="true">⌖</span><h2>Select a project to begin</h2><p>Choose a project above to upload its layout and manage its mapped inventory.</p></div>}
        {!projectId && projectsQuery.isError && <div className="studio-start-state" role="alert"><h2>Projects could not be loaded</h2><p>Check your connection, then try again.</p><Button variant="secondary" onClick={() => void projectsQuery.refetch()}>Retry</Button></div>}
        {projectId && projectQuery.isLoading && <div className="studio-start-state" role="status"><h2>Loading project…</h2><p>Preparing the selected project.</p></div>}
        {projectId && projectQuery.isError && <div className="studio-start-state" role="alert"><h2>Project could not be loaded</h2><p>It may have been removed or you may not have access.</p><Button variant="secondary" onClick={() => void projectQuery.refetch()}>Retry</Button></div>}
        {projectId && activeProject && unitsQuery.isError && <div className="studio-start-state" role="alert"><h2>Inventory could not be loaded</h2><p>Retry to load this project’s units.</p><Button variant="secondary" onClick={() => void unitsQuery.refetch()}>Retry</Button></div>}
        {projectId && activeProject && activeLayout && assetQuery.isError && <div className="studio-start-state" role="alert"><h2>Layout image could not be loaded</h2><p>Retry to load the background plan.</p><Button variant="secondary" onClick={() => void assetQuery.refetch()}>Retry</Button></div>}
        {projectId && projectQuery.isSuccess && activeProject && !activeLayout && <div className="studio-start-state"><span className="studio-start-state__icon" aria-hidden="true">▧</span><h2>Upload a layout to get started</h2><p>This project does not have a layout yet. Upload a PNG, JPG, or WebP plan to start mapping units.</p></div>}
        {projectId && activeProject && activeLayout && unitsQuery.isLoading && <div className="studio-start-state" role="status"><h2>Loading inventory…</h2><p>Getting this project’s mapped units.</p></div>}
        {projectId && activeProject && activeLayout && assetQuery.isLoading && <div className="studio-start-state" role="status"><h2>Loading layout…</h2><p>Preparing the plan for editing.</p></div>}
        {projectId && activeProject && activeLayout && !unitsQuery.isError && !assetQuery.isError && !unitsQuery.isLoading && !assetQuery.isLoading && <>
          <div className="map-canvas-wrap"><InteractiveMap width={activeLayout.width} height={activeLayout.height} backgroundUrl={assetQuery.data?.url} backgroundOpacity={0.9} shapes={shapes} selectedId={selectedId} tool={tool} onSelect={select} onCreate={onCreateGeometry} onGeometryChange={updateGeometry} onGeometryEditStart={beginGeometryEdit} onGeometryEditEnd={commitGeometryEdit} onUndo={undo} onRedo={redo} onDraftChange={setHasDraft} ariaLabel={`${activeLayout.name}, interactive unit layout`} /><div className="map-meta"><span>{units.length} mapped units · {activeLayout.name}</span><span>Coordinates: layout-pixel-v1</span></div></div>
        </>}
      </section>
      {isConnected && activeLayout && !unitsQuery.isLoading && !unitsQuery.isError && !assetQuery.isLoading && !assetQuery.isError && <aside>
        {selected ? <section className="detail-panel"><header className="detail-panel__head"><p>Selected unit</p><h2>{selected.unitNumber}</h2></header><div className="detail-fields"><div className="detail-field"><label>Unit type</label><strong>{selected.unitType}</strong></div><div className="detail-field"><label>Area</label><strong>{formatArea(selected.area, selected.areaUnit)}</strong></div><div className="detail-field"><label>List price</label><strong>{formatCurrency(selected.price, selected.currency)}</strong></div><div className="detail-field"><label>Status</label><select className="sanui-select filter-select status-select" value={selected.status} onChange={event => void changeStatus(selected.id, event.target.value as UnitStatus)} aria-label="Change unit status">{Array.from(allowedUnitStatuses(selected.status)).map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></div><div className="detail-field"><label>Updated</label><strong>{new Date(selected.updatedAt).toLocaleString()}</strong></div></div><div className="detail-panel__actions">{allowedUnitStatuses(selected.status).has('SOLD') && <Button className="mark-sold-button" variant="secondary" onClick={() => void changeStatus(selected.id, 'SOLD')}>Mark as sold</Button>}<Button variant="secondary" onClick={() => setTool('edit')}>Edit outline</Button><Button variant="ghost" onClick={() => void deleteSelected()}>Remove from inventory</Button></div></section> : <section className="detail-panel"><header className="detail-panel__head"><p>Map selection</p><h2>Select a unit</h2></header><div className="detail-fields"><p className="no-margin preview-note">Select a plot to edit its outline, move its boundary points, or add new points along an edge.</p><div className="detail-field"><label>Current tool</label><strong>{toolItems.find(item => item.tool === tool)?.label}</strong></div></div></section>}
        <section className="detail-panel map-legend"><span className="legend-title">Availability legend</span>{(['AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED'] as UnitStatus[]).map(status => <span className="legend-item" key={status}><i className={`legend-swatch legend-swatch--${status.toLowerCase()}`} />{status.replace('_', ' ')}</span>)}</section>
      </aside>}
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
