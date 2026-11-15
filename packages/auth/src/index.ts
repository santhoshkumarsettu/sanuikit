import type { OrganizationRole } from '@vstudio/types'

export type Permission =
  | 'VIEW_DASHBOARD' | 'VIEW_PROJECTS' | 'VIEW_MAP' | 'VIEW_INVENTORY'
  | 'CREATE_PROJECT' | 'EDIT_PROJECT' | 'DELETE_PROJECT' | 'UPLOAD_LAYOUT' | 'EDIT_MAP'
  | 'CREATE_UNIT' | 'EDIT_UNIT' | 'DELETE_UNIT' | 'UPDATE_STATUS'
  | 'VIEW_BOOKINGS' | 'CREATE_BOOKING' | 'CANCEL_BOOKING'
  | 'VIEW_REPORTS' | 'EXPORT_DATA'
  | 'VIEW_SETTINGS' | 'EDIT_ORGANIZATION_SETTINGS' | 'MANAGE_USERS'
  | 'MANAGE_API_KEYS' | 'VIEW_AUDIT_LOGS'

export type PermissionGroup = {
  id: string
  label: string
  description: string
  permissions: Array<{ id: Permission; label: string; description: string }>
}

export const permissionGroups: PermissionGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'Open workspace pages and projects.',
    permissions: [
      { id: 'VIEW_DASHBOARD', label: 'View dashboard', description: 'See workspace metrics and recent activity.' },
      { id: 'VIEW_PROJECTS', label: 'View projects', description: 'Browse projects and project details.' },
      { id: 'CREATE_PROJECT', label: 'Create projects', description: 'Create new property projects.' },
      { id: 'EDIT_PROJECT', label: 'Edit projects', description: 'Change project details and publish public maps.' },
      { id: 'DELETE_PROJECT', label: 'Archive or delete projects', description: 'Archive or permanently delete projects.' },
    ],
  },
  {
    id: 'maps',
    label: 'Map Studio',
    description: 'Open project layouts and work with mapped property shapes. Inventory details are controlled separately.',
    permissions: [
      { id: 'VIEW_MAP', label: 'View Map Studio', description: 'View layout images, unit outlines, labels, and statuses without inventory prices or private unit details.' },
      { id: 'UPLOAD_LAYOUT', label: 'Upload layouts', description: 'Add, replace, or remove layout files.' },
      { id: 'EDIT_MAP', label: 'Edit map geometry', description: 'Draw, move, and reshape mapped units.' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    description: 'Browse and manage inventory units.',
    permissions: [
      { id: 'VIEW_INVENTORY', label: 'View inventory', description: 'Browse units and see their areas, prices, and detailed inventory information.' },
      { id: 'CREATE_UNIT', label: 'Create units', description: 'Add sale units or amenities to a layout.' },
      { id: 'EDIT_UNIT', label: 'Edit unit details', description: 'Change unit information and import inventory.' },
      { id: 'DELETE_UNIT', label: 'Delete units', description: 'Remove inventory units.' },
      { id: 'UPDATE_STATUS', label: 'Change unit status', description: 'Reserve, book, sell, block, or reopen a unit.' },
    ],
  },
  {
    id: 'sales',
    label: 'Bookings & reports',
    description: 'View customer bookings and export business data.',
    permissions: [
      { id: 'VIEW_BOOKINGS', label: 'View bookings', description: 'See booking and customer details.' },
      { id: 'CREATE_BOOKING', label: 'Create bookings', description: 'Reserve an available unit for a customer.' },
      { id: 'CANCEL_BOOKING', label: 'Cancel bookings', description: 'Cancel a reservation or booking.' },
      { id: 'VIEW_REPORTS', label: 'View reports', description: 'Open workspace reports and summaries.' },
      { id: 'EXPORT_DATA', label: 'Export data', description: 'Download inventory and report data.' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    description: 'Manage team access, workspace settings, and audit history.',
    permissions: [
      { id: 'VIEW_SETTINGS', label: 'View settings', description: 'Open personal appearance and workspace settings.' },
      { id: 'EDIT_ORGANIZATION_SETTINGS', label: 'Edit organization settings', description: 'Change the workspace name and URL.' },
      { id: 'MANAGE_USERS', label: 'Manage members and roles', description: 'Invite, update, or deactivate workspace members.' },
      { id: 'MANAGE_API_KEYS', label: 'Manage API keys', description: 'Create and revoke organization API keys.' },
      { id: 'VIEW_AUDIT_LOGS', label: 'View recent activity', description: 'Review the workspace audit history.' },
    ],
  },
]

export const permissionDefinitions = permissionGroups.flatMap(group => group.permissions)
export const permissionIds = permissionDefinitions.map(permission => permission.id)
export const organizationRoleDefinitions: Array<{ id: OrganizationRole; label: string; description: string }> = [
  { id: 'OWNER', label: 'Owner', description: 'Full workspace control. Owner access cannot be restricted.' },
  { id: 'ADMIN', label: 'Admin', description: 'Manage workspace operations and team access.' },
  { id: 'EDITOR', label: 'Editor', description: 'Create and maintain projects, maps, and inventory.' },
  { id: 'SALES', label: 'Sales', description: 'Work with customer bookings and sales reports.' },
  { id: 'VIEWER', label: 'Viewer', description: 'Read project, map, inventory, and report information.' },
]

const ownerPermissions = new Set<Permission>(permissionIds)
const rolePermissions: Record<Extract<OrganizationRole, 'OWNER' | 'ADMIN' | 'EDITOR' | 'SALES' | 'VIEWER'>, ReadonlySet<Permission>> = {
  OWNER: ownerPermissions,
  ADMIN: new Set(permissionIds),
  EDITOR: new Set([
    'VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_MAP', 'VIEW_INVENTORY', 'VIEW_BOOKINGS', 'VIEW_REPORTS', 'VIEW_SETTINGS',
    'CREATE_PROJECT', 'EDIT_PROJECT', 'UPLOAD_LAYOUT', 'EDIT_MAP', 'CREATE_UNIT', 'EDIT_UNIT', 'DELETE_UNIT', 'UPDATE_STATUS',
    'CREATE_BOOKING', 'CANCEL_BOOKING', 'EXPORT_DATA',
  ]),
  SALES: new Set([
    'VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_MAP', 'VIEW_INVENTORY', 'VIEW_BOOKINGS', 'VIEW_REPORTS', 'VIEW_SETTINGS',
    'CREATE_BOOKING', 'CANCEL_BOOKING',
  ]),
  VIEWER: new Set([
    'VIEW_DASHBOARD', 'VIEW_PROJECTS', 'VIEW_MAP', 'VIEW_INVENTORY', 'VIEW_REPORTS', 'VIEW_SETTINGS',
  ]),
}

export type PermissionOverrides = Partial<Record<Permission, boolean>>

export function permissionsFor(role: OrganizationRole | string, overrides?: PermissionOverrides): ReadonlySet<Permission> {
  if (role === 'OWNER') return ownerPermissions
  const defaults = rolePermissions[role as keyof typeof rolePermissions] ?? new Set<Permission>()
  return new Set(permissionIds.filter(permission => overrides?.[permission] ?? defaults.has(permission)))
}

export function hasPermission(role: OrganizationRole | string, permission: Permission, overrides?: PermissionOverrides): boolean {
  return permissionsFor(role, overrides).has(permission)
}

export function assertPermission(role: OrganizationRole | string, permission: Permission, overrides?: PermissionOverrides): void {
  if (!hasPermission(role, permission, overrides)) {
    const error = new Error(`Missing permission: ${permission}`)
    error.name = 'ForbiddenError'
    throw error
  }
}
