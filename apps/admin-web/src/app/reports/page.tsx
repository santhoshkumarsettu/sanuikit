"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { UNIT_STATUS_PRESENTATION, type UnitStatus } from "@vstudio/types";
import { Button } from "sanui";
import { vstudioApi, type ApiPortfolioReport } from "@vstudio/api-client";
import { AppShell } from "../../components/app-shell";
import { usePermissions } from "../../hooks/use-permissions";

const reportStatusOrder: UnitStatus[] = [
  "AVAILABLE",
  "RESERVED",
  "BOOKED",
  "SOLD",
  "BLOCKED",
  "OFF_MARKET",
];

const bookingStatusRows = [
  { key: "PENDING", label: "Pending", tone: "warning" },
  { key: "CONFIRMED", label: "Confirmed", tone: "info" },
  { key: "COMPLETED", label: "Completed", tone: "success" },
  { key: "CANCELLED", label: "Cancelled", tone: "neutral" },
  { key: "EXPIRED", label: "Expired", tone: "danger" },
] as const;

function compactCurrencyTotals(
  totals: Array<{ currency: string; amount: number }>,
) {
  if (!totals.length) return "—";
  return totals
    .map(({ currency, amount }) =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(amount),
    )
    .join(" · ");
}

function csvCell(value: string | number) {
  let safeValue = String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(safeValue)) {
    safeValue = `'${safeValue}`;
  }
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function exportPortfolioReport(report: ApiPortfolioReport) {
  const rows: Array<Array<string | number>> = [
    [
      "Project",
      "Location",
      "Sale units",
      "Available",
      "Reserved",
      "Booked",
      "Sold",
      "Blocked",
      "Off market",
      "Open bookings",
      "Sell-through rate",
      "Active pipeline value",
    ],
    ...report.projects.map((project) => [
      project.name,
      project.location ?? "",
      project.saleUnitCount,
      project.statusCounts.AVAILABLE,
      project.statusCounts.RESERVED,
      project.statusCounts.BOOKED,
      project.statusCounts.SOLD,
      project.statusCounts.BLOCKED,
      project.statusCounts.OFF_MARKET,
      project.openBookingCount,
      `${project.sellThroughRate.toFixed(1)}%`,
      compactCurrencyTotals(project.pipelineValueByCurrency),
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vstudio-portfolio-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ProjectReportRow({
  project,
}: {
  project: ApiPortfolioReport["projects"][number];
}) {
  const inventoryTotal = project.saleUnitCount;
  const availabilityRate = inventoryTotal
    ? (project.statusCounts.AVAILABLE / inventoryTotal) * 100
    : 0;
  const soldRate = inventoryTotal ? project.sellThroughRate : 0;
  const inPipeline =
    project.statusCounts.RESERVED + project.statusCounts.BOOKED;

  return (
    <tr>
      <td>
        <Link className="report-project-name" href={`/projects/${project.slug}`}>
          <strong>{project.name}</strong>
          <span>{project.location || "Location not set"}</span>
        </Link>
      </td>
      <td>{inventoryTotal.toLocaleString("en-IN")}</td>
      <td>
        <div className="report-project-meter-cell">
          <span>{project.statusCounts.AVAILABLE.toLocaleString("en-IN")}</span>
          <div
            className="report-project-meter"
            role="img"
            aria-label={`${Math.round(availabilityRate)}% available`}
          >
            <i style={{ width: `${availabilityRate}%` }} />
          </div>
        </div>
      </td>
      <td>{inPipeline.toLocaleString("en-IN")}</td>
      <td>{project.statusCounts.SOLD.toLocaleString("en-IN")}</td>
      <td>
        <div className="report-sell-through-cell">
          <span className="report-sell-through-track">
            <i style={{ width: `${soldRate}%` }} />
          </span>
          <span>{Math.round(soldRate)}%</span>
        </div>
      </td>
      <td className="report-project-value">
        {compactCurrencyTotals(project.pipelineValueByCurrency)}
      </td>
    </tr>
  );
}

export default function ReportsPage() {
  const { can } = usePermissions();
  const canExport = can("EXPORT_DATA");
  const reportQuery = useQuery({
    queryKey: ["reports", "portfolio"],
    queryFn: () => vstudioApi.portfolioReport(),
    enabled: can("VIEW_REPORTS"),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const report = reportQuery.data;
  const statusTotal = report?.summary.saleUnitCount ?? 0;
  const availableCount = report?.summary.statusCounts.AVAILABLE ?? 0;
  const availabilityRate = statusTotal
    ? (availableCount / statusTotal) * 100
    : 0;
  const bookingCounts = report?.summary.bookingCounts;
  const currencyRows = report
    ? report.summary.pipelineValueByCurrency.map((pipeline) => ({
        currency: pipeline.currency,
        pipelineValue: pipeline.amount,
        availableValue:
          report.summary.availableValueByCurrency.find(
            (item) => item.currency === pipeline.currency,
          )?.amount ?? 0,
      }))
    : [];

  return (
    <AppShell>
      <div className="reports-page">
        <div className="page-title-row reports-heading">
          <div>
            <p className="page-eyebrow">Workspace analytics</p>
            <h1 className="page-title">Reports</h1>
            <p className="page-subtitle">
              Live inventory, booking, and project performance across your
              active portfolio.
            </p>
            {report && (
              <p className="reports-live-meta">
                <span className="reports-live-dot" aria-hidden="true" />
                Live data · Updated{" "}
                {new Intl.DateTimeFormat("en-IN", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(report.generatedAt))}
              </p>
            )}
          </div>
          <div className="reports-heading-actions">
            <Button
              variant="secondary"
              disabled={reportQuery.isFetching}
              onClick={() => void reportQuery.refetch()}
            >
              <span aria-hidden="true">↻</span>
              {reportQuery.isFetching ? "Refreshing…" : "Refresh"}
            </Button>
            {canExport && report && (
              <Button onClick={() => exportPortfolioReport(report)}>
                <span aria-hidden="true">↓</span> Export CSV
              </Button>
            )}
          </div>
        </div>

        {reportQuery.isPending && (
          <div className="report-loading-grid" role="status" aria-label="Loading reports">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="report-loading-card" key={index} />
            ))}
          </div>
        )}
        {reportQuery.isError && (
          <section className="reports-state" role="alert">
            <span className="reports-state__icon" aria-hidden="true">!</span>
            <div>
              <strong>Reports couldn’t be loaded</strong>
              <p>
                {reportQuery.error instanceof Error
                  ? reportQuery.error.message
                  : "Check the API connection and try again."}
              </p>
            </div>
            <Button variant="secondary" onClick={() => void reportQuery.refetch()}>
              Try again
            </Button>
          </section>
        )}

        {report && (
          <>
            <section className="report-metric-grid" aria-label="Portfolio metrics">
              <article className="report-metric-card">
                <div className="report-metric-head">
                  <span>Active projects</span>
                  <span className="report-metric-icon report-metric-icon--primary" aria-hidden="true">⌂</span>
                </div>
                <strong>{report.summary.activeProjectCount.toLocaleString("en-IN")}</strong>
                <small>Currently live in this workspace</small>
              </article>
              <article className="report-metric-card">
                <div className="report-metric-head">
                  <span>Available units</span>
                  <span className="report-metric-icon report-metric-icon--success" aria-hidden="true">✓</span>
                </div>
                <strong>{availableCount.toLocaleString("en-IN")}</strong>
                <small>
                  {Math.round(availabilityRate)}% of {statusTotal.toLocaleString("en-IN")} sale units
                </small>
              </article>
              <article className="report-metric-card">
                <div className="report-metric-head">
                  <span>Open bookings</span>
                  <span className="report-metric-icon report-metric-icon--warning" aria-hidden="true">◷</span>
                </div>
                <strong>{report.summary.openBookingCount.toLocaleString("en-IN")}</strong>
                <small>
                  {bookingCounts?.PENDING.toLocaleString("en-IN")} pending ·{" "}
                  {bookingCounts?.CONFIRMED.toLocaleString("en-IN")} confirmed
                </small>
              </article>
              <article className="report-metric-card">
                <div className="report-metric-head">
                  <span>Active pipeline value</span>
                  <span className="report-metric-icon report-metric-icon--info" aria-hidden="true">₹</span>
                </div>
                <strong className="report-metric-value">
                  {compactCurrencyTotals(report.summary.pipelineValueByCurrency)}
                </strong>
                <small>Available, reserved, and booked sale units</small>
              </article>
            </section>

            <div className="reports-insights-grid">
              <section className="surface-card report-panel">
                <header className="surface-header">
                  <div>
                    <p className="report-panel-eyebrow">Current snapshot</p>
                    <h2>Inventory status</h2>
                    <p>Sale units across active projects · amenities excluded</p>
                  </div>
                  <span className="report-panel-total">
                    {statusTotal.toLocaleString("en-IN")}<small> sale units</small>
                  </span>
                </header>
                <div className="report-panel-content">
                  {statusTotal ? (
                    <>
                      <div
                        className="report-status-stack"
                        role="img"
                        aria-label={reportStatusOrder
                          .map((status) => `${UNIT_STATUS_PRESENTATION[status].label}: ${report.summary.statusCounts[status]}`)
                          .join(", ")}
                      >
                        {reportStatusOrder.map((status) => {
                          const count = report.summary.statusCounts[status];
                          if (!count) return null;
                          return (
                            <span
                              key={status}
                              title={`${UNIT_STATUS_PRESENTATION[status].label}: ${count}`}
                              style={{
                                width: `${(count / statusTotal) * 100}%`,
                                backgroundColor: UNIT_STATUS_PRESENTATION[status].fill,
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="report-status-legend">
                        {reportStatusOrder.map((status) => {
                          const presentation = UNIT_STATUS_PRESENTATION[status];
                          const count = report.summary.statusCounts[status];
                          const percent = (count / statusTotal) * 100;
                          return (
                            <div className="report-status-item" key={status}>
                              <span
                                className="report-status-dot"
                                style={{ backgroundColor: presentation.fill }}
                                aria-hidden="true"
                              />
                              <span>{presentation.label}</span>
                              <strong>{count.toLocaleString("en-IN")}</strong>
                              <small>{Math.round(percent)}%</small>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="report-empty-inline">
                      No sale inventory is mapped to active projects yet.
                    </div>
                  )}
                </div>
              </section>

              <section className="surface-card report-panel report-value-panel">
                <header className="surface-header">
                  <div>
                    <p className="report-panel-eyebrow">Pricing overview</p>
                    <h2>Inventory value</h2>
                    <p>Calculated from saved unit prices by currency</p>
                  </div>
                  <span className="report-value-icon" aria-hidden="true">₹</span>
                </header>
                <div className="report-panel-content">
                  {currencyRows.length ? (
                    <>
                      <div className="report-value-table-head">
                        <span>Currency</span>
                        <span>Pipeline</span>
                        <span>Available</span>
                      </div>
                      <div className="report-value-rows">
                        {currencyRows.map((row) => (
                          <div className="report-value-row" key={row.currency}>
                            <strong>{row.currency}</strong>
                            <span>{compactCurrencyTotals([{ currency: row.currency, amount: row.pipelineValue }])}</span>
                            <span>{compactCurrencyTotals([{ currency: row.currency, amount: row.availableValue }])}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="report-empty-inline">
                      Add prices to sale units to see portfolio value here.
                    </div>
                  )}
                  <div className="report-booking-breakdown">
                    <p>Booking activity</p>
                    {bookingStatusRows.map((row) => (
                      <div className="report-booking-status" key={row.key}>
                        <span
                          className={`report-booking-status-dot report-booking-status-dot--${row.tone}`}
                          aria-hidden="true"
                        />
                        <span>{row.label}</span>
                        <strong>
                          {bookingCounts?.[row.key].toLocaleString("en-IN")}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>

            <section className="surface-card report-project-panel">
              <header className="surface-header">
                <div>
                  <p className="report-panel-eyebrow">Project performance</p>
                  <h2>Active project overview</h2>
                  <p>
                    Availability, sales, and booking activity by project.
                  </p>
                </div>
                <span className="report-project-count">
                  {report.summary.activeProjectCount.toLocaleString("en-IN")} active
                </span>
              </header>
              {report.projects.length ? (
                <>
                  <div className="report-table-scroll">
                    <table className="report-project-table">
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Sale units</th>
                          <th>Available</th>
                          <th>In pipeline</th>
                          <th>Sold</th>
                          <th>Sell-through</th>
                          <th>Pipeline value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.projects.map((project) => (
                          <ProjectReportRow key={project.id} project={project} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {report.projectListLimited && (
                    <footer className="report-project-footnote">
                      Showing the 8 most recently updated active projects.
                    </footer>
                  )}
                </>
              ) : (
                <div className="report-empty-projects">
                  <span aria-hidden="true">⌂</span>
                  <strong>No active projects yet</strong>
                  <p>
                    Publish a project with mapped units to start tracking its
                    live performance.
                  </p>
                </div>
              )}
            </section>
            <p className="reports-data-note">
              This live snapshot includes active projects only and excludes
              shared amenities from sale inventory and value totals.
            </p>
          </>
        )}
      </div>
    </AppShell>
  );
}
