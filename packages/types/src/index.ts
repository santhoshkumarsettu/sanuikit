export type Id = string;
export type CurrencyCode = "INR" | "USD" | "EUR";
export type AreaUnit = "SQFT" | "SQM" | "ACRE" | "HECTARE";
export type BuiltInOrganizationRole =
  "OWNER" | "ADMIN" | "EDITOR" | "SALES" | "VIEWER";
/** Custom roles use their organization-scoped role ID as the permission key. */
export type OrganizationRole = BuiltInOrganizationRole | (string & {});
export type ProjectType =
  | "PLOT_LAYOUT"
  | "APARTMENT"
  | "VILLA"
  | "COMMERCIAL"
  | "OFFICE"
  | "PARKING"
  | "WAREHOUSE"
  | "FLOOR_PLAN"
  | "CUSTOM";
export type ProjectStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type UnitType =
  | "PLOT"
  | "APARTMENT"
  | "VILLA"
  | "OFFICE"
  | "SHOP"
  | "PARKING"
  | "ROOM"
  | "WAREHOUSE"
  | "CUSTOM";
export type UnitStatus =
  "AVAILABLE" | "RESERVED" | "BOOKED" | "SOLD" | "BLOCKED" | "OFF_MARKET";
export type UnitPurpose = "SALE" | "AMENITY";
export type UnitFacing = "EAST" | "NORTH" | "WEST" | "SOUTH";
export type UnitCategory = "GOLD" | "PLATINUM" | "SILVER" | "REGULAR";
export type BookingStatus =
  "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED" | "COMPLETED";

export interface PublicMapConfig {
  showPrice?: boolean;
  showArea?: boolean;
  showUnitType?: boolean;
  allowEnquiries?: boolean;
  showSoldUnits?: boolean;
  contactEmail?: string;
  contactPhone?: string;
}

export interface UnitCustomAttribute {
  label: string;
  value: string;
}

export interface UnitDetails {
  customTypeName?: string;
  description?: string;
  block?: string;
  floor?: string;
  facing?: UnitFacing;
  category?: UnitCategory;
  bedrooms?: number;
  bathrooms?: number;
  parkingSpaces?: number;
  parkingType?: "CAR" | "TWO_WHEELER" | "EV" | "VISITOR" | "OTHER";
  parkingCovered?: boolean;
  roadWidth?: number;
  roadWidthUnit?: "FT" | "M";
  features?: string[];
  customAttributes?: UnitCustomAttribute[];
}

export interface Point {
  x: number;
  y: number;
}
export type UnitGeometry =
  | { kind: "RECTANGLE"; x: number; y: number; width: number; height: number }
  | { kind: "POLYGON"; points: Point[] };

export interface InventoryUnit {
  id: Id;
  organizationId: Id;
  projectId: Id;
  layoutId: Id;
  unitNumber: string;
  unitType: UnitType;
  purpose: UnitPurpose;
  area: number;
  areaUnit: AreaUnit;
  price: number;
  currency: CurrencyCode;
  status: UnitStatus;
  geometry: UnitGeometry;
  metadata?: UnitDetails;
  publicMetadata?: UnitDetails;
  version?: number;
  updatedAt: string;
}

/** Minimal unit data needed to render and edit geometry in Map Studio. */
export interface MapStudioUnit {
  id: Id;
  projectId: Id;
  layoutId: Id;
  unitNumber: string;
  unitType: UnitType;
  purpose: UnitPurpose;
  status: UnitStatus;
  geometry: UnitGeometry;
  category?: UnitCategory;
  customTypeName?: string;
  version: number;
  updatedAt: string;
}

export interface PropertyProject {
  id: Id;
  organizationId: Id;
  name: string;
  slug: string;
  description?: string;
  projectType: ProjectType;
  location?: string;
  logoUrl?: string;
  status: ProjectStatus;
  publicEnabled?: boolean;
  publicConfig?: PublicMapConfig;
  updatedAt: string;
}

export interface PropertyLayout {
  id: Id;
  projectId: Id;
  name: string;
  imageUrl?: string;
  width: number;
  height: number;
  version: number;
}

export * from "./status.js";
export * from "./status-presentation.js";
