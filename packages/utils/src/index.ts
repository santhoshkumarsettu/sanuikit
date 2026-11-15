import type { UnitDetails, UnitType } from "@vstudio/types";

export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
export function formatCurrency(
  amount: number,
  currency = "INR",
  locale = "en-IN",
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
export function formatArea(area: number, unit: string): string {
  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(area)} ${unit.toLowerCase()}`;
}
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  PLOT: "Residential plot",
  APARTMENT: "Apartment",
  VILLA: "Villa",
  OFFICE: "Office",
  SHOP: "Shop",
  PARKING: "Parking",
  ROOM: "Room",
  WAREHOUSE: "Warehouse",
  CUSTOM: "Custom",
};
export function getUnitTypeLabel(
  unitType: UnitType | null | undefined,
  details?: Pick<UnitDetails, "customTypeName">,
): string {
  const customTypeName =
    typeof details?.customTypeName === "string"
      ? details.customTypeName.trim()
      : "";
  if (unitType === "CUSTOM") return customTypeName || "Custom unit";
  return unitType ? UNIT_TYPE_LABELS[unitType] : "Property";
}
export * from "./demo-data.js";
