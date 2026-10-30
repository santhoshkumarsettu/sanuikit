import type { BookingStatus, InventoryUnit, PropertyProject, UnitType } from '@vstudio/types'

export type PublicInventoryUnit = Omit<InventoryUnit, 'area' | 'price' | 'unitType'> & { area: number | null; price: number | null; unitType: UnitType | null }
export type ApiLayout = { id: string; projectId: string; name: string; width: number; height: number; version: number; originalAssetKey?: string; optimizedAssetKey?: string }
export type PublicProjectResponse = { project: PropertyProject & { publicConfig: Record<string, unknown> }; layouts: Array<{ id: string; name: string; width: number; height: number; assetUrl?: string }>; units: PublicInventoryUnit[] }
export type ApiBookingUnit = Pick<InventoryUnit, 'id' | 'unitNumber' | 'unitType' | 'area' | 'areaUnit' | 'price' | 'currency'>
export type ApiBookingRecord = { id: string; organizationId: string; projectId: string; unitId: string; createdById: string; customerName: string; customerEmail: string | null; customerPhone: string | null; status: BookingStatus; expiresAt: string | null; notes: string | null; createdAt: string; updatedAt: string }
export type ApiBooking = ApiBookingRecord & { unit: ApiBookingUnit }
export type CreateBookingInput = { projectId: string; unitId: string; customerName: string; customerEmail?: string; customerPhone?: string; notes?: string }

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = 'ApiError' }
}

export class VStudioApiClient {
  constructor(private readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1') {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    if (init?.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, credentials: 'include', headers })
    if (!response.ok) { const body = await response.json().catch(() => ({})) as { message?: string; code?: string }; throw new ApiError(body.message ?? 'The request could not be completed.', response.status, body.code) }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
  projects(includeArchived = false) { return this.request<Array<PropertyProject & { _count?: { units: number; layouts: number } }>>(`/projects${includeArchived ? '?includeArchived=true' : ''}`) }
  login(input: { email: string; password: string; organizationId?: string }) { return this.request<{ user: { id: string; name: string; email: string }; organization: { id: string; name: string; slug: string }; role: string }>('/auth/login', { method: 'POST', body: JSON.stringify(input) }) }
  register(input: { organizationName: string; organizationSlug: string; name: string; email: string; password: string }) { return this.request<{ user: { id: string; name: string; email: string } }>('/auth/register', { method: 'POST', body: JSON.stringify(input) }) }
  me() { return this.request<{ user: { id: string; name: string; email: string; avatarUrl?: string }; organization: { id: string; name: string; slug: string }; role: string }>('/auth/me') }
  updateOrganization(input: { name?: string; slug?: string }) { return this.request<{ organization: { id: string; name: string; slug: string } }>('/auth/organization', { method: 'PATCH', body: JSON.stringify(input) }) }
  logout() { return this.request<void>('/auth/logout', { method: 'POST' }) }
  project(slug: string) { return this.request<PropertyProject & { layouts: ApiLayout[]; _count?: { units: number } }>(`/projects/${encodeURIComponent(slug)}`) }
  createProject(input: { name: string; slug: string; projectType: string; description?: string; location?: string }) { return this.request<PropertyProject>('/projects', { method: 'POST', body: JSON.stringify(input) }) }
  updateProject(projectId: string, input: { name?: string; slug?: string; projectType?: string; description?: string; location?: string; status?: 'DRAFT' | 'ACTIVE' }) { return this.request<PropertyProject>(`/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify(input) }) }
  archiveProject(projectId: string) { return this.request<PropertyProject>(`/projects/${encodeURIComponent(projectId)}/archive`, { method: 'POST', body: JSON.stringify({}) }) }
  deleteProject(projectId: string, confirmation: string) { return this.request<void>(`/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE', body: JSON.stringify({ confirmation }) }) }
  publishProject(projectId: string) { return this.request<PropertyProject>(`/projects/${encodeURIComponent(projectId)}/publish`, { method: 'POST', body: JSON.stringify({}) }) }
  units(projectId: string, query = '') { return this.request<InventoryUnit[]>(`/projects/${encodeURIComponent(projectId)}/units${query}`) }
  createUnit(projectId: string, input: Omit<InventoryUnit, 'id' | 'organizationId' | 'projectId' | 'status' | 'updatedAt' | 'publicMetadata'> & { layoutId: string }) { return this.request<InventoryUnit>(`/projects/${encodeURIComponent(projectId)}/units`, { method: 'POST', body: JSON.stringify(input) }) }
  updateUnitGeometry(id: string, geometry: InventoryUnit['geometry'], expectedVersion = 1) { return this.request<InventoryUnit>(`/units/${encodeURIComponent(id)}/geometry`, { method: 'PATCH', body: JSON.stringify({ geometry, expectedVersion }) }) }
  deleteUnit(id: string) { return this.request<void>(`/units/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
  updateUnitStatus(id: string, input: { status: string; reason?: string }) { return this.request<InventoryUnit>(`/units/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify(input) }) }
  bulkUpdateUnitStatus(unitIds: string[], status: string) { return this.request<{ units: Array<{ id: string; status: string }> }>('/units/bulk/status', { method: 'PATCH', body: JSON.stringify({ unitIds, status }) }) }
  previewUnitImport(projectId: string, csv: string) { return this.request<{ totalRows: number; validRows: Array<Record<string, unknown>>; invalidRows: Array<{ line: number; unitNumber?: string; message: string }>; canImport: boolean }>(`/projects/${encodeURIComponent(projectId)}/units/import/preview`, { method: 'POST', body: JSON.stringify({ csv }) }) }
  commitUnitImport(projectId: string, csv: string) { return this.request<{ imported: number; unitNumbers: string[] }>(`/projects/${encodeURIComponent(projectId)}/units/import/commit`, { method: 'POST', body: JSON.stringify({ csv }) }) }
  createLayoutUploadIntent(projectId: string, input: { name: string; fileName: string; contentType: string; size: number; width: number; height: number }) { return this.request<{ layoutId: string; uploadUrl: string; uploadHeaders: Record<string, string>; expiresInSeconds: number }>(`/projects/${encodeURIComponent(projectId)}/layouts/upload-intents`, { method: 'POST', body: JSON.stringify(input) }) }
  confirmLayoutUpload(layoutId: string) { return this.request<{ id: string; width: number; height: number; optimization: string }>(`/layouts/${encodeURIComponent(layoutId)}/confirm-upload`, { method: 'POST', body: JSON.stringify({}) }) }
  layoutAssetUrl(layoutId: string) { return this.request<{ url: string; expiresInSeconds: number }>(`/layouts/${encodeURIComponent(layoutId)}/asset-url`) }
  publicProject(slug: string) { return this.request<PublicProjectResponse>(`/public/projects/${encodeURIComponent(slug)}`) }
  bookings(projectId: string) { return this.request<ApiBooking[]>(`/projects/${encodeURIComponent(projectId)}/bookings`) }
  createBooking(input: CreateBookingInput) { return this.request<ApiBookingRecord>('/bookings', { method: 'POST', body: JSON.stringify(input) }) }
  cancelBooking(bookingId: string) { return this.request<ApiBookingRecord>(`/bookings/${encodeURIComponent(bookingId)}/cancel`, { method: 'POST', body: JSON.stringify({}) }) }
}

export const vstudioApi = new VStudioApiClient()
