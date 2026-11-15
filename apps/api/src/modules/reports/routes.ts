import type { FastifyInstance } from "fastify";
import type { BookingStatus, UnitStatus } from "@vstudio/types";
import { withTenant } from "@vstudio/database/tenant";

const pipelineStatuses = new Set<UnitStatus>([
  "AVAILABLE",
  "RESERVED",
  "BOOKED",
]);

type CurrencyTotal = { currency: string; amount: number };

function emptyUnitStatusCounts(): Record<UnitStatus, number> {
  return {
    AVAILABLE: 0,
    RESERVED: 0,
    BOOKED: 0,
    SOLD: 0,
    BLOCKED: 0,
    OFF_MARKET: 0,
  };
}

function emptyBookingStatusCounts(): Record<BookingStatus, number> {
  return {
    PENDING: 0,
    CONFIRMED: 0,
    CANCELLED: 0,
    EXPIRED: 0,
    COMPLETED: 0,
  };
}

function currencyTotals(values: Map<string, number>): CurrencyTotal[] {
  return [...values.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

export async function registerReportRoutes(app: FastifyInstance) {
  app.get(
    "/reports/portfolio",
    {
      preHandler: [app.authenticate, app.requirePermission("VIEW_REPORTS")],
    },
    async (request) => {
      const context = request.auth!;

      return withTenant(context, async (tx) => {
        const [activeProjectCount, recentProjects, portfolioUnits, portfolioBookings] =
          await Promise.all([
            tx.project.count({
              where: {
                organizationId: context.organizationId,
                status: "ACTIVE",
              },
            }),
            tx.project.findMany({
              where: {
                organizationId: context.organizationId,
                status: "ACTIVE",
              },
              orderBy: { updatedAt: "desc" },
              take: 8,
              select: {
                id: true,
                name: true,
                slug: true,
                location: true,
                updatedAt: true,
              },
            }),
            tx.unit.groupBy({
              by: ["purpose", "status", "currency"],
              where: {
                organizationId: context.organizationId,
                project: { is: { status: "ACTIVE" } },
              },
              _count: { _all: true },
              _sum: { price: true },
            }),
            tx.booking.groupBy({
              by: ["status"],
              where: {
                organizationId: context.organizationId,
                project: { is: { status: "ACTIVE" } },
              },
              _count: { _all: true },
            }),
          ]);

        const projectIds = recentProjects.map((project) => project.id);
        const [projectUnits, projectBookings] = projectIds.length
          ? await Promise.all([
              tx.unit.groupBy({
                by: ["projectId", "purpose", "status", "currency"],
                where: {
                  organizationId: context.organizationId,
                  projectId: { in: projectIds },
                },
                _count: { _all: true },
                _sum: { price: true },
              }),
              tx.booking.groupBy({
                by: ["projectId", "status"],
                where: {
                  organizationId: context.organizationId,
                  projectId: { in: projectIds },
                },
                _count: { _all: true },
              }),
            ])
          : [[], []];

        const statusCounts = emptyUnitStatusCounts();
        const bookingCounts = emptyBookingStatusCounts();
        const pipelineValues = new Map<string, number>();
        const availableValues = new Map<string, number>();
        let saleUnitCount = 0;
        let amenityCount = 0;

        for (const group of portfolioUnits) {
          const count = group._count._all;
          if (group.purpose === "AMENITY") {
            amenityCount += count;
            continue;
          }

          saleUnitCount += count;
          statusCounts[group.status] += count;
          const amount = Number(group._sum.price ?? 0);
          if (pipelineStatuses.has(group.status) && amount > 0) {
            pipelineValues.set(
              group.currency,
              (pipelineValues.get(group.currency) ?? 0) + amount,
            );
          }
          if (group.status === "AVAILABLE" && amount > 0) {
            availableValues.set(
              group.currency,
              (availableValues.get(group.currency) ?? 0) + amount,
            );
          }
        }

        for (const group of portfolioBookings) {
          bookingCounts[group.status] = group._count._all;
        }

        const unitsByProject = new Map<
          string,
          {
            saleUnitCount: number;
            amenityCount: number;
            statusCounts: Record<UnitStatus, number>;
            pipelineValues: Map<string, number>;
          }
        >();
        for (const project of recentProjects) {
          unitsByProject.set(project.id, {
            saleUnitCount: 0,
            amenityCount: 0,
            statusCounts: emptyUnitStatusCounts(),
            pipelineValues: new Map(),
          });
        }
        for (const group of projectUnits) {
          const project = unitsByProject.get(group.projectId);
          if (!project) continue;
          const count = group._count._all;
          if (group.purpose === "AMENITY") {
            project.amenityCount += count;
            continue;
          }
          project.saleUnitCount += count;
          project.statusCounts[group.status] += count;
          const amount = Number(group._sum.price ?? 0);
          if (pipelineStatuses.has(group.status) && amount > 0) {
            project.pipelineValues.set(
              group.currency,
              (project.pipelineValues.get(group.currency) ?? 0) +
                amount,
            );
          }
        }

        const bookingsByProject = new Map<
          string,
          Record<BookingStatus, number>
        >();
        for (const project of recentProjects) {
          bookingsByProject.set(project.id, emptyBookingStatusCounts());
        }
        for (const group of projectBookings) {
          const counts = bookingsByProject.get(group.projectId);
          if (counts) counts[group.status] = group._count._all;
        }

        return {
          generatedAt: new Date().toISOString(),
          summary: {
            activeProjectCount,
            saleUnitCount,
            amenityCount,
            statusCounts,
            bookingCounts,
            openBookingCount:
              bookingCounts.PENDING + bookingCounts.CONFIRMED,
            sellThroughRate: saleUnitCount
              ? (statusCounts.SOLD / saleUnitCount) * 100
              : 0,
            pipelineValueByCurrency: currencyTotals(pipelineValues),
            availableValueByCurrency: currencyTotals(availableValues),
          },
          projects: recentProjects.map((project) => {
            const inventory = unitsByProject.get(project.id)!;
            const bookings = bookingsByProject.get(project.id)!;
            return {
              id: project.id,
              name: project.name,
              slug: project.slug,
              location: project.location,
              updatedAt: project.updatedAt,
              saleUnitCount: inventory.saleUnitCount,
              amenityCount: inventory.amenityCount,
              statusCounts: inventory.statusCounts,
              openBookingCount: bookings.PENDING + bookings.CONFIRMED,
              sellThroughRate: inventory.saleUnitCount
                ? (inventory.statusCounts.SOLD / inventory.saleUnitCount) *
                  100
                : 0,
              pipelineValueByCurrency: currencyTotals(
                inventory.pipelineValues,
              ),
            };
          }),
          projectListLimited: activeProjectCount > recentProjects.length,
        };
      });
    },
  );
}
