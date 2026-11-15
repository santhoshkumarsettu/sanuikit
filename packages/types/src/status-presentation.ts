import type { UnitCategory, UnitPurpose, UnitStatus } from './index.js'

export const UNIT_STATUS_PRESENTATION: Record<UnitStatus, { label: string; fill: string; text: string }> = {
  AVAILABLE: { label: 'Available', fill: 'var(--sanui-color-status-available-fill)', text: 'var(--sanui-color-status-available-ink)' },
  RESERVED: { label: 'Reserved', fill: 'var(--sanui-color-status-reserved-fill)', text: 'var(--sanui-color-status-reserved-ink)' },
  BOOKED: { label: 'Booked', fill: 'var(--sanui-color-status-booked-fill)', text: 'var(--sanui-color-status-booked-ink)' },
  SOLD: { label: 'Sold', fill: 'var(--sanui-color-status-sold-fill)', text: 'var(--sanui-color-status-sold-ink)' },
  BLOCKED: { label: 'Blocked', fill: 'var(--sanui-color-status-blocked-fill)', text: 'var(--sanui-color-status-blocked-ink)' },
  OFF_MARKET: { label: 'Off market', fill: 'var(--sanui-color-status-off-market-fill)', text: 'var(--sanui-color-status-off-market-ink)' },
}

export const UNIT_PURPOSE_PRESENTATION: Record<
  UnitPurpose,
  { label: string; fill: string; stroke: string; text: string }
> = {
  SALE: {
    label: 'For sale',
    fill: 'var(--sanui-color-primary-soft)',
    stroke: 'var(--sanui-color-primary)',
    text: 'var(--sanui-color-primary-strong)',
  },
  AMENITY: {
    label: 'Amenity · not for sale',
    fill: 'var(--sanui-color-amenity-fill)',
    stroke: 'var(--sanui-color-amenity)',
    text: 'var(--sanui-color-amenity-strong)',
  },
}

export const UNIT_CATEGORY_PRESENTATION: Record<
  UnitCategory,
  { label: string; fill: string; text: string }
> = {
  GOLD: {
    label: "Gold zone",
    fill: "var(--sanui-color-category-gold-fill)",
    text: "var(--sanui-color-category-gold-ink)",
  },
  PLATINUM: {
    label: "Platinum zone",
    fill: "var(--sanui-color-category-platinum-fill)",
    text: "var(--sanui-color-category-platinum-ink)",
  },
  SILVER: {
    label: "Silver zone",
    fill: "var(--sanui-color-category-silver-fill)",
    text: "var(--sanui-color-category-silver-ink)",
  },
  REGULAR: {
    label: "Regular zone",
    fill: "var(--sanui-color-category-regular-fill)",
    text: "var(--sanui-color-category-regular-ink)",
  },
}
