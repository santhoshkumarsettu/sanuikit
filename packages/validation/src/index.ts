import { z } from 'zod'

export const pointSchema = z.object({ x: z.number().finite().min(0), y: z.number().finite().min(0) })
export const geometrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('RECTANGLE'), x: z.number().finite().min(0), y: z.number().finite().min(0), width: z.number().positive(), height: z.number().positive() }),
  z.object({ kind: z.literal('POLYGON'), points: z.array(pointSchema).min(3).max(256) }),
])
export const projectCreateSchema = z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80), projectType: z.enum(['PLOT_LAYOUT', 'APARTMENT', 'VILLA', 'COMMERCIAL', 'OFFICE', 'PARKING', 'WAREHOUSE', 'FLOOR_PLAN', 'CUSTOM']), description: z.string().max(5000).optional(), location: z.string().max(240).optional() })
export const unitCreateSchema = z.object({ layoutId: z.string().uuid(), unitNumber: z.string().trim().min(1).max(40), unitType: z.enum(['PLOT', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOP', 'PARKING', 'ROOM', 'WAREHOUSE', 'CUSTOM']), area: z.number().positive().max(1_000_000), areaUnit: z.enum(['SQFT', 'SQM', 'ACRE', 'HECTARE']), price: z.number().nonnegative().max(1_000_000_000_000), currency: z.enum(['INR', 'USD', 'EUR']).default('INR'), geometry: geometrySchema })
export const unitStatusSchema = z.enum(['AVAILABLE', 'RESERVED', 'BOOKED', 'SOLD', 'BLOCKED', 'OFF_MARKET'])
export const unitStatusTransitionSchema = z.object({ status: unitStatusSchema, reason: z.string().trim().min(3).max(500).optional() })
export const layoutCreateSchema = z.object({ name: z.string().trim().min(2).max(120), width: z.number().int().positive().max(100_000), height: z.number().int().positive().max(100_000), imageKey: z.string().min(1).max(1024) })
export const csvImportRowSchema = z.object({ unit_number: z.string().trim().min(1).max(40), unit_type: z.enum(['PLOT', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOP', 'PARKING', 'ROOM', 'WAREHOUSE', 'CUSTOM']), area: z.coerce.number().positive(), price: z.coerce.number().nonnegative(), status: unitStatusSchema })

export type CreateProjectInput = z.infer<typeof projectCreateSchema>
export type CreateUnitInput = z.infer<typeof unitCreateSchema>
export type CreateLayoutInput = z.infer<typeof layoutCreateSchema>

export function geometryFitsLayout(geometry: z.infer<typeof geometrySchema>, width: number, height: number): boolean {
  if (geometry.kind === 'RECTANGLE') return geometry.x + geometry.width <= width && geometry.y + geometry.height <= height
  return geometry.points.every(point => point.x <= width && point.y <= height)
}
