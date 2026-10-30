'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { hasPermission } from '@vstudio/auth'
import type { BookingStatus, OrganizationRole } from '@vstudio/types'
import { vstudioApi, type ApiBooking } from '@vstudio/api-client'
import { Badge, Button, Modal } from 'sanui'
import { formatArea, formatCurrency } from '@vstudio/utils'
import { AppShell } from '../../components/app-shell'

const bookingSchema = z.object({
  unitId: z.string().uuid('Choose an available unit'),
  customerName: z.string().trim().min(2, 'Enter the customer name').max(160),
  customerEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(320)]).optional(),
  customerPhone: z.union([z.literal(''), z.string().trim().min(7, 'Enter at least 7 digits').max(32)]).optional(),
  notes: z.string().max(2000).optional(),
})
type BookingFormValues = z.infer<typeof bookingSchema>
const bookingStatuses: BookingStatus[] = ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED']

function statusTone(status: BookingStatus) {
  if (status === 'PENDING') return 'warning'
  if (status === 'CONFIRMED') return 'info'
  if (status === 'COMPLETED') return 'success'
  if (status === 'EXPIRED') return 'danger'
  return 'neutral'
}

function formatBookingStatus(status: BookingStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase()
}

export default function BookingsPage() {
  const queryClient = useQueryClient()
  const [requestedProjectId, setRequestedProjectId] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('project') ?? '')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'ALL' | BookingStatus>('ALL')
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<ApiBooking>()
  const [message, setMessage] = useState('')
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: () => vstudioApi.projects(), retry: false })
  const projects = projectsQuery.data ?? []
  const projectId = requestedProjectId || projects[0]?.id || ''
  const project = projects.find(item => item.id === projectId)
  const bookingsQuery = useQuery({ queryKey: ['bookings', projectId], queryFn: () => vstudioApi.bookings(projectId), enabled: Boolean(projectId), retry: false })
  const unitsQuery = useQuery({ queryKey: ['units', projectId], queryFn: () => vstudioApi.units(projectId), enabled: Boolean(projectId), retry: false })
  const bookings = bookingsQuery.data ?? []
  const availableUnits = (unitsQuery.data ?? []).filter(unit => unit.status === 'AVAILABLE')
  const form = useForm<BookingFormValues>({ resolver: zodResolver(bookingSchema), defaultValues: { unitId: '', customerName: '', customerEmail: '', customerPhone: '', notes: '' } })
  const meQuery = useQuery({ queryKey: ['me'], queryFn: () => vstudioApi.me(), retry: false })
  const role = meQuery.data?.role as OrganizationRole | undefined
  const canCreate = role ? hasPermission(role, 'CREATE_BOOKING') : false
  const canCancel = role ? hasPermission(role, 'CANCEL_BOOKING') : false
  const filtered = useMemo(() => bookings.filter(booking =>
    (status === 'ALL' || booking.status === status) &&
    `${booking.unit.unitNumber} ${booking.customerName} ${booking.customerEmail ?? ''} ${booking.customerPhone ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [bookings, search, status])
  const createMutation = useMutation({
    mutationFn: (values: BookingFormValues) => vstudioApi.createBooking({ ...values, customerEmail: values.customerEmail || undefined, customerPhone: values.customerPhone || undefined, projectId, unitId: values.unitId }),
    onSuccess: async () => { setCreateOpen(false); form.reset(); setMessage('Booking created and unit reserved.'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['bookings', projectId] }), queryClient.invalidateQueries({ queryKey: ['units', projectId] })]) },
    onError: error => setMessage(error instanceof Error ? error.message : 'The booking could not be created.'),
  })
  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => vstudioApi.cancelBooking(bookingId),
    onSuccess: async () => { setMessage('Booking cancelled and unit availability updated.'); await Promise.all([queryClient.invalidateQueries({ queryKey: ['bookings', projectId] }), queryClient.invalidateQueries({ queryKey: ['units', projectId] })]) },
    onError: error => setMessage(error instanceof Error ? error.message : 'The booking could not be cancelled.'),
  })

  function cancelBooking(booking: ApiBooking) {
    if (!window.confirm(`Cancel the booking for ${booking.unit.unitNumber} (${booking.customerName})? The unit will become available again.`)) return false
    cancelMutation.mutate(booking.id)
    return true
  }

  function openCreate() {
    form.reset({ unitId: '', customerName: '', customerEmail: '', customerPhone: '', notes: '' })
    createMutation.reset()
    setCreateOpen(true)
  }

  return <AppShell><div className="bookings-page">
    <div className="page-title-row">
      <div>
        <p className="page-eyebrow">{project?.name ?? 'Workspace bookings'}</p>
        <h1 className="page-title">Bookings</h1>
        <p className="page-subtitle">Track reservations, customer details, and follow-ups for a project.</p>
      </div>
      <div className="title-actions">
        {canCreate && <Button disabled={!projectId} onClick={openCreate}>＋ New booking</Button>}
        <Link className="sanui-button sanui-button--secondary sanui-button--md bookings-inventory-link" href={projectId ? `/inventory?project=${encodeURIComponent(projectId)}` : '/inventory'}>View inventory →</Link>
      </div>
    </div>
    <section className="surface-card bookings-card">
      <div className="inventory-toolbar">
        <select className="sanui-select filter-select bookings-project-select" aria-label="Choose project" value={projectId} onChange={event => { setRequestedProjectId(event.target.value); setSearch(''); setStatus('ALL'); setMessage('') }}>
          <option value="" disabled>Select a project</option>
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <div className="inventory-search"><input placeholder="Search by unit or customer" aria-label="Search bookings" value={search} onChange={event => setSearch(event.target.value)} /></div>
        <select className="sanui-select filter-select" aria-label="Filter booking status" value={status} onChange={event => setStatus(event.target.value as 'ALL' | BookingStatus)}>
          <option value="ALL">All booking statuses</option>
          {bookingStatuses.map(item => <option key={item} value={item}>{formatBookingStatus(item)}</option>)}
        </select>
        <span className="result-count">{filtered.length} bookings</span>
      </div>
      {message && <div className="bookings-message" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message">×</button></div>}
      {projectsQuery.isLoading ? <div className="empty-state">Loading projects…</div>
        : projectsQuery.isError ? <div className="empty-state" role="alert">Couldn’t load projects. <Button size="sm" variant="secondary" onClick={() => void projectsQuery.refetch()}>Retry</Button></div>
        : !projectId ? <div className="empty-state">Create a project before managing bookings. <Link className="text-link" href="/projects/new">Create project →</Link></div>
        : bookingsQuery.isLoading ? <div className="empty-state">Loading bookings…</div>
        : bookingsQuery.isError ? <div className="empty-state" role="alert">Couldn’t load bookings for {project?.name ?? 'this project'}. <Button size="sm" variant="secondary" onClick={() => void bookingsQuery.refetch()}>Retry</Button></div>
        : <>
          <div className="table-scroll">
            <table className="inventory-table bookings-table">
              <thead><tr><th>Unit</th><th>Customer</th><th>Status</th><th>Unit value</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>{filtered.map(booking => <tr key={booking.id}>
                <td><strong>{booking.unit.unitNumber}</strong><small className="table-secondary">{booking.unit.unitType.replaceAll('_', ' ')}</small></td>
                <td><strong>{booking.customerName}</strong><small className="table-secondary">{booking.customerEmail || booking.customerPhone || 'No contact details'}</small></td>
                <td><Badge tone={statusTone(booking.status)}>{formatBookingStatus(booking.status)}</Badge></td>
                <td>{formatCurrency(booking.unit.price, booking.unit.currency)}</td>
                <td>{new Date(booking.createdAt).toLocaleDateString()}</td>
                <td><div className="bookings-row-actions"><button type="button" className="text-button" onClick={() => setSelectedBooking(booking)}>Details</button>{canCancel && (booking.status === 'PENDING' || booking.status === 'CONFIRMED') && <button type="button" className="text-button bookings-cancel-action" disabled={cancelMutation.isPending} onClick={() => cancelBooking(booking)}>Cancel</button>}</div></td>
              </tr>)}</tbody>
            </table>
            {filtered.length === 0 && <div className="empty-state">{bookings.length ? 'No bookings match your search and status filter.' : <>No bookings for {project?.name ?? 'this project'} yet.{canCreate && availableUnits.length > 0 && <> <button className="text-button" type="button" onClick={openCreate}>Create the first booking →</button></>}</>}</div>}
          </div>
          <div className="list-footer">Showing {filtered.length} of {bookings.length} bookings{project ? ` in ${project.name}` : ''}</div>
        </>}
    </section>

    <Modal open={createOpen} title="Create booking" onClose={() => setCreateOpen(false)} footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={createMutation.isPending || availableUnits.length === 0} onClick={form.handleSubmit(values => createMutation.mutate(values))}>{createMutation.isPending ? 'Creating…' : 'Create booking'}</Button></>}>
      <form className="booking-form" onSubmit={form.handleSubmit(values => createMutation.mutate(values))}>
        <p className="booking-form__context">{project?.name} · A successful booking reserves the selected unit for 48 hours.</p>
        <div className="form-field"><label htmlFor="booking-unit">Available unit</label><select id="booking-unit" {...form.register('unitId')} disabled={unitsQuery.isLoading || availableUnits.length === 0}><option value="">{unitsQuery.isLoading ? 'Loading units…' : availableUnits.length ? 'Choose a unit' : 'No available units'}</option>{availableUnits.map(unit => <option key={unit.id} value={unit.id}>{unit.unitNumber} · {unit.unitType.replaceAll('_', ' ')} · {formatCurrency(unit.price, unit.currency)}</option>)}</select>{form.formState.errors.unitId && <small className="form-error">{form.formState.errors.unitId.message}</small>}{unitsQuery.isError && <small className="form-error">Couldn’t load units for this project.</small>}</div>
        <div className="form-field"><label htmlFor="booking-customer-name">Customer name</label><input id="booking-customer-name" autoComplete="name" placeholder="Customer name" {...form.register('customerName')} />{form.formState.errors.customerName && <small className="form-error">{form.formState.errors.customerName.message}</small>}</div>
        <div className="form-grid"><div className="form-field"><label htmlFor="booking-customer-email">Email</label><input id="booking-customer-email" type="email" autoComplete="email" placeholder="name@example.com" {...form.register('customerEmail')} />{form.formState.errors.customerEmail && <small className="form-error">{form.formState.errors.customerEmail.message}</small>}</div><div className="form-field"><label htmlFor="booking-customer-phone">Phone</label><input id="booking-customer-phone" type="tel" autoComplete="tel" placeholder="Phone number" {...form.register('customerPhone')} /></div></div>
        <div className="form-field"><label htmlFor="booking-notes">Notes <span className="field-hint">Optional</span></label><textarea id="booking-notes" rows={3} placeholder="Add follow-up details" {...form.register('notes')} />{form.formState.errors.notes && <small className="form-error">{form.formState.errors.notes.message}</small>}</div>
        {createMutation.error && <p className="form-error" role="alert">{createMutation.error.message}</p>}
      </form>
    </Modal>

    <Modal open={Boolean(selectedBooking)} title="Booking details" onClose={() => setSelectedBooking(undefined)} footer={<><Button variant="secondary" onClick={() => setSelectedBooking(undefined)}>Close</Button>{selectedBooking && canCancel && (selectedBooking.status === 'PENDING' || selectedBooking.status === 'CONFIRMED') && <Button variant="secondary" disabled={cancelMutation.isPending} onClick={() => { if (cancelBooking(selectedBooking)) setSelectedBooking(undefined) }}>Cancel booking</Button>}</>}>
      {selectedBooking && <div className="booking-details"><div><small>Unit</small><strong>{selectedBooking.unit.unitNumber} · {selectedBooking.unit.unitType.replaceAll('_', ' ')}</strong></div><div><small>Customer</small><strong>{selectedBooking.customerName}</strong></div><div><small>Email</small><strong>{selectedBooking.customerEmail || 'Not provided'}</strong></div><div><small>Phone</small><strong>{selectedBooking.customerPhone || 'Not provided'}</strong></div><div><small>Status</small><Badge tone={statusTone(selectedBooking.status)}>{formatBookingStatus(selectedBooking.status)}</Badge></div><div><small>Unit area</small><strong>{formatArea(selectedBooking.unit.area, selectedBooking.unit.areaUnit)}</strong></div><div><small>Unit value</small><strong>{formatCurrency(selectedBooking.unit.price, selectedBooking.unit.currency)}</strong></div><div><small>Created</small><strong>{new Date(selectedBooking.createdAt).toLocaleString()}</strong></div><div><small>Reservation expires</small><strong>{selectedBooking.expiresAt ? new Date(selectedBooking.expiresAt).toLocaleString() : 'No expiry'}</strong></div>{selectedBooking.notes && <div className="booking-details__notes"><small>Notes</small><p>{selectedBooking.notes}</p></div>}</div>}
    </Modal>
  </div></AppShell>
}
