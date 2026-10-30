export type Id = string
export type CurrencyCode = 'INR' | 'USD' | 'EUR'
export type AreaUnit = 'SQFT' | 'SQM' | 'ACRE' | 'HECTARE'
export type OrganizationRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'SALES' | 'VIEWER'
export type ProjectType = 'PLOT_LAYOUT' | 'APARTMENT' | 'VILLA' | 'COMMERCIAL' | 'OFFICE' | 'PARKING' | 'WAREHOUSE' | 'FLOOR_PLAN' | 'CUSTOM'
export type ProjectStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type UnitType = 'PLOT' | 'APARTMENT' | 'VILLA' | 'OFFICE' | 'SHOP' | 'PARKING' | 'ROOM' | 'WAREHOUSE' | 'CUSTOM'
export type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'BOOKED' | 'SOLD' | 'BLOCKED' | 'OFF_MARKET'
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED'

export interface Point { x: number; y: number }
export type UnitGeometry =
  | { kind: 'RECTANGLE'; x: number; y: number; width: number; height: number }
  | { kind: 'POLYGON'; points: Point[] }

export interface InventoryUnit {
  id: Id
  organizationId: Id
  projectId: Id
  layoutId: Id
  unitNumber: string
  unitType: UnitType
  area: number
  areaUnit: AreaUnit
  price: number
  currency: CurrencyCode
  status: UnitStatus
  geometry: UnitGeometry
  publicMetadata?: Record<string, unknown>
  version?: number
  updatedAt: string
}

export interface PropertyProject {
  id: Id
  organizationId: Id
  name: string
  slug: string
  description?: string
  projectType: ProjectType
  location?: string
  status: ProjectStatus
  publicEnabled?: boolean
  updatedAt: string
}

export interface PropertyLayout {
  id: Id
  projectId: Id
  name: string
  imageUrl?: string
  width: number
  height: number
  version: number
}

export * from './status.js'
export * from './status-presentation.js'
