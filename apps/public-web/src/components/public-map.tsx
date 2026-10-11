'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { vstudioApi, type PublicInventoryUnit } from '@vstudio/api-client'
import { InteractiveMap, type MapShape } from '@vstudio/map-engine'
import { UNIT_STATUS_PRESENTATION } from '@vstudio/types'
import { formatArea, formatCurrency } from '@vstudio/utils'
import { Badge, Button } from 'sanui'

export function PublicMap({ slug, embedded = false }: { slug: string; embedded?: boolean }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'AVAILABLE' | 'RESERVED'>('ALL')
  const [selectedId, setSelectedId] = useState<string>()
  const [enquiryOpen, setEnquiryOpen] = useState(false)
  const [enquiryPrepared, setEnquiryPrepared] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [preferredContact, setPreferredContact] = useState<'EMAIL' | 'PHONE'>('EMAIL')
  const [message, setMessage] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const selectedUnitButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (enquiryOpen && !dialog.open) dialog.showModal()
    if (!enquiryOpen && dialog.open) dialog.close()
  }, [enquiryOpen])
  useEffect(() => {
    selectedUnitButtonRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId])
  const query = useQuery({ queryKey: ['public-project', slug], queryFn: () => vstudioApi.publicProject(slug), retry: false, staleTime: 30_000 })
  const shellClass = embedded ? 'embed-shell' : 'public-shell'

  if (query.isLoading) return <main className={shellClass}><section className="public-card public-details"><p>Loading project map…</p></section></main>
  if (query.isError || !query.data) return <main className={shellClass}><section className="public-card public-details"><h1>Project map unavailable</h1><p>This map may be unpublished, or the VStudio API may be offline.</p><Link className="sanui-button sanui-button--secondary sanui-button--md" href="/">Return home</Link></section></main>

  const remote = query.data
  const project = remote.project
  const allUnits = remote.units as PublicInventoryUnit[]
  const layout = remote.layouts[0]
  const availableCount = allUnits.filter(unit => unit.status === 'AVAILABLE').length
  const reservedCount = allUnits.filter(unit => unit.status === 'RESERVED').length
  const matchingUnits = allUnits.filter(unit => (unit.status === 'AVAILABLE' || unit.status === 'RESERVED') && unit.unitNumber.toLowerCase().includes(search.toLowerCase()))
  const visibleUnits = matchingUnits.filter(unit => statusFilter === 'ALL' || unit.status === statusFilter)
  const selected = allUnits.find(unit => unit.id === selectedId)
  const shapes: MapShape[] = visibleUnits.map(unit => ({ id: unit.id, geometry: unit.geometry, label: unit.unitNumber, fill: UNIT_STATUS_PRESENTATION[unit.status].fill }))
  const areaLabel = (unit: PublicInventoryUnit) => unit.area == null ? 'Area not listed' : formatArea(unit.area, unit.areaUnit)
  const priceLabel = (unit: PublicInventoryUnit) => unit.price == null ? 'Price on request' : formatCurrency(unit.price, unit.currency)
  const contactEmail = typeof project.publicConfig?.contactEmail === 'string' ? project.publicConfig.contactEmail : 'sales@example.com'
  const contactPhone = typeof project.publicConfig?.contactPhone === 'string' ? project.publicConfig.contactPhone : ''
  const allowEnquiries = project.publicConfig?.allowEnquiries !== false
  const additionalDetails = selected ? Object.entries(selected.publicMetadata ?? {}).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 4) : []
  const startEnquiry = () => {
    setEnquiryPrepared(false)
    setEnquiryOpen(true)
  }
  const closeEnquiry = () => setEnquiryOpen(false)
  const submitEnquiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const body = [
      `Hello, I’m interested in ${project.name}, unit ${selected.unitNumber}.`,
      '',
      `Name: ${customerName}`,
      `Email: ${customerEmail}`,
      `Phone: ${customerPhone || 'Not provided'}`,
      `Preferred contact: ${preferredContact === 'PHONE' ? 'Phone' : 'Email'}`,
      `Unit: ${selected.unitNumber}`,
      `Availability: ${UNIT_STATUS_PRESENTATION[selected.status].label}`,
      `Type: ${selected.unitType ?? 'Property'}`,
      `Area: ${areaLabel(selected)}`,
      `Price: ${priceLabel(selected)}`,
      '',
      `Message: ${message || 'Please contact me with more information.'}`,
    ].join('\n')
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${selected.unitNumber} · ${project.name}`)}&body=${encodeURIComponent(body)}`
    setEnquiryPrepared(true)
  }
  const selectionPopover = selected ? <article className="map-callout-bubble" aria-label={`Details for unit ${selected.unitNumber}`}><div className="public-map-callout"><div className="map-callout-heading"><span className="map-callout-pin" aria-hidden="true">⌖</span><span className="public-section-label">PINNED TO THIS PLOT</span><button type="button" className="map-callout-close" aria-label="Close unit details" onClick={() => setSelectedId(undefined)}>×</button></div><div className="map-callout-title"><h3>{selected.unitNumber}</h3><Badge tone={selected.status === 'AVAILABLE' ? 'success' : 'warning'}>{UNIT_STATUS_PRESENTATION[selected.status].label}</Badge></div><p className="map-callout-type">{selected.unitType?.toLowerCase() ?? 'Property'}</p><div className="map-callout-facts"><div><small>AREA</small><strong>{areaLabel(selected)}</strong></div><div><small>PRICE</small><strong>{priceLabel(selected)}</strong></div></div>{additionalDetails.length > 0 && <dl className="public-additional-details">{additionalDetails.map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ').trim()}</dt><dd>{String(value)}</dd></div>)}</dl>}<div className="map-callout-actions">{allowEnquiries && <button type="button" className="map-enquiry-button" onClick={startEnquiry}>Enquire about this unit <span aria-hidden="true">→</span></button>}<div className="map-contact-links"><a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${selected.unitNumber}`)}`}>Email</a>{contactPhone && <a href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`}>Call sales</a>}</div></div></div></article> : null
  const content = <>
    <header className="public-header">
      <Link className="public-logo" href="/"><span>V</span> VStudio</Link>
      <div className="public-header-right"><span className="public-live-indicator"><i /> Project availability</span><Button variant="secondary" onClick={() => window.location.assign(`mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${project.name}`)}`)}>Contact sales</Button></div>
    </header>
    <section className="public-hero">
      <div className="public-project-heading">
        <p className="public-eyebrow">PROPERTY COLLECTION <span>／</span> SITE PLAN</p>
        <h1>{project.name}</h1>
        <p className="public-project-location">{project.location || 'Explore this property'}{project.description ? <><span> · </span>{project.description}</> : null}</p>
      </div>
      <div className="public-stat-grid" aria-label="Unit availability summary">
        <div className="public-stat"><span className="public-stat-dot available" /><strong>{availableCount}</strong><small>Available</small></div>
        <div className="public-stat"><span className="public-stat-dot reserved" /><strong>{reservedCount}</strong><small>Reserved</small></div>
        <div className="public-stat public-stat-total"><strong>{allUnits.length}</strong><small>Total units</small></div>
      </div>
    </section>
    <div className="public-project-layout">
      <section className="public-card public-map">
        <div className="public-card-head"><div><span className="public-section-label">INTERACTIVE SITE PLAN</span><h2>Explore the layout</h2><p>Select a highlighted plot to see its details.</p></div><span className="public-count-pill">{visibleUnits.length} {visibleUnits.length === 1 ? 'unit' : 'units'}</span></div>
        {layout ? <><InteractiveMap width={layout.width} height={layout.height} backgroundUrl={layout.assetUrl} shapes={shapes} selectedId={selectedId} focusId={selectedId} selectionPopover={selectionPopover} tool="select" onSelect={setSelectedId} ariaLabel={`${project.name} public site plan`} /><div className="public-legend">{Object.entries(UNIT_STATUS_PRESENTATION).filter(([status]) => status === 'AVAILABLE' || status === 'RESERVED').map(([status, meta]) => <span key={status}><i style={{ background: meta.fill }} />{meta.label}</span>)}</div></> : <div className="empty-state">No map layout is available for this project.</div>}
      </section>
      <aside className="public-card public-inventory">
        <header className="public-card-head"><div><span className="public-section-label">FIND YOUR PROPERTY</span><h2>Available units</h2></div><span className="public-count-pill">{visibleUnits.length}</span></header>
        <div className="public-details">
          <label className="public-search-wrap"><span className="public-search-icon" aria-hidden="true">⌕</span><input className="public-search" value={search} onChange={event => { const value = event.target.value; setSearch(value); if (selected && !selected.unitNumber.toLowerCase().includes(value.toLowerCase())) setSelectedId(undefined) }} placeholder="Search by unit number" aria-label="Search available units" />{search && <button type="button" className="public-search-clear" aria-label="Clear search" onClick={() => { setSearch(''); setSelectedId(undefined) }}>×</button>}</label>
          <div className="public-filter-row" aria-label="Filter units by status">{(['ALL', 'AVAILABLE', 'RESERVED'] as const).map(filter => <button type="button" key={filter} className={`public-filter${statusFilter === filter ? ' is-active' : ''}`} onClick={() => { setStatusFilter(filter); if (filter !== 'ALL' && selected?.status !== filter) setSelectedId(undefined) }}>{filter === 'ALL' ? 'All' : UNIT_STATUS_PRESENTATION[filter].label}</button>)}</div>
          {visibleUnits.length ? <div className="public-unit-list">{visibleUnits.map(unit => <button ref={unit.id === selectedId ? selectedUnitButtonRef : undefined} type="button" key={unit.id} aria-pressed={unit.id === selectedId} className={`public-unit-button${unit.id === selectedId ? ' is-active' : ''}`} onClick={() => setSelectedId(unit.id)}><span className="public-unit-main"><strong>{unit.unitNumber}</strong><small>{areaLabel(unit)} <span>·</span> {unit.unitType?.toLowerCase() ?? 'Property'}</small></span><span className="public-unit-side"><Badge tone={unit.status === 'AVAILABLE' ? 'success' : 'warning'}>{UNIT_STATUS_PRESENTATION[unit.status].label}</Badge><small>{priceLabel(unit)}</small></span></button>)}</div> : <div className="public-empty-units"><span>⌕</span><strong>No units found</strong><p>Try a different search or status filter.</p><button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); setSelectedId(undefined) }}>Clear filters</button></div>}
        </div>
        <div className="public-contact"><p>Need help choosing a property?</p><a href={`mailto:${contactEmail}`}>Talk to our sales team <span aria-hidden="true">→</span></a></div>
      </aside>
    </div>
    <dialog ref={dialogRef} className="public-enquiry-dialog" aria-labelledby="enquiry-dialog-title" onClose={() => setEnquiryOpen(false)} onClick={event => { if (event.target === dialogRef.current) closeEnquiry() }}>
      <button type="button" className="enquiry-dialog-close" aria-label="Close enquiry form" onClick={closeEnquiry}>×</button>
      {selected && (enquiryPrepared ? <div className="enquiry-confirmation"><span className="enquiry-confirmation-icon">✓</span><p className="public-section-label">ENQUIRY READY</p><h2 id="enquiry-dialog-title">Your email app should open</h2><p>Your message for <strong>{selected.unitNumber}</strong> is ready. Send it from your email app to complete the enquiry.</p><a href={`mailto:${contactEmail}`}>{contactEmail}</a><button type="button" className="map-enquiry-button" onClick={closeEnquiry}>Done</button></div> : <><p className="public-section-label">PROPERTY ENQUIRY</p><h2 id="enquiry-dialog-title">Ask about {selected.unitNumber}</h2><p className="enquiry-dialog-intro">Share your details and we’ll prepare an enquiry with this unit’s information.</p><div className="enquiry-unit-summary"><strong>{selected.unitNumber}</strong><span>{areaLabel(selected)} · {priceLabel(selected)}</span></div><form className="enquiry-form" onSubmit={submitEnquiry}><label>Your name<input required minLength={2} maxLength={160} autoComplete="name" value={customerName} onChange={event => setCustomerName(event.target.value)} placeholder="Full name" /></label><label>Email address<input required type="email" maxLength={320} autoComplete="email" value={customerEmail} onChange={event => setCustomerEmail(event.target.value)} placeholder="you@example.com" /></label><label>Mobile number <span className="enquiry-optional">Optional</span><input required={preferredContact === 'PHONE'} type="tel" maxLength={32} autoComplete="tel" value={customerPhone} onChange={event => setCustomerPhone(event.target.value)} placeholder="Include country code" /></label><label>Preferred contact<select value={preferredContact} onChange={event => setPreferredContact(event.target.value as 'EMAIL' | 'PHONE')}><option value="EMAIL">Email</option><option value="PHONE">Phone</option></select></label><label className="enquiry-message-label">Message<textarea rows={3} maxLength={1200} value={message} onChange={event => setMessage(event.target.value)} placeholder="Tell us what you’d like to know" /></label><p className="enquiry-privacy-note">Your details will be included in an email to the project sales team.</p><button type="submit" className="map-enquiry-button">Prepare enquiry email <span aria-hidden="true">→</span></button></form></>)}
    </dialog>
    <footer className="public-footer"><span>Presented by VStudio</span><span>Availability may change. Contact sales to confirm.</span></footer>
  </>
  return <main className={shellClass}>{content}</main>
}
