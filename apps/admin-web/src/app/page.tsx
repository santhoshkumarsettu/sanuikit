"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ApiError, vstudioApi } from "@vstudio/api-client";
import { Badge, Button, Skeleton, Spinner } from "sanui";
import { demoProject, demoUnits, formatCurrency } from "@vstudio/utils";
import { AppShell } from "../components/app-shell";
import { usePermissions } from "../hooks/use-permissions";

const available = demoUnits.filter(
  (unit) => unit.status === "AVAILABLE",
).length;
const reserved = demoUnits.filter((unit) => unit.status === "RESERVED").length;
const sold = demoUnits.filter((unit) => unit.status === "SOLD").length;

export default function DashboardPage() {
  const { can, accountQuery } = usePermissions();
  const canViewProjects = can("VIEW_PROJECTS");
  const canViewInventory = can("VIEW_INVENTORY");
  const canViewReports = can("VIEW_REPORTS");
  const canViewActivity = can("VIEW_AUDIT_LOGS");
  const canViewMap = can("VIEW_MAP");
  const activityQuery = useQuery({
    queryKey: ["activity", 8],
    queryFn: () => vstudioApi.activity(8),
    retry: false,
    staleTime: 15_000,
    enabled: canViewActivity,
  });
  const occupancy = Math.round(
    ((demoUnits.length - available) / demoUnits.length) * 100,
  );
  return (
    <AppShell>
      <div className="dashboard-page">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">
              Sunday, October 11, 2026 · Workspace overview
            </p>
            <h1 className="page-title">
              {accountQuery.isPending ? (
                <Skeleton
                  className="dashboard-greeting-skeleton"
                  width="270px"
                  height="32px"
                />
              ) : accountQuery.data ? (
                `Good morning, ${accountQuery.data.user.name.trim().split(/\s+/)[0]}.`
              ) : (
                "Workspace overview"
              )}
            </h1>
            <p className="page-subtitle">
              Here’s what’s happening across your property portfolio.
            </p>
          </div>
          <div className="title-actions">
            {canViewReports && (
              <Link
                className="sanui-button sanui-button--secondary sanui-button--md"
                href="/reports"
              >
                Export report
              </Link>
            )}
            {can("CREATE_PROJECT") && (
              <Link
                className="sanui-button sanui-button--primary sanui-button--md"
                href="/projects/new"
              >
                ＋ New project
              </Link>
            )}
          </div>
        </div>
        <section className="overview-grid" aria-label="Portfolio metrics">
          <article className="stat-card">
            <div className="stat-top">
              <span>Active projects</span>
              <span className="stat-glyph">⌂</span>
            </div>
            <div className="stat-value">08</div>
            <div className="stat-foot">
              <span className="trend-up">+2</span> from last month
            </div>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span>Total units</span>
              <span className="stat-glyph">▤</span>
            </div>
            <div className="stat-value">1,284</div>
            <div className="stat-foot">
              <span className="trend-up">+86</span> added this quarter
            </div>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span>Available inventory</span>
              <span className="stat-glyph">◉</span>
            </div>
            <div className="stat-value">{available + 326}</div>
            <div className="stat-foot">
              {occupancy}% allocated across projects
            </div>
          </article>
          <article className="stat-card">
            <div className="stat-top">
              <span>Bookings this month</span>
              <span className="stat-glyph">▣</span>
            </div>
            <div className="stat-value">42</div>
            <div className="stat-foot">
              <span className="trend-up">+12.8%</span> vs. previous month
            </div>
          </article>
        </section>
        <div className="dashboard-main-grid">
          {canViewProjects && (
            <section className="surface-card">
              <header className="surface-header">
                <div>
                  <h2>Projects</h2>
                  <p>Your most recently updated developments</p>
                </div>
                <Link className="text-link" href="/projects">
                  View all projects →
                </Link>
              </header>
              <div className="surface-body">
                <Link className="project-row" href="/projects/green-valley">
                  <div className="project-name">
                    <span className="project-thumb" />
                    <span>
                      <strong>{demoProject.name}</strong>
                      <small>
                        {demoProject.location} · {demoUnits.length} mapped units
                      </small>
                    </span>
                  </div>
                  <span className="status-pill">Active</span>
                  <span>{available} available</span>
                  <span>2h ago</span>
                </Link>
                <Link
                  className="project-row"
                  href="/projects/sunrise-residences"
                >
                  <div className="project-name">
                    <span
                      className="project-thumb"
                      style={{
                        background:
                          "linear-gradient(135deg,var(--sanui-color-primary-soft),var(--sanui-color-canvas))",
                      }}
                    />
                    <span>
                      <strong>Sunrise Residences</strong>
                      <small>Indiranagar, Bengaluru · 384 units</small>
                    </span>
                  </div>
                  <span className="status-pill">Active</span>
                  <span>212 available</span>
                  <span>Yesterday</span>
                </Link>
                <Link className="project-row" href="/projects/orbit-tech-park">
                  <div className="project-name">
                    <span
                      className="project-thumb"
                      style={{
                        background:
                          "linear-gradient(135deg,var(--sanui-color-surface-subtle),var(--sanui-color-primary-soft))",
                      }}
                    />
                    <span>
                      <strong>Orbit Tech Park</strong>
                      <small>Outer Ring Road, Bengaluru · 120 units</small>
                    </span>
                  </div>
                  <span className="status-pill">Active</span>
                  <span>48 available</span>
                  <span>2 days ago</span>
                </Link>
                <Link className="project-row" href="/projects/terrace-villas">
                  <div className="project-name">
                    <span
                      className="project-thumb"
                      style={{
                        background:
                          "linear-gradient(135deg,var(--sanui-color-canvas),var(--sanui-color-primary-soft))",
                      }}
                    />
                    <span>
                      <strong>Terrace Villas</strong>
                      <small>Devanahalli, Bengaluru · 36 units</small>
                    </span>
                  </div>
                  <span className="status-pill">Draft</span>
                  <span>36 available</span>
                  <span>Oct 7</span>
                </Link>
              </div>
            </section>
          )}
          {canViewActivity && (
            <section className="surface-card">
              <header className="surface-header">
                <div>
                  <h2>Recent activity</h2>
                  <p>Latest updates from your team</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Refresh recent activity"
                  onClick={() => void activityQuery.refetch()}
                  disabled={activityQuery.isFetching}
                >
                  ↻
                </Button>
              </header>
              <div className="surface-body">
                {activityQuery.isPending ? (
                  <div
                    className="activity-loading"
                    role="status"
                    aria-label="Loading recent activity"
                  >
                    <div className="activity-loading-label">
                      <Spinner label="Loading recent activity" size="sm" />
                      <span>Loading recent activity…</span>
                    </div>
                    {[0, 1, 2].map((row) => (
                      <div className="activity-loading-row" key={row}>
                        <Skeleton variant="circular" width={8} height={8} />
                        <span>
                          <Skeleton
                            width={row === 1 ? "76%" : "92%"}
                            height={10}
                          />
                          <Skeleton width="38%" height={8} />
                        </span>
                      </div>
                    ))}
                  </div>
                ) : activityQuery.error ? (
                  <p className="activity-state" role="status">
                    {activityQuery.error instanceof ApiError &&
                      activityQuery.error.status === 403
                      ? "Your role doesn’t include permission to view recent activity. Ask an owner to review your access."
                      : "Activity could not be loaded. Try refreshing."}
                  </p>
                ) : activityQuery.data?.length ? (
                  activityQuery.data.map((activity) => (
                    <div className="activity-item" key={activity.id}>
                      <span
                        className="activity-dot"
                        style={{
                          background: activity.action.startsWith("BOOKING")
                            ? "var(--sanui-color-success)"
                            : activity.action.startsWith("PROJECT")
                              ? "var(--sanui-color-info)"
                              : "var(--sanui-color-primary)",
                        }}
                      />
                      <div className="activity-copy">
                        <strong>{activity.actorName}</strong> {activity.summary}
                        <time dateTime={activity.occurredAt}>
                          {new Intl.DateTimeFormat(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(activity.occurredAt))}
                        </time>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="activity-state">
                    No activity yet. Updates from your team will appear here.
                  </p>
                )}
              </div>
            </section>
          )}
        </div>
        <div className="dashboard-main-grid">
          {canViewInventory && (
            <section className="surface-card">
              <header className="surface-header">
                <div>
                  <h2>Green Valley · Inventory snapshot</h2>
                  <p>Live unit status for your featured project</p>
                </div>
                <Link className="text-link" href="/inventory">
                  Manage inventory →
                </Link>
              </header>
              <div className="surface-body">
                <div className="preview-row">
                  <Badge tone="success">Available · {available}</Badge>
                  <Badge tone="warning">Reserved · {reserved}</Badge>
                  <Badge tone="info">
                    Booked ·{" "}
                    {
                      demoUnits.filter((unit) => unit.status === "BOOKED")
                        .length
                    }
                  </Badge>
                  <Badge>Sold · {sold}</Badge>
                </div>
                <div className="dashboard-progress">
                  <span style={{ width: `${occupancy}%` }} />
                </div>
                <div className="snapshot-caption">
                  <span>{occupancy}% of plots allocated</span>
                  {canViewMap && (
                    <Link className="text-link" href="/studio">
                      Open Map Studio →
                    </Link>
                  )}
                </div>
              </div>
            </section>
          )}
          {canViewReports && (
            <section className="surface-card">
              <header className="surface-header">
                <div>
                  <h2>Sales summary</h2>
                  <p>October 2026 · All projects</p>
                </div>
              </header>
              <div className="surface-body">
                <div className="sales-total">
                  {formatCurrency(124_800_000)}
                  <small>value reserved this month</small>
                </div>
                <div
                  className="sales-bars"
                  aria-label="Weekly booking activity"
                >
                  <i style={{ height: "35%" }} />
                  <i style={{ height: "54%" }} />
                  <i style={{ height: "43%" }} />
                  <i style={{ height: "73%" }} />
                  <i style={{ height: "61%" }} />
                  <i style={{ height: "89%" }} />
                  <i style={{ height: "72%" }} />
                  <i style={{ height: "96%" }} />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
