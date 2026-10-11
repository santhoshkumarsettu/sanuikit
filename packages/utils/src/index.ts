export function slugify(value: string): string { return value.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
export function formatCurrency(amount: number, currency = 'INR', locale = 'en-IN'): string { return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount) }
export function formatArea(area: number, unit: string): string { return `${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(area)} ${unit.toLowerCase()}` }
export function assertNever(value: never): never { throw new Error(`Unexpected value: ${String(value)}`) }
export * from './demo-data.js'
