import type {
  BookingStatus,
  InventoryUnit,
  MapStudioUnit,
  PublicMapConfig,
  PropertyProject,
  UnitDetails,
  UnitCategory,
  UnitStatus,
  UnitType,
} from "@vstudio/types";

export type PublicInventoryUnit = Omit<
  InventoryUnit,
  "area" | "price" | "unitType" | "metadata"
> & { area: number | null; price: number | null; unitType: UnitType | null };
export type ApiLayout = {
  id: string;
  projectId: string;
  name: string;
  width: number;
  height: number;
  version: number;
  originalAssetKey?: string;
  optimizedAssetKey?: string;
};
export type PublicProjectResponse = {
  project: PropertyProject & { publicConfig: PublicMapConfig };
  layouts: Array<{
    id: string;
    name: string;
    width: number;
    height: number;
    assetUrl?: string;
  }>;
  units: PublicInventoryUnit[];
};
export type CreateUnitInput = Omit<
  InventoryUnit,
  | "id"
  | "organizationId"
  | "projectId"
  | "status"
  | "updatedAt"
  | "metadata"
  | "publicMetadata"
  | "version"
> & { layoutId: string; details: UnitDetails; showDetailsOnPublicMap: boolean };
export type UpdateUnitDetailsInput = Omit<
  CreateUnitInput,
  "layoutId" | "geometry"
> & { expectedVersion: number };
export type ApiBookingUnit = Pick<
  InventoryUnit,
  | "id"
  | "unitNumber"
  | "unitType"
  | "area"
  | "areaUnit"
  | "price"
  | "currency"
  | "metadata"
>;
export type ApiBookingRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  unitId: string;
  createdById: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  status: BookingStatus;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ApiBooking = ApiBookingRecord & { unit: ApiBookingUnit };
export type CreateBookingInput = {
  projectId: string;
  unitId: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  notes?: string;
};
export type ApiAuditActivity = {
  id: string;
  actorName: string;
  action: string;
  summary: string;
  projectName?: string;
  occurredAt: string;
  category: string;
};
export type ApiPortfolioReport = {
  generatedAt: string;
  summary: {
    activeProjectCount: number;
    saleUnitCount: number;
    amenityCount: number;
    statusCounts: Record<UnitStatus, number>;
    bookingCounts: Record<BookingStatus, number>;
    openBookingCount: number;
    sellThroughRate: number;
    pipelineValueByCurrency: Array<{ currency: string; amount: number }>;
    availableValueByCurrency: Array<{ currency: string; amount: number }>;
  };
  projects: Array<{
    id: string;
    name: string;
    slug: string;
    location: string | null;
    updatedAt: string;
    saleUnitCount: number;
    amenityCount: number;
    statusCounts: Record<UnitStatus, number>;
    openBookingCount: number;
    sellThroughRate: number;
    pipelineValueByCurrency: Array<{ currency: string; amount: number }>;
  }>;
  projectListLimited: boolean;
};
export type ApiOrganizationMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  roleLabel: string;
  roleIsPrivileged: boolean;
  active: boolean;
  joinedAt: string;
  lastLoginAt: string | null;
};
export type ApiOrganizationInvitation = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  expiresAt: string;
  invitedBy: string;
};
export type ApiPermissionGroup = {
  id: string;
  label: string;
  description: string;
  permissions: Array<{ id: string; label: string; description: string }>;
};
export type ApiRolePermissions = {
  id: string;
  label: string;
  description: string;
  editable: boolean;
  builtIn: boolean;
  permissions: string[];
  defaults: string[];
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class VStudioApiClient {
  constructor(
    private readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000/api/v1",
  ) {}
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    if (init?.body !== undefined && !headers.has("content-type"))
      headers.set("content-type", "application/json");
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      cache:
        init?.cache ??
        (init?.method === undefined || init.method === "GET"
          ? "no-store"
          : undefined),
      headers,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        code?: string;
      };
      throw new ApiError(
        body.message ?? "The request could not be completed.",
        response.status,
        body.code,
      );
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
  projects(includeArchived = false) {
    return this.request<
      Array<PropertyProject & { _count?: { units: number; layouts: number } }>
    >(`/projects${includeArchived ? "?includeArchived=true" : ""}`);
  }
  login(input: { email: string; password: string; organizationId?: string }) {
    return this.request<{
      user: { id: string; name: string; email: string };
      organization: { id: string; name: string; slug: string };
      role: string;
    }>("/auth/login", { method: "POST", body: JSON.stringify(input) });
  }
  register(input: {
    organizationName: string;
    organizationSlug: string;
    name: string;
    email: string;
    password: string;
  }) {
    return this.request<{ user: { id: string; name: string; email: string } }>(
      "/auth/register",
      { method: "POST", body: JSON.stringify(input) },
    );
  }
  me() {
    return this.request<{
      user: { id: string; name: string; email: string; avatarUrl?: string };
      organization: { id: string; name: string; slug: string };
      role: string;
      roleLabel: string;
      permissions: string[];
    }>("/auth/me");
  }
  organizationRolePermissions() {
    return this.request<{ permissionGroups: ApiPermissionGroup[]; roles: ApiRolePermissions[] }>("/organization/role-permissions");
  }
  createOrganizationRole(input: { name: string; description?: string }) {
    return this.request<{ role: ApiRolePermissions }>("/organization/roles", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updateRolePermissions(role: string, permissions: string[]) {
    return this.request<{ role: string; permissions: string[] }>(`/organization/role-permissions/${encodeURIComponent(role)}`, {
      method: "PATCH",
      body: JSON.stringify({ permissions }),
    });
  }
  activity(take = 8) {
    return this.request<ApiAuditActivity[]>(`/activity?take=${encodeURIComponent(take)}`);
  }
  portfolioReport() {
    return this.request<ApiPortfolioReport>("/reports/portfolio");
  }
  organizationMembers() {
    return this.request<{
      members: ApiOrganizationMember[];
      invitations: ApiOrganizationInvitation[];
      roleOptions: Array<{ id: string; label: string; assignable: boolean }>;
    }>("/organization/members");
  }
  inviteOrganizationMember(input: { email: string; role: string }) {
    return this.request<{ invitation: ApiOrganizationInvitation & { inviteUrl: string } }>("/organization/invitations", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updateOrganizationMember(memberId: string, input: { role?: string; active?: boolean }) {
    return this.request<{ success: boolean }>(`/organization/members/${encodeURIComponent(memberId)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  revokeOrganizationInvitation(invitationId: string) {
    return this.request<void>(`/organization/invitations/${encodeURIComponent(invitationId)}`, { method: "DELETE" });
  }
  invitation(token: string) {
    return this.request<{ email: string; role: string; roleLabel: string; organizationName: string; expiresAt: string }>(`/invitations/${encodeURIComponent(token)}`);
  }
  acceptInvitation(token: string, input: { name: string; password: string }) {
    return this.request<{
      user: { id: string; email: string; name: string };
      organization: { id: string; name: string; slug: string };
      role: string;
      roleLabel: string;
      expiresAt: string;
    }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST", body: JSON.stringify(input) });
  }
  updateOrganization(input: { name?: string; slug?: string }) {
    return this.request<{
      organization: { id: string; name: string; slug: string };
    }>("/auth/organization", { method: "PATCH", body: JSON.stringify(input) });
  }
  logout() {
    return this.request<void>("/auth/logout", { method: "POST" });
  }
  project(slug: string) {
    return this.request<
      PropertyProject & { layouts: ApiLayout[]; _count?: { units: number } }
    >(`/projects/${encodeURIComponent(slug)}`);
  }
  createProject(input: {
    name: string;
    slug: string;
    projectType: string;
    description?: string;
    location?: string;
  }) {
    return this.request<PropertyProject>("/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  updateProject(
    projectId: string,
    input: {
      name?: string;
      slug?: string;
      projectType?: string;
      description?: string;
      location?: string;
      status?: "DRAFT" | "ACTIVE";
    },
  ) {
    return this.request<PropertyProject>(
      `/projects/${encodeURIComponent(projectId)}`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  }
  archiveProject(projectId: string) {
    return this.request<PropertyProject>(
      `/projects/${encodeURIComponent(projectId)}/archive`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }
  deleteProject(projectId: string, confirmation: string) {
    return this.request<void>(`/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation }),
    });
  }
  publishProject(projectId: string) {
    return this.request<PropertyProject>(
      `/projects/${encodeURIComponent(projectId)}/publish`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }
  updatePublicSettings(
    projectId: string,
    input: { enabled: boolean; config: PublicMapConfig },
  ) {
    return this.request<{ enabled: boolean; publicUrl: string | null }>(
      `/projects/${encodeURIComponent(projectId)}/public-settings`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  }
  units(projectId: string, query = "") {
    return this.request<InventoryUnit[]>(
      `/projects/${encodeURIComponent(projectId)}/units${query}`,
    );
  }
  mapUnits(projectId: string) {
    return this.request<MapStudioUnit[]>(
      `/projects/${encodeURIComponent(projectId)}/map-units`,
    );
  }
  createUnit(projectId: string, input: CreateUnitInput) {
    return this.request<InventoryUnit>(
      `/projects/${encodeURIComponent(projectId)}/units`,
      { method: "POST", body: JSON.stringify(input) },
    );
  }
  updateUnitDetails(id: string, input: UpdateUnitDetailsInput) {
    return this.request<InventoryUnit>(`/units/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }
  unitForEditing(id: string) {
    return this.request<InventoryUnit>(
      `/units/${encodeURIComponent(id)}/edit-details`,
    );
  }
  updateUnitGeometry(
    id: string,
    geometry: InventoryUnit["geometry"],
    expectedVersion = 1,
  ) {
    return this.request<InventoryUnit>(
      `/units/${encodeURIComponent(id)}/geometry`,
      { method: "PATCH", body: JSON.stringify({ geometry, expectedVersion }) },
    );
  }
  deleteUnit(id: string) {
    return this.request<void>(`/units/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }
  updateUnitStatus(id: string, input: { status: string; reason?: string }) {
    return this.request<InventoryUnit>(
      `/units/${encodeURIComponent(id)}/status`,
      { method: "PATCH", body: JSON.stringify(input) },
    );
  }
  bulkUpdateUnitStatus(unitIds: string[], status: string) {
    return this.request<{ units: Array<{ id: string; status: string }> }>(
      "/units/bulk/status",
      { method: "PATCH", body: JSON.stringify({ unitIds, status }) },
    );
  }
  bulkUpdateUnitCategory(
    projectId: string,
    unitIds: string[],
    category: UnitCategory | null,
  ) {
    return this.request<{
      units: Array<{ id: string; category: UnitCategory | null }>;
    }>("/units/bulk/category", {
      method: "PATCH",
      body: JSON.stringify({ projectId, unitIds, category }),
    });
  }
  previewUnitImport(projectId: string, csv: string) {
    return this.request<{
      totalRows: number;
      validRows: Array<Record<string, unknown>>;
      invalidRows: Array<{
        line: number;
        unitNumber?: string;
        message: string;
      }>;
      canImport: boolean;
    }>(`/projects/${encodeURIComponent(projectId)}/units/import/preview`, {
      method: "POST",
      body: JSON.stringify({ csv }),
    });
  }
  commitUnitImport(projectId: string, csv: string) {
    return this.request<{ imported: number; unitNumbers: string[] }>(
      `/projects/${encodeURIComponent(projectId)}/units/import/commit`,
      { method: "POST", body: JSON.stringify({ csv }) },
    );
  }
  createLayoutUploadIntent(
    projectId: string,
    input: {
      name: string;
      layoutId?: string;
      fileName: string;
      contentType: string;
      size: number;
      width: number;
      height: number;
    },
  ) {
    return this.request<{
      layoutId: string;
      uploadUrl: string;
      uploadHeaders: Record<string, string>;
      expiresInSeconds: number;
    }>(`/projects/${encodeURIComponent(projectId)}/layouts/upload-intents`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  confirmLayoutUpload(layoutId: string) {
    return this.request<{
      id: string;
      width: number;
      height: number;
      optimization: string;
      scaledUnitCount: number;
    }>(`/layouts/${encodeURIComponent(layoutId)}/confirm-upload`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }
  deleteLayout(layoutId: string) {
    return this.request<void>(`/layouts/${encodeURIComponent(layoutId)}`, {
      method: "DELETE",
    });
  }
  layoutAssetUrl(layoutId: string) {
    return this.request<{ url: string; expiresInSeconds: number }>(
      `/layouts/${encodeURIComponent(layoutId)}/asset-url`,
    );
  }
  publicProject(slug: string) {
    return this.request<PublicProjectResponse>(
      `/public/projects/${encodeURIComponent(slug)}`,
    );
  }
  bookings(projectId: string) {
    return this.request<ApiBooking[]>(
      `/projects/${encodeURIComponent(projectId)}/bookings`,
    );
  }
  createBooking(input: CreateBookingInput) {
    return this.request<ApiBookingRecord>("/bookings", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  confirmBooking(bookingId: string) {
    return this.request<ApiBookingRecord>(
      `/bookings/${encodeURIComponent(bookingId)}/confirm`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }
  cancelBooking(bookingId: string) {
    return this.request<ApiBookingRecord>(
      `/bookings/${encodeURIComponent(bookingId)}/cancel`,
      { method: "POST", body: JSON.stringify({}) },
    );
  }
}

export const vstudioApi = new VStudioApiClient();
