import type { InventoryUnit, PropertyLayout, PropertyProject } from '@vstudio/types'

export const demoProject: PropertyProject = {
  id: 'project-green-valley', organizationId: 'org-demo', name: 'Green Valley', slug: 'green-valley',
  description: 'A considered residential community framed by open green space.', projectType: 'PLOT_LAYOUT',
  location: 'Whitefield, Bengaluru', status: 'ACTIVE', updatedAt: new Date('2026-10-10T10:30:00.000Z').toISOString(),
}

export const demoLayout: PropertyLayout = { id: 'layout-master-plan', projectId: demoProject.id, name: 'Master Site Plan', width: 1200, height: 760, version: 1 }

const sampleUnits = [
  ['A-101', 'AVAILABLE', 3_500_000, 1500, 110, 125], ['A-102', 'RESERVED', 3_650_000, 1550, 275, 125], ['A-103', 'AVAILABLE', 3_800_000, 1600, 440, 125],
  ['B-201', 'BOOKED', 4_100_000, 1725, 110, 355], ['B-202', 'AVAILABLE', 4_250_000, 1800, 275, 355], ['B-203', 'SOLD', 4_400_000, 1850, 440, 355],
  ['C-301', 'AVAILABLE', 4_650_000, 1950, 110, 585], ['C-302', 'BLOCKED', 4_800_000, 2000, 275, 585], ['C-303', 'AVAILABLE', 4_950_000, 2100, 440, 585],
] as const

export const demoUnits: InventoryUnit[] = sampleUnits.map(([unitNumber, status, price, area, x, y]) => ({
  id: `unit-${unitNumber.toLowerCase()}`, organizationId: demoProject.organizationId, projectId: demoProject.id,
  layoutId: demoLayout.id, unitNumber, unitType: 'PLOT', area, areaUnit: 'SQFT', price, currency: 'INR', status,
  geometry: { kind: 'RECTANGLE', x, y, width: 132, height: 164 }, updatedAt: demoProject.updatedAt,
}))
