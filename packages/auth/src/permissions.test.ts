import { describe, expect, it } from 'vitest'
import { assertPermission, hasPermission } from './index.js'

describe('role permissions', () => {
  it('grants editors map access but not user administration', () => {
    expect(hasPermission('EDITOR', 'EDIT_MAP')).toBe(true)
    expect(hasPermission('EDITOR', 'MANAGE_USERS')).toBe(false)
  })

  it('raises a named authorization error for denied permissions', () => {
    expect(() => assertPermission('VIEWER', 'DELETE_PROJECT')).toThrowError(expect.objectContaining({ name: 'ForbiddenError' }))
  })
})
