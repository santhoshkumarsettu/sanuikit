import { parse } from "csv-parse/sync";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Prisma } from "@vstudio/database/client";
import {
  canTransitionUnitStatus,
  assertUnitStatusTransition,
  type UnitCategory,
  type UnitStatus,
} from "@vstudio/types";
import {
  csvImportRowSchema,
  geometryFitsLayout,
  geometrySchema,
  unitCreateSchema,
  unitDetailsSchema,
  unitStatusTransitionSchema,
  unitUpdateSchema,
} from "@vstudio/validation";
import { withTenant } from "@vstudio/database/tenant";
import { publishOrganizationEvent } from "../realtime/bus.js";

const unitCategories = new Set<UnitCategory>([
  "GOLD",
  "PLATINUM",
  "SILVER",
  "REGULAR",
]);

function serializeUnit<
  T extends { area: { toNumber(): number }; price: { toNumber(): number } },
>(unit: T) {
  return { ...unit, area: unit.area.toNumber(), price: unit.price.toNumber() };
}
function cleanUnitDetails(
  input: z.infer<typeof unitDetailsSchema>,
  unitType: string,
) {
  const customTypeName =
    unitType === "CUSTOM" ? input.customTypeName?.trim() : undefined;
  const isParking =
    unitType === "PARKING" ||
    (unitType === "CUSTOM" && /parking/i.test(customTypeName ?? ""));
  const isRoad =
    unitType === "CUSTOM" && /road|street|drive/i.test(customTypeName ?? "");
  const isResidential =
    ["APARTMENT", "VILLA", "ROOM"].includes(unitType) ||
    (unitType === "CUSTOM" && !isParking && !isRoad);
  const details = {
    ...input,
    customTypeName,
    bedrooms: isResidential ? input.bedrooms : undefined,
    bathrooms: isResidential ? input.bathrooms : undefined,
    parkingSpaces:
      isResidential || isParking ? input.parkingSpaces : undefined,
    parkingType: isParking ? input.parkingType : undefined,
    parkingCovered: isParking ? input.parkingCovered : undefined,
    roadWidth: isRoad ? input.roadWidth : undefined,
    roadWidthUnit:
      isRoad && input.roadWidth !== undefined
        ? (input.roadWidthUnit ?? "FT")
        : undefined,
    features: input.features.map((value) => value.trim()).filter(Boolean),
    customAttributes: input.customAttributes
      .map((attribute) => ({
        label: attribute.label.trim(),
        value: attribute.value.trim(),
      }))
      .filter((attribute) => attribute.label && attribute.value),
  };
  return Object.fromEntries(
    Object.entries(details).filter(
      ([, value]) =>
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );
}
function publicUnitDetails(
  details: Record<string, unknown>,
  showDetailsOnPublicMap: boolean,
  unitType: string,
) {
  const publicDetails = showDetailsOnPublicMap ? { ...details } : {};
  if (unitType === "CUSTOM" && typeof details.customTypeName === "string")
    publicDetails.customTypeName = details.customTypeName;
  else delete publicDetails.customTypeName;
  if (typeof details.category === "string")
    publicDetails.category = details.category;
  else delete publicDetails.category;
  // Facing and zone category are core map discovery data, not private notes.
  // Keep them available publicly even when optional marketing details are hidden.
  if (typeof details.facing === "string")
    publicDetails.facing = details.facing;
  else delete publicDetails.facing;
  return publicDetails;
}
function parseCsvRows(csv: string) {
  if (csv.length > 1_000_000)
    throw Object.assign(new Error("CSV exceeds the 1 MB import limit."), {
      statusCode: 413,
    });
  const records = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: false,
  }) as Record<string, unknown>[];
  if (records.length > 5000)
    throw Object.assign(new Error("CSV imports are limited to 5,000 rows."), {
      statusCode: 413,
    });
  return records.map((record, index) => ({
    line: index + 2,
    result: csvImportRowSchema.safeParse(record),
  }));
}

async function inspectImport(
  tx: Prisma.TransactionClient,
  organizationId: string,
  projectId: string,
  csv: string,
) {
  const parsedRows = parseCsvRows(csv);
  const valid = parsedRows.flatMap((row) =>
    row.result.success ? [{ ...row, data: row.result.data }] : [],
  );
  const errors: { line: number; unitNumber?: string; message: string }[] =
    parsedRows.flatMap((row) =>
      row.result.success
        ? []
        : [
            {
              line: row.line,
              message: row.result.error.issues[0]?.message ?? "Invalid row.",
            },
          ],
    );
  const duplicateNumbers = new Set<string>();
  const seen = new Set<string>();
  for (const row of valid) {
    const number = row.data.unit_number.toLowerCase();
    if (seen.has(number)) duplicateNumbers.add(number);
    seen.add(number);
  }
  for (const row of valid)
    if (duplicateNumbers.has(row.data.unit_number.toLowerCase()))
      errors.push({
        line: row.line,
        unitNumber: row.data.unit_number,
        message: "Duplicate unit number in this import.",
      });
  const units = await tx.unit.findMany({
    where: {
      organizationId,
      projectId,
      unitNumber: { in: valid.map((row) => row.data.unit_number) },
    },
  });
  const byNumber = new Map<
    string,
    { id: string; unitNumber: string; status: UnitStatus; purpose: string }
  >(units.map((unit) => [unit.unitNumber.toLowerCase(), unit]));
  const accepted: {
    line: number;
    data: z.infer<typeof csvImportRowSchema>;
    unitId: string;
    currentStatus: UnitStatus;
  }[] = [];
  for (const row of valid) {
    const data = row.data;
    const unit = byNumber.get(data.unit_number.toLowerCase());
    if (!unit) {
      errors.push({
        line: row.line,
        unitNumber: data.unit_number,
        message: "No mapped visual unit has this unit number.",
      });
      continue;
    }
    if (unit.purpose === "AMENITY") {
      errors.push({
        line: row.line,
        unitNumber: data.unit_number,
        message: "Amenities are not-for-sale and cannot be updated by inventory CSV.",
      });
      continue;
    }
    if (!canTransitionUnitStatus(unit.status, data.status)) {
      errors.push({
        line: row.line,
        unitNumber: data.unit_number,
        message: `Status cannot change from ${unit.status} to ${data.status}.`,
      });
      continue;
    }
    if (duplicateNumbers.has(data.unit_number.toLowerCase())) continue;
    accepted.push({
      line: row.line,
      data,
      unitId: unit.id,
      currentStatus: unit.status,
    });
  }
  return { totalRows: parsedRows.length, accepted, errors };
}

export async function registerInventoryRoutes(app: FastifyInstance) {
  app.get(
    "/projects/:projectId/map-units",
    { preHandler: [app.authenticate, app.requirePermission("VIEW_MAP")] },
    async (request) => {
      const context = request.auth!;
      const { projectId } = request.params as { projectId: string };
      const units = await withTenant(context, (tx) =>
        tx.unit.findMany({
          where: {
            organizationId: context.organizationId,
            projectId,
          },
          select: {
            id: true,
            projectId: true,
            layoutId: true,
            unitNumber: true,
            unitType: true,
            purpose: true,
            status: true,
            geometry: true,
            metadata: true,
            version: true,
            updatedAt: true,
          },
          orderBy: { unitNumber: "asc" },
          take: 1000,
        }),
      );
      return units.map(({ metadata, ...unit }) => {
        const details =
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? (metadata as Record<string, unknown>)
            : undefined;
        const category = details?.category;
        return {
          ...unit,
          category:
            typeof category === "string" &&
            unitCategories.has(category as UnitCategory)
              ? (category as UnitCategory)
              : undefined,
          customTypeName:
            typeof details?.customTypeName === "string"
              ? details.customTypeName
              : undefined,
        };
      });
    },
  );

  app.get(
    "/projects/:projectId/units",
    { preHandler: [app.authenticate, app.requirePermission("VIEW_INVENTORY")] },
    async (request, reply) => {
      const context = request.auth!;
      const params = request.params as { projectId: string };
      const query = request.query as Record<string, string | undefined>;
      const status = query.status?.split(",").filter(Boolean) as
        UnitStatus[] | undefined;
      const minPrice = query.minPrice ? Number(query.minPrice) : undefined;
      const maxPrice = query.maxPrice ? Number(query.maxPrice) : undefined;
      const minArea = query.minArea ? Number(query.minArea) : undefined;
      const maxArea = query.maxArea ? Number(query.maxArea) : undefined;
      if (
        [minPrice, maxPrice, minArea, maxArea].some(
          (value) => value !== undefined && !Number.isFinite(value),
        )
      )
        return reply
          .code(400)
          .send({
            code: "VALIDATION_ERROR",
            message: "Price and area filters must be numeric.",
          });
      const sort = ["unitNumber", "price", "area", "updatedAt"].includes(
        query.sort ?? "",
      )
        ? query.sort!
        : "unitNumber";
      const orderBy = {
        [sort]: query.order === "desc" ? "desc" : "asc",
      } as const;
      const units = await withTenant(context, (tx) =>
        tx.unit.findMany({
          where: {
            organizationId: context.organizationId,
            projectId: params.projectId,
            unitNumber: query.search
              ? { contains: query.search, mode: "insensitive" }
              : undefined,
            unitType: query.type as never,
            status: status?.length ? { in: status } : undefined,
            price: { gte: minPrice, lte: maxPrice },
            area: { gte: minArea, lte: maxArea },
          },
          orderBy,
          take: Math.min(Number(query.limit) || 500, 1000),
        }),
      );
      return units.map(serializeUnit);
    },
  );

  app.post(
    "/projects/:projectId/units",
    { preHandler: [app.authenticate, app.requirePermission("CREATE_UNIT")] },
    async (request, reply) => {
      const parsed = unitCreateSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid unit details.",
          });
      const context = request.auth!;
      const { projectId } = request.params as { projectId: string };
      const result = await withTenant(context, async (tx) => {
        const [project, layout] = await Promise.all([
          tx.project.findFirst({
            where: { id: projectId, organizationId: context.organizationId },
          }),
          tx.layout.findFirst({
            where: {
              id: parsed.data.layoutId,
              projectId,
              organizationId: context.organizationId,
            },
          }),
        ]);
        if (!project || !layout) return { notFound: true as const };
        if (
          !geometryFitsLayout(parsed.data.geometry, layout.width, layout.height)
        )
          return { geometryError: true as const };
        const {
          layoutId,
          geometry,
          details: rawDetails,
          showDetailsOnPublicMap,
          ...fields
        } = parsed.data;
        const details = cleanUnitDetails(rawDetails, fields.unitType);
        const unit = await tx.unit.create({
          data: {
            organizationId: context.organizationId,
            projectId,
            layoutId,
            ...fields,
            area: fields.purpose === "AMENITY" ? 0 : fields.area,
            price: fields.purpose === "AMENITY" ? 0 : fields.price,
            geometry,
            metadata: details as Prisma.InputJsonValue,
            publicMetadata: publicUnitDetails(
              details,
              showDetailsOnPublicMap,
              fields.unitType,
            ) as Prisma.InputJsonValue,
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorId: context.userId,
            action: "UNIT_CREATED",
            entityType: "Unit",
            entityId: unit.id,
            after: {
              unitNumber: unit.unitNumber,
              unitType: unit.unitType,
              status: unit.status,
              geometry,
              details,
            },
            metadata: { showDetailsOnPublicMap },
            ipAddress: request.ip,
          },
        });
        return { unit };
      });
      if ("notFound" in result)
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "Project or layout not found." });
      if ("geometryError" in result)
        return reply
          .code(400)
          .send({
            code: "GEOMETRY_OUT_OF_BOUNDS",
            message:
              "Unit geometry must fit within its layout coordinate space.",
          });
      return reply.code(201).send(serializeUnit(result.unit));
    },
  );

  app.get(
    "/units/:unitId/edit-details",
    {
      preHandler: [app.authenticate, app.requirePermission("EDIT_UNIT")],
    },
    async (request, reply) => {
      const context = request.auth!;
      const { unitId } = request.params as { unitId: string };
      const unit = await withTenant(context, (tx) =>
        tx.unit.findFirst({
          where: { id: unitId, organizationId: context.organizationId },
        }),
      );
      if (!unit)
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "Unit not found." });
      return serializeUnit(unit);
    },
  );

  app.patch(
    "/units/:unitId",
    { preHandler: [app.authenticate, app.requirePermission("EDIT_UNIT")] },
    async (request, reply) => {
      const parsed = unitUpdateSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid unit details.",
          });
      const context = request.auth!;
      const { unitId } = request.params as { unitId: string };
      const result = await withTenant(context, async (tx) => {
        const current = await tx.unit.findFirst({
          where: { id: unitId, organizationId: context.organizationId },
        });
        if (!current) return { notFound: true as const };
        if (current.version !== parsed.data.expectedVersion)
          return { conflict: true as const };
        const clearSaleStatusForAmenity =
          current.purpose !== parsed.data.purpose &&
          parsed.data.purpose === "AMENITY" &&
          ["RESERVED", "BLOCKED", "OFF_MARKET"].includes(current.status);
        if (current.purpose !== parsed.data.purpose) {
          const hasBookings = await tx.booking.findFirst({
            where: { unitId, organizationId: context.organizationId },
            select: { id: true },
          });
          if (hasBookings) return { purposeConflict: true as const };
          if (current.status !== "AVAILABLE" && !clearSaleStatusForAmenity)
            return { statusConflict: current.status };
        }
        const duplicate = await tx.unit.findFirst({
          where: {
            organizationId: context.organizationId,
            projectId: current.projectId,
            unitNumber: parsed.data.unitNumber,
            id: { not: unitId },
          },
          select: { id: true },
        });
        if (duplicate) return { duplicate: true as const };
        const {
          expectedVersion,
          details: rawDetails,
          showDetailsOnPublicMap,
          ...fields
        } = parsed.data;
        const details = cleanUnitDetails(rawDetails, fields.unitType);
        const updatedCount = await tx.unit.updateMany({
          where: {
            id: unitId,
            organizationId: context.organizationId,
            version: expectedVersion,
          },
          data: {
            ...fields,
            ...(clearSaleStatusForAmenity ? { status: "AVAILABLE" as const } : {}),
            area: fields.purpose === "AMENITY" ? 0 : fields.area,
            price: fields.purpose === "AMENITY" ? 0 : fields.price,
            metadata: details as Prisma.InputJsonValue,
            publicMetadata: publicUnitDetails(
              details,
              showDetailsOnPublicMap,
              fields.unitType,
            ) as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (!updatedCount.count) return { conflict: true as const };
        const unit = await tx.unit.findUniqueOrThrow({ where: { id: unitId } });
        await tx.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorId: context.userId,
            action: "UNIT_DETAILS_UPDATED",
            entityType: "Unit",
            entityId: unitId,
            before: {
              unitNumber: current.unitNumber,
              unitType: current.unitType,
              purpose: current.purpose,
              status: current.status,
              area: Number(current.area),
              price: Number(current.price),
              details: current.metadata,
              publicDetails: current.publicMetadata,
              version: current.version,
            },
            after: {
              unitNumber: unit.unitNumber,
              unitType: unit.unitType,
              purpose: unit.purpose,
              status: unit.status,
              area: Number(unit.area),
              price: Number(unit.price),
              details,
              publicDetails: unit.publicMetadata,
              version: unit.version,
            },
            ipAddress: request.ip,
          },
        });
        return { unit };
      });
      if ("notFound" in result)
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "Unit not found." });
      if ("conflict" in result)
        return reply
          .code(409)
          .send({
            code: "WRITE_CONFLICT",
            message:
              "This unit changed in another session. Reload it before saving.",
          });
      if ("purposeConflict" in result)
        return reply
          .code(409)
          .send({
            code: "UNIT_PURPOSE_LOCKED",
            message:
              "This unit has booking history, so its purpose is locked. Keep it as sale inventory or create a separate amenity shape.",
          });
      if ("statusConflict" in result && result.statusConflict)
        return reply
          .code(409)
          .send({
            code: "UNIT_PURPOSE_STATUS",
            message:
              `A ${result.statusConflict.replaceAll("_", " ")} unit cannot be changed to an amenity. Available, Reserved, Blocked, or Off market units with no booking history can be converted.`,
          });
      if ("duplicate" in result)
        return reply
          .code(409)
          .send({
            code: "DUPLICATE_UNIT_NUMBER",
            message: "A unit with this number already exists in the project.",
          });
      void publishOrganizationEvent(context.organizationId, {
        type: "UNIT_DETAILS_UPDATED",
        id: unitId,
        data: {
          unitNumber: result.unit.unitNumber,
          unitType: result.unit.unitType,
          purpose: result.unit.purpose,
          status: result.unit.status,
        },
      }).catch((error) =>
        request.log.warn(
          { err: error },
          "Unable to publish unit details update",
        ),
      );
      return serializeUnit(result.unit);
    },
  );

  app.patch(
    "/units/:unitId/geometry",
    { preHandler: [app.authenticate, app.requirePermission("EDIT_MAP")] },
    async (request, reply) => {
      const parsed = z
        .object({
          geometry: geometrySchema,
          expectedVersion: z.number().int().positive(),
        })
        .safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            code: "VALIDATION_ERROR",
            message:
              parsed.error.issues[0]?.message ?? "Invalid unit geometry.",
          });
      const context = request.auth!;
      const { unitId } = request.params as { unitId: string };
      const result = await withTenant(context, async (tx) => {
        const current = await tx.unit.findFirst({
          where: { id: unitId, organizationId: context.organizationId },
          include: { layout: { select: { width: true, height: true } } },
        });
        if (!current) return { notFound: true as const };
        if (current.version !== parsed.data.expectedVersion)
          return { conflict: true as const };
        if (
          !geometryFitsLayout(
            parsed.data.geometry,
            current.layout.width,
            current.layout.height,
          )
        )
          return { geometryError: true as const };
        const updatedCount = await tx.unit.updateMany({
          where: {
            id: unitId,
            organizationId: context.organizationId,
            version: current.version,
          },
          data: { geometry: parsed.data.geometry, version: { increment: 1 } },
        });
        if (!updatedCount.count) return { conflict: true as const };
        const updated = await tx.unit.findUniqueOrThrow({
          where: { id: unitId },
        });
        await tx.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorId: context.userId,
            action: "UNIT_GEOMETRY_UPDATED",
            entityType: "Unit",
            entityId: unitId,
            before: { geometry: current.geometry, version: current.version },
            after: { geometry: parsed.data.geometry, version: updated.version },
            ipAddress: request.ip,
          },
        });
        return { unit: updated };
      });
      if ("notFound" in result)
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "Unit not found." });
      if ("conflict" in result)
        return reply
          .code(409)
          .send({
            code: "WRITE_CONFLICT",
            message:
              "This unit changed in another session. Reload the layout before saving.",
          });
      if ("geometryError" in result)
        return reply
          .code(400)
          .send({
            code: "GEOMETRY_OUT_OF_BOUNDS",
            message:
              "Unit geometry must fit within its layout coordinate space.",
          });
      void publishOrganizationEvent(context.organizationId, {
        type: "UNIT_GEOMETRY_UPDATED",
        id: unitId,
      }).catch((error) =>
        request.log.warn(
          { err: error },
          "Unable to publish unit geometry update",
        ),
      );
      return serializeUnit(result.unit);
    },
  );

  app.delete(
    "/units/:unitId",
    { preHandler: [app.authenticate, app.requirePermission("DELETE_UNIT")] },
    async (request, reply) => {
      const context = request.auth!;
      const { unitId } = request.params as { unitId: string };
      const removed = await withTenant(context, async (tx) => {
        const unit = await tx.unit.findFirst({
          where: { id: unitId, organizationId: context.organizationId },
        });
        if (!unit) return false;
        if (await tx.booking.count({ where: { unitId: unit.id } }))
          return { conflict: true as const };
        await tx.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorId: context.userId,
            action: "UNIT_DELETED",
            entityType: "Unit",
            entityId: unit.id,
            before: {
              unitNumber: unit.unitNumber,
              status: unit.status,
              geometry: unit.geometry,
            },
            ipAddress: request.ip,
          },
        });
        await tx.unit.delete({ where: { id: unit.id } });
        return { removed: true as const };
      });
      if (!removed)
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "Unit not found." });
      if ("conflict" in removed)
        return reply
          .code(409)
          .send({
            code: "UNIT_HAS_BOOKINGS",
            message:
              "Units with booking history cannot be deleted. Change their availability instead.",
          });
      void publishOrganizationEvent(context.organizationId, {
        type: "UNIT_DELETED",
        id: unitId,
      }).catch((error) =>
        request.log.warn({ err: error }, "Unable to publish unit removal"),
      );
      return reply.code(204).send();
    },
  );

  app.patch(
    "/units/:unitId/status",
    { preHandler: [app.authenticate, app.requirePermission("UPDATE_STATUS")] },
    async (request, reply) => {
      const parsed = unitStatusTransitionSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid unit status.",
          });
      const context = request.auth!;
      const { unitId } = request.params as { unitId: string };
      const changed = await withTenant(context, async (tx) => {
        const current = await tx.unit.findFirst({
          where: { id: unitId, organizationId: context.organizationId },
        });
        if (!current) return { notFound: true as const };
        if (current.purpose === "AMENITY")
          return { notForSale: true as const };
        assertUnitStatusTransition(current.status, parsed.data.status);
        const result = await tx.unit.updateMany({
          where: {
            id: unitId,
            organizationId: context.organizationId,
            status: current.status,
            version: current.version,
          },
          data: { status: parsed.data.status, version: { increment: 1 } },
        });
        if (!result.count) return { conflict: true as const };
        const updated = await tx.unit.findUniqueOrThrow({
          where: { id: unitId },
        });
        await tx.auditLog.create({
          data: {
            organizationId: context.organizationId,
            actorId: context.userId,
            action: "UNIT_STATUS_CHANGED",
            entityType: "Unit",
            entityId: unitId,
            before: { status: current.status, version: current.version },
            after: { status: updated.status, version: updated.version },
            metadata: { reason: parsed.data.reason },
            ipAddress: request.ip,
          },
        });
        return { unit: updated };
      });
      if ("notFound" in changed)
        return reply
          .code(404)
          .send({ code: "NOT_FOUND", message: "Unit not found." });
      if ("conflict" in changed)
        return reply
          .code(409)
          .send({
            code: "WRITE_CONFLICT",
            message:
              "This unit was updated by someone else. Refresh and try again.",
          });
      if ("notForSale" in changed)
        return reply
          .code(409)
          .send({
            code: "AMENITY_NOT_FOR_SALE",
            message: "Amenity records do not have sale availability statuses.",
          });
      void publishOrganizationEvent(context.organizationId, {
        type: "UNIT_STATUS_CHANGED",
        id: unitId,
        data: { status: changed.unit.status },
      }).catch((error) =>
        request.log.warn(
          { err: error },
          "Unable to publish unit status update",
        ),
      );
      return serializeUnit(changed.unit);
    },
  );

  app.patch(
    "/units/bulk/status",
    { preHandler: [app.authenticate, app.requirePermission("UPDATE_STATUS")] },
    async (request, reply) => {
      const schema = unitStatusTransitionSchema.extend({
        unitIds: z.array(z.string().uuid()).min(1).max(500),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({
            code: "VALIDATION_ERROR",
            message: "Select one to 500 valid units and a target status.",
          });
      const context = request.auth!;
      const updated = await withTenant(context, async (tx) => {
        const units = await tx.unit.findMany({
          where: {
            id: { in: parsed.data.unitIds },
            organizationId: context.organizationId,
          },
        });
        if (units.length !== parsed.data.unitIds.length)
          return { notFound: true as const };
        if (units.some((unit) => unit.purpose === "AMENITY"))
          return { notForSale: true as const };
        for (const unit of units)
          assertUnitStatusTransition(unit.status, parsed.data.status);
        const results = [];
        for (const unit of units) {
          const result = await tx.unit.updateMany({
            where: { id: unit.id, version: unit.version },
            data: { status: parsed.data.status, version: { increment: 1 } },
          });
          if (!result.count)
            throw Object.assign(
              new Error("A unit changed during the bulk update."),
              { name: "OptimisticConcurrencyError" },
            );
          await tx.auditLog.create({
            data: {
              organizationId: context.organizationId,
              actorId: context.userId,
              action: "UNIT_STATUS_CHANGED",
              entityType: "Unit",
              entityId: unit.id,
              before: { status: unit.status },
              after: { status: parsed.data.status },
              metadata: { reason: parsed.data.reason, bulk: true },
              ipAddress: request.ip,
            },
          });
          results.push({ id: unit.id, status: parsed.data.status });
        }
        return { units: results };
      });
      if ("notFound" in updated)
        return reply
          .code(404)
          .send({
            code: "NOT_FOUND",
            message: "One or more units were not found in this organization.",
          });
      if ("notForSale" in updated)
        return reply
          .code(409)
          .send({
            code: "AMENITY_NOT_FOR_SALE",
            message: "Amenity records do not have sale availability statuses.",
          });
      void publishOrganizationEvent(context.organizationId, {
        type: "UNITS_BULK_STATUS_CHANGED",
        data: updated.units,
      }).catch((error) =>
        request.log.warn(
          { err: error },
          "Unable to publish bulk unit status update",
        ),
      );
      return updated;
    },
  );

  app.patch(
    "/units/bulk/category",
    { preHandler: [app.authenticate, app.requirePermission("EDIT_UNIT")] },
    async (request, reply) => {
      const parsed = z
        .object({
          projectId: z.string().uuid(),
          unitIds: z
            .array(z.string().uuid())
            .min(1)
            .max(500)
            .refine((unitIds) => new Set(unitIds).size === unitIds.length),
          category: z.enum(["GOLD", "PLATINUM", "SILVER", "REGULAR"]).nullable(),
        })
        .safeParse(request.body);
      if (!parsed.success)
        return reply.code(400).send({
          code: "VALIDATION_ERROR",
          message:
            "Choose a category and select 1–500 unique sale units.",
        });

      const context = request.auth!;
      const updated = await withTenant(context, async (tx) => {
        const units = await tx.unit.findMany({
          where: {
            id: { in: parsed.data.unitIds },
            organizationId: context.organizationId,
            projectId: parsed.data.projectId,
          },
        });
        if (units.length !== parsed.data.unitIds.length)
          return { notFound: true as const };
        if (units.some((unit) => unit.purpose !== "SALE"))
          return { notSaleInventory: true as const };

        const results: Array<{ id: string; category: string | null }> = [];
        for (const unit of units) {
          const currentDetails =
            typeof unit.metadata === "object" &&
            unit.metadata !== null &&
            !Array.isArray(unit.metadata)
              ? { ...(unit.metadata as Record<string, unknown>) }
              : {};
          const currentPublicDetails =
            typeof unit.publicMetadata === "object" &&
            unit.publicMetadata !== null &&
            !Array.isArray(unit.publicMetadata)
              ? { ...(unit.publicMetadata as Record<string, unknown>) }
              : {};
          const nextDetails = { ...currentDetails };
          const nextPublicDetails = { ...currentPublicDetails };
          if (parsed.data.category) {
            nextDetails.category = parsed.data.category;
            nextPublicDetails.category = parsed.data.category;
          } else {
            delete nextDetails.category;
            delete nextPublicDetails.category;
          }

          const result = await tx.unit.updateMany({
            where: {
              id: unit.id,
              organizationId: context.organizationId,
              projectId: parsed.data.projectId,
              version: unit.version,
            },
            data: {
              metadata: nextDetails as Prisma.InputJsonValue,
              publicMetadata: nextPublicDetails as Prisma.InputJsonValue,
              version: { increment: 1 },
            },
          });
          if (!result.count)
            throw Object.assign(
              new Error("A unit changed during the bulk category update."),
              { name: "OptimisticConcurrencyError" },
            );
          await tx.auditLog.create({
            data: {
              organizationId: context.organizationId,
              actorId: context.userId,
              action: "UNIT_CATEGORY_CHANGED",
              entityType: "Unit",
              entityId: unit.id,
              before: { category: currentDetails.category ?? null },
              after: { category: parsed.data.category },
              metadata: { bulk: true, projectId: parsed.data.projectId },
              ipAddress: request.ip,
            },
          });
          results.push({ id: unit.id, category: parsed.data.category });
        }
        return { units: results };
      });

      if ("notFound" in updated)
        return reply.code(404).send({
          code: "NOT_FOUND",
          message: "One or more selected units were not found in this project.",
        });
      if ("notSaleInventory" in updated)
        return reply.code(409).send({
          code: "AMENITY_NOT_SALE_INVENTORY",
          message: "Categories can only be assigned to sale inventory units.",
        });

      void publishOrganizationEvent(context.organizationId, {
        type: "UNITS_BULK_CATEGORY_UPDATED",
        data: updated.units,
      }).catch((error) =>
        request.log.warn({ err: error }, "Unable to publish category update"),
      );
      return updated;
    },
  );

  app.get(
    "/projects/:projectId/units/import/template",
    { preHandler: [app.authenticate, app.requirePermission("EXPORT_DATA")] },
    async (_request, reply) =>
      reply
        .type("text/csv; charset=utf-8")
        .header(
          "content-disposition",
          'attachment; filename="vstudio-inventory-template.csv"',
        )
        .send(
          "unit_number,unit_type,area,price,status\nP-101,PLOT,1500,3500000,AVAILABLE\n",
        ),
  );

  app.post(
    "/projects/:projectId/units/import/preview",
    { preHandler: [app.authenticate, app.requirePermission("EDIT_UNIT")] },
    async (request, reply) => {
      const body = request.body as { csv?: unknown };
      if (typeof body?.csv !== "string")
        return reply
          .code(400)
          .send({ code: "VALIDATION_ERROR", message: "CSV text is required." });
      const context = request.auth!;
      const { projectId } = request.params as { projectId: string };
      const csv = body.csv;
      const result = await withTenant(context, (tx) =>
        inspectImport(tx, context.organizationId, projectId, csv),
      );
      return {
        totalRows: result.totalRows,
        validRows: result.accepted.map((row) => ({
          line: row.line,
          ...row.data,
        })),
        invalidRows: result.errors,
        canImport: result.totalRows > 0 && result.errors.length === 0,
      };
    },
  );

  app.post(
    "/projects/:projectId/units/import/commit",
    { preHandler: [app.authenticate, app.requirePermission("EDIT_UNIT")] },
    async (request, reply) => {
      const body = request.body as { csv?: unknown };
      if (typeof body?.csv !== "string")
        return reply
          .code(400)
          .send({ code: "VALIDATION_ERROR", message: "CSV text is required." });
      const context = request.auth!;
      const { projectId } = request.params as { projectId: string };
      const csv = body.csv;
      const result = await withTenant(context, async (tx) => {
        const checked = await inspectImport(
          tx,
          context.organizationId,
          projectId,
          csv,
        );
        if (checked.totalRows === 0 || checked.errors.length)
          return { invalid: checked };
        const updated = [];
        for (const row of checked.accepted) {
          const unit = await tx.unit.update({
            where: { id: row.unitId },
            data: {
              unitType: row.data.unit_type,
              area: row.data.area,
              price: row.data.price,
              status: row.data.status,
              version: { increment: 1 },
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId: context.organizationId,
              actorId: context.userId,
              action: "UNIT_IMPORTED",
              entityType: "Unit",
              entityId: unit.id,
              before: { status: row.currentStatus },
              after: {
                status: unit.status,
                area: row.data.area,
                price: row.data.price,
              },
              metadata: { source: "csv", line: row.line },
              ipAddress: request.ip,
            },
          });
          updated.push(unit.unitNumber);
        }
        return { updated };
      });
      if ("invalid" in result)
        return reply
          .code(422)
          .send({
            code: "IMPORT_VALIDATION_FAILED",
            message: "No rows were imported. Fix the errors and retry.",
            ...result.invalid,
          });
      return reply
        .code(200)
        .send({ imported: result.updated.length, unitNumbers: result.updated });
    },
  );

  app.get(
    "/projects/:projectId/units/export",
    { preHandler: [app.authenticate, app.requirePermission("EXPORT_DATA")] },
    async (request, reply) => {
      const context = request.auth!;
      const { projectId } = request.params as { projectId: string };
      const units = await withTenant(context, (tx) =>
        tx.unit.findMany({
          where: {
            organizationId: context.organizationId,
            projectId,
            purpose: "SALE",
          },
          orderBy: { unitNumber: "asc" },
        }),
      );
      const escape = (value: string | number) =>
        `"${String(value).replaceAll('"', '""')}"`;
      const rows = [
        "unit_number,unit_type,area,price,status",
        ...units.map((unit) =>
          [
            unit.unitNumber,
            unit.unitType,
            unit.area.toString(),
            unit.price.toString(),
            unit.status,
          ]
            .map(escape)
            .join(","),
        ),
      ];
      return reply
        .type("text/csv; charset=utf-8")
        .header(
          "content-disposition",
          'attachment; filename="vstudio-inventory.csv"',
        )
        .send(rows.join("\n"));
    },
  );
}
