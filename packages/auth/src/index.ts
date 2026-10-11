import type { OrganizationRole } from '@vstudio/types'

export type Permission =
  | 'CREATE_PROJECT' | 'EDIT_PROJECT' | 'DELETE_PROJECT' | 'UPLOAD_LAYOUT' | 'EDIT_MAP'
  | 'CREATE_UNIT' | 'EDIT_UNIT' | 'DELETE_UNIT' | 'UPDATE_STATUS' | 'CREATE_BOOKING'
  | 'CANCEL_BOOKING' | 'VIEW_REPORTS' | 'EXPORT_DATA' | 'MANAGE_USERS'
  | 'MANAGE_API_KEYS' | 'VIEW_AUDIT_LOGS'

const rolePermissions: Record<OrganizationRole, ReadonlySet<Permission>> = {
  OWNER: new Set(['CREATE_PROJECT', 'EDIT_PROJECT', 'DELETE_PROJECT', 'UPLOAD_LAYOUT', 'EDIT_MAP', 'CREATE_UNIT', 'EDIT_UNIT', 'DELETE_UNIT', 'UPDATE_STATUS', 'CREATE_BOOKING', 'CANCEL_BOOKING', 'VIEW_REPORTS', 'EXPORT_DATA', 'MANAGE_USERS', 'MANAGE_API_KEYS', 'VIEW_AUDIT_LOGS']),
  ADMIN: new Set(['CREATE_PROJECT', 'EDIT_PROJECT', 'DELETE_PROJECT', 'UPLOAD_LAYOUT', 'EDIT_MAP', 'CREATE_UNIT', 'EDIT_UNIT', 'DELETE_UNIT', 'UPDATE_STATUS', 'CREATE_BOOKING', 'CANCEL_BOOKING', 'VIEW_REPORTS', 'EXPORT_DATA', 'MANAGE_USERS', 'MANAGE_API_KEYS', 'VIEW_AUDIT_LOGS']),
  EDITOR: new Set(['CREATE_PROJECT', 'EDIT_PROJECT', 'UPLOAD_LAYOUT', 'EDIT_MAP', 'CREATE_UNIT', 'EDIT_UNIT', 'DELETE_UNIT', 'UPDATE_STATUS', 'CREATE_BOOKING', 'CANCEL_BOOKING', 'VIEW_REPORTS', 'EXPORT_DATA']),
  SALES: new Set(['CREATE_BOOKING', 'CANCEL_BOOKING', 'VIEW_REPORTS']),
  VIEWER: new Set(['VIEW_REPORTS']),
}

export function hasPermission(role: OrganizationRole, permission: Permission): boolean { return rolePermissions[role].has(permission) }
export function assertPermission(role: OrganizationRole, permission: Permission): void { if (!hasPermission(role, permission)) { const error = new Error(`Missing permission: ${permission}`); error.name = 'ForbiddenError'; throw error } }
export function permissionsFor(role: OrganizationRole): ReadonlySet<Permission> { return rolePermissions[role] }
