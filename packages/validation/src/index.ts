import { z } from "zod";

export const pointSchema = z.object({
  x: z.number().finite().min(0, "Shape coordinates must stay inside the layout."),
  y: z.number().finite().min(0, "Shape coordinates must stay inside the layout."),
});
export const geometrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("RECTANGLE"),
    x: z.number().finite().min(0, "Shape coordinates must stay inside the layout."),
    y: z.number().finite().min(0, "Shape coordinates must stay inside the layout."),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  z.object({
    kind: z.literal("POLYGON"),
    points: z.array(pointSchema).min(3).max(256),
  }),
]);
export const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(80),
  projectType: z.enum([
    "PLOT_LAYOUT",
    "APARTMENT",
    "VILLA",
    "COMMERCIAL",
    "OFFICE",
    "PARKING",
    "WAREHOUSE",
    "FLOOR_PLAN",
    "CUSTOM",
  ]),
  description: z.string().max(5000).optional(),
  location: z.string().max(240).optional(),
});
export const unitDetailsSchema = z.object({
  customTypeName: z.string().trim().max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  block: z.string().trim().max(80).optional(),
  floor: z.string().trim().max(80).optional(),
  facing: z
    .enum(["EAST", "NORTH", "WEST", "SOUTH"])
    .or(z.literal(""))
    .optional()
    .transform((value) => value || undefined),
  category: z
    .enum(["GOLD", "PLATINUM", "SILVER", "REGULAR"])
    .or(z.literal(""))
    .optional()
    .transform((value) => value || undefined),
  bedrooms: z.number().int().min(0, "Bedrooms cannot be negative.").max(100).optional(),
  bathrooms: z.number().int().min(0, "Bathrooms cannot be negative.").max(100).optional(),
  parkingSpaces: z.number().int().min(0, "Parking spaces cannot be negative.").max(100).optional(),
  parkingType: z
    .enum(["CAR", "TWO_WHEELER", "EV", "VISITOR", "OTHER"])
    .optional(),
  parkingCovered: z.boolean().optional(),
  roadWidth: z.number().positive().max(100_000).optional(),
  roadWidthUnit: z.enum(["FT", "M"]).optional(),
  features: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  customAttributes: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(50),
        value: z.string().trim().min(1).max(160),
      }),
    )
    .max(20)
    .default([]),
});

const unitFieldsBaseSchema = z.object({
  unitNumber: z.string().trim().min(1, "Enter a unit number.").max(40),
  unitType: z.enum([
    "PLOT",
    "APARTMENT",
    "VILLA",
    "OFFICE",
    "SHOP",
    "PARKING",
    "ROOM",
    "WAREHOUSE",
    "CUSTOM",
  ]),
  purpose: z.enum(["SALE", "AMENITY"]).default("SALE"),
  area: z.number().nonnegative("Area cannot be negative.").max(1_000_000),
  areaUnit: z.enum(["SQFT", "SQM", "ACRE", "HECTARE"]),
  price: z
    .number()
    .nonnegative("Price cannot be negative.")
    .max(1_000_000_000_000),
  currency: z.enum(["INR", "USD", "EUR"]).default("INR"),
  details: unitDetailsSchema.default({
    facing: undefined,
    category: undefined,
    features: [],
    customAttributes: [],
  }),
  showDetailsOnPublicMap: z.boolean().default(false),
});

function customTypeNameIssue(
  input: {
    unitType: string;
    purpose: string;
    area: number;
    details: { customTypeName?: string; category?: string };
  },
  context: z.RefinementCtx,
) {
  if (input.unitType === "CUSTOM" && !input.details.customTypeName?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["details", "customTypeName"],
      message: "Name this custom unit type, for example Parking or Road.",
    });
  }
  if (input.purpose === "AMENITY" && input.unitType !== "CUSTOM") {
    context.addIssue({
      code: "custom",
      path: ["unitType"],
      message: "Amenities must use the custom unit type.",
    });
  }
  if (input.purpose === "AMENITY" && input.details.category) {
    context.addIssue({
      code: "custom",
      path: ["details", "category"],
      message: "Zone categories can only be assigned to sale units.",
    });
  }
  if (input.purpose === "SALE" && input.area <= 0) {
    context.addIssue({
      code: "custom",
      path: ["area"],
      message: "Sale units need an area greater than zero.",
    });
  }
}

export const unitFieldsSchema =
  unitFieldsBaseSchema.superRefine(customTypeNameIssue);
export const unitCreateSchema = unitFieldsBaseSchema
  .extend({ layoutId: z.string().uuid(), geometry: geometrySchema })
  .superRefine(customTypeNameIssue);
export const unitUpdateSchema = unitFieldsBaseSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .superRefine(customTypeNameIssue);
export const unitStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "BOOKED",
  "SOLD",
  "BLOCKED",
  "OFF_MARKET",
]);
export const unitStatusTransitionSchema = z.object({
  status: unitStatusSchema,
  reason: z.string().trim().min(3).max(500).optional(),
});
export const layoutCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  width: z.number().int().positive().max(100_000),
  height: z.number().int().positive().max(100_000),
  imageKey: z.string().min(1).max(1024),
});
export const csvImportRowSchema = z.object({
  unit_number: z.string().trim().min(1).max(40),
  unit_type: z.enum([
    "PLOT",
    "APARTMENT",
    "VILLA",
    "OFFICE",
    "SHOP",
    "PARKING",
    "ROOM",
    "WAREHOUSE",
    "CUSTOM",
  ]),
  area: z.coerce.number().positive(),
  price: z.coerce.number().nonnegative(),
  status: unitStatusSchema,
});

export type CreateProjectInput = z.infer<typeof projectCreateSchema>;
export type CreateUnitInput = z.infer<typeof unitCreateSchema>;
export type UpdateUnitInput = z.infer<typeof unitUpdateSchema>;
export type CreateLayoutInput = z.infer<typeof layoutCreateSchema>;

export function geometryFitsLayout(
  geometry: z.infer<typeof geometrySchema>,
  width: number,
  height: number,
): boolean {
  if (geometry.kind === "RECTANGLE")
    return (
      geometry.x >= 0 &&
      geometry.y >= 0 &&
      geometry.x + geometry.width <= width &&
      geometry.y + geometry.height <= height
    );
  return geometry.points.every(
    (point) => point.x >= 0 && point.y >= 0 && point.x <= width && point.y <= height,
  );
}
