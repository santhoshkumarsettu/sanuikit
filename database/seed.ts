import { hash } from 'argon2'
import { PrismaClient } from './generated/index.js'

const prisma = new PrismaClient()
const email = process.env.VSTUDIO_SEED_ADMIN_EMAIL
const password = process.env.VSTUDIO_SEED_ADMIN_PASSWORD
if (!email || !password || password.length < 12) throw new Error('Set VSTUDIO_SEED_ADMIN_EMAIL and a 12+ character VSTUDIO_SEED_ADMIN_PASSWORD before seeding.')

const organization = await prisma.organization.upsert({ where: { slug: 'acme-properties' }, update: {}, create: { name: 'Acme Properties', slug: 'acme-properties' } })
const user = await prisma.user.upsert({ where: { email }, update: { passwordHash: await hash(password), name: 'VStudio Admin' }, create: { email, passwordHash: await hash(password), name: 'VStudio Admin', emailVerified: new Date() } })
await prisma.organizationMember.upsert({ where: { organizationId_userId: { organizationId: organization.id, userId: user.id } }, update: { role: 'OWNER', active: true }, create: { organizationId: organization.id, userId: user.id, role: 'OWNER' } })
const project = await prisma.project.upsert({ where: { organizationId_slug: { organizationId: organization.id, slug: 'green-valley' } }, update: {}, create: { organizationId: organization.id, name: 'Green Valley', slug: 'green-valley', description: 'A considered residential community with landscaped open space.', projectType: 'PLOT_LAYOUT', location: 'Whitefield, Bengaluru', status: 'ACTIVE', publicEnabled: true, publicConfig: { showPrice: true, showArea: true, allowEnquiries: true } } })
const layout = await prisma.layout.upsert({ where: { id: '34ed7d66-9705-4af0-9a34-42a5adf1d1f1' }, update: {}, create: { id: '34ed7d66-9705-4af0-9a34-42a5adf1d1f1', organizationId: organization.id, projectId: project.id, name: 'Master Site Plan', originalAssetKey: 'seed/green-valley-layout.svg', optimizedAssetKey: 'seed/green-valley-layout.svg', width: 1200, height: 760 } })
const inventory = [
  { number: 'A-101', x: 118, y: 155, status: 'AVAILABLE' as const, price: 3_500_000, area: 1500 },
  { number: 'A-102', x: 278, y: 155, status: 'RESERVED' as const, price: 3_650_000, area: 1550 },
  { number: 'A-103', x: 438, y: 155, status: 'AVAILABLE' as const, price: 3_800_000, area: 1600 },
  { number: 'B-201', x: 118, y: 375, status: 'BOOKED' as const, price: 4_100_000, area: 1725 },
  { number: 'B-202', x: 278, y: 375, status: 'AVAILABLE' as const, price: 4_250_000, area: 1800 },
  { number: 'B-203', x: 438, y: 375, status: 'SOLD' as const, price: 4_400_000, area: 1850 },
]
for (const item of inventory) await prisma.unit.upsert({ where: { projectId_unitNumber: { projectId: project.id, unitNumber: item.number } }, update: {}, create: { organizationId: organization.id, projectId: project.id, layoutId: layout.id, unitNumber: item.number, unitType: 'PLOT', area: item.area, areaUnit: 'SQFT', price: item.price, currency: 'INR', status: item.status, geometry: { kind: 'RECTANGLE', x: item.x, y: item.y, width: 132, height: 164 } } })
await prisma.$disconnect()
