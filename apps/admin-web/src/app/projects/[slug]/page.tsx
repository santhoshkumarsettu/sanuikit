"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { UNIT_PURPOSE_PRESENTATION, UNIT_STATUS_PRESENTATION } from "@vstudio/types";
import { Badge, Button } from "sanui";
import { demoProject, formatCurrency, getUnitTypeLabel } from "@vstudio/utils";
import { AppShell } from "../../../components/app-shell";
import { usePermissions } from "../../../hooks/use-permissions";

export default function ProjectDetailsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEditProject = can("EDIT_PROJECT");
  const canManageProject = can("DELETE_PROJECT");
  const canViewMap = can("VIEW_MAP");
  const canManageLayouts = can("UPLOAD_LAYOUT");
  const canViewInventory = can("VIEW_INVENTORY");
  const projectQuery = useQuery({
    queryKey: ["project", slug],
    queryFn: () => vstudioApi.project(slug),
    retry: false,
  });
  const project =
    projectQuery.data ??
    (slug === demoProject.slug
      ? demoProject
      : {
          ...demoProject,
          slug,
          name: slug
            .replaceAll("-", " ")
            .replace(/\b\w/g, (letter) => letter.toUpperCase()),
        });
  const unitsQuery = useQuery({
    queryKey: ["units", projectQuery.data?.id],
    queryFn: () => vstudioApi.units(projectQuery.data!.id),
    enabled: Boolean(projectQuery.data?.id) && canViewInventory,
    retry: false,
  });
  const units = canViewInventory ? unitsQuery.data ?? [] : [];
  const saleUnits = units.filter((unit) => unit.purpose === "SALE");
  const amenityCount = units.filter((unit) => unit.purpose === "AMENITY").length;
  const [inventoryPagination, setInventoryPagination] = useState({
    projectId: "",
    page: 1,
    pageSize: 12,
  });
  const currentProjectId = projectQuery.data?.id ?? "";
  const activeInventoryPagination =
    inventoryPagination.projectId === currentProjectId
      ? inventoryPagination
      : { projectId: currentProjectId, page: 1, pageSize: 12 };
  const inventoryPageCount = Math.max(
    1,
    Math.ceil(units.length / activeInventoryPagination.pageSize),
  );
  const visibleInventoryPage = Math.min(
    activeInventoryPagination.page,
    inventoryPageCount,
  );
  const inventoryStartIndex =
    (visibleInventoryPage - 1) * activeInventoryPagination.pageSize;
  const visibleUnits = units.slice(
    inventoryStartIndex,
    inventoryStartIndex + activeInventoryPagination.pageSize,
  );
  const firstVisibleUnit = units.length ? inventoryStartIndex + 1 : 0;
  const lastVisibleUnit = Math.min(
    inventoryStartIndex + activeInventoryPagination.pageSize,
    units.length,
  );
  const layoutCount = projectQuery.data?.layouts.length ?? 0;
  const layouts = projectQuery.data?.layouts ?? [];
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [availabilityPending, setAvailabilityPending] = useState(false);
  const [showNonAvailableUnits, setShowNonAvailableUnits] = useState<
    boolean | null
  >(null);
  useEffect(() => {
    if (projectQuery.data)
      setShowNonAvailableUnits(
        projectQuery.data.publicConfig?.showSoldUnits === true,
      );
  }, [
    projectQuery.data?.id,
    projectQuery.data?.publicConfig?.showSoldUnits,
  ]);
  const [editValues, setEditValues] = useState({
    name: "",
    slug: "",
    location: "",
    description: "",
  });
  const editProject = useMutation({
    mutationFn: () => vstudioApi.updateProject(project.id, editValues),
    onSuccess: async (updated) => {
      setEditing(false);
      setMessage("Project details saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project", slug] }),
      ]);
      if (updated.slug !== slug) {
        router.replace(`/projects/${updated.slug}`);
        return;
      }
      await projectQuery.refetch();
    },
    onError: (error) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "Project details could not be saved.",
      ),
  });
  const publicVisibilityMutation = useMutation({
    mutationFn: (showSoldUnits: boolean) => {
      const current = projectQuery.data;
      if (!current) throw new Error("Project details are still loading.");
      const currentConfig = current.publicConfig ?? {};
      return vstudioApi.updatePublicSettings(current.id, {
        enabled: current.publicEnabled ?? false,
        config: {
          showPrice: currentConfig.showPrice ?? true,
          showArea: currentConfig.showArea ?? true,
          showUnitType: currentConfig.showUnitType ?? true,
          allowEnquiries: currentConfig.allowEnquiries ?? true,
          showSoldUnits,
          ...(currentConfig.contactEmail
            ? { contactEmail: currentConfig.contactEmail }
            : {}),
          ...(currentConfig.contactPhone
            ? { contactPhone: currentConfig.contactPhone }
            : {}),
        },
      });
    },
    onSuccess: async (_, showSoldUnits) => {
      setShowNonAvailableUnits(showSoldUnits);
      setMessage(
        showSoldUnits
          ? "The public map now includes all unit status filters."
          : "The public map now shows only available and reserved units.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project", slug] }),
      ]);
    },
    onError: (error) => {
      setShowNonAvailableUnits(
        projectQuery.data?.publicConfig?.showSoldUnits === true,
      );
      setMessage(
        error instanceof Error
          ? error.message
          : "Public status visibility could not be updated.",
      );
    },
  });
  async function publish() {
    if (!projectQuery.data) return;
    try {
      await vstudioApi.publishProject(projectQuery.data.id);
      await projectQuery.refetch();
      setMessage("Your public project map is live.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The project could not be published.",
      );
    }
  }
  async function toggleAvailability() {
    if (!projectQuery.data || availabilityPending) return;
    const current = projectQuery.data;
    if (
      current.status !== "ARCHIVED" &&
      !window.confirm(
        `Deactivate “${current.name}”? Its public map will be taken offline. You can restore the project later.`,
      )
    )
      return;
    setAvailabilityPending(true);
    try {
      if (current.status === "ARCHIVED") {
        await vstudioApi.updateProject(current.id, { status: "DRAFT" });
        setMessage("Project restored as a draft. Publish it again when ready.");
      } else {
        await vstudioApi.archiveProject(current.id);
        setMessage(
          "Project deactivated and its public map taken offline. You can restore it from Projects.",
        );
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project", slug] }),
      ]);
      await projectQuery.refetch();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Project availability could not be changed.",
      );
    } finally {
      setAvailabilityPending(false);
    }
  }
  const publicUrl = `${process.env.NEXT_PUBLIC_PUBLIC_URL ?? "http://localhost:3001"}/p/${encodeURIComponent(project.slug)}`;
  const studioUrl = projectQuery.data
    ? `/studio?project=${encodeURIComponent(project.id)}`
    : "/studio";

  return (
    <AppShell>
      <div className="page-title-row">
        <div>
          <p className="page-eyebrow">
            <Link href="/projects">Projects</Link> / Project overview
          </p>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle">
            {project.location ?? "Project location"} ·{" "}
            {project.projectType.replaceAll("_", " ").toLowerCase()}
          </p>
        </div>
        <div className="title-actions">
          {projectQuery.data && canEditProject && (
            <Button
              variant="secondary"
              onClick={() => {
                setEditValues({
                  name: project.name,
                  slug: project.slug,
                  location: project.location ?? "",
                  description: project.description ?? "",
                });
                setEditing((value) => !value);
              }}
            >
              Edit project
            </Button>
          )}
          {projectQuery.data && canManageProject && (
            <Button
              variant="secondary"
              disabled={availabilityPending}
              onClick={() => void toggleAvailability()}
            >
              {availabilityPending
                ? "Saving…"
                : projectQuery.data.status === "ARCHIVED"
                  ? "Restore project"
                  : "Deactivate project"}
            </Button>
          )}
          {canEditProject && projectQuery.data?.status !== "ACTIVE" &&
            projectQuery.data?.status !== "ARCHIVED" && (
              <Button variant="secondary" onClick={() => void publish()}>
                Publish map
              </Button>
            )}
          {project.status === "ACTIVE" && project.publicEnabled && (
            <Link
              className="sanui-button sanui-button--secondary sanui-button--md"
              href={publicUrl}
              target="_blank"
            >
              View public map ↗
            </Link>
          )}
          {canViewMap && <Link
            className="sanui-button sanui-button--primary sanui-button--md"
            href={studioUrl}
          >
            Open Map Studio →
          </Link>}
        </div>
      </div>
      {message && (
        <p className="settings-footnote" role="status">
          {message}
        </p>
      )}
      {editing && canEditProject && (
        <section className="surface-card form-card">
          <form
            className="project-form"
            onSubmit={(event) => {
              event.preventDefault();
              editProject.mutate();
            }}
          >
            <h2>Edit project details</h2>
            <div className="form-field">
              <label htmlFor="edit-project-name">Project name</label>
              <input
                id="edit-project-name"
                required
                maxLength={120}
                value={editValues.name}
                onChange={(event) =>
                  setEditValues({ ...editValues, name: event.target.value })
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-project-slug">Public URL slug</label>
              <input
                id="edit-project-slug"
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                value={editValues.slug}
                onChange={(event) =>
                  setEditValues({ ...editValues, slug: event.target.value })
                }
              />
              <small className="field-hint">
                Changing the slug changes the public project URL.
              </small>
            </div>
            <div className="form-field">
              <label htmlFor="edit-project-location">Location</label>
              <input
                id="edit-project-location"
                value={editValues.location}
                onChange={(event) =>
                  setEditValues({ ...editValues, location: event.target.value })
                }
              />
            </div>
            <div className="form-field">
              <label htmlFor="edit-project-description">Description</label>
              <textarea
                id="edit-project-description"
                value={editValues.description}
                onChange={(event) =>
                  setEditValues({
                    ...editValues,
                    description: event.target.value,
                  })
                }
              />
            </div>
            {editProject.error && (
              <p className="form-error" role="alert">
                {editProject.error.message}
              </p>
            )}
            <div className="form-actions">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editProject.isPending}>
                {editProject.isPending ? "Saving…" : "Save details"}
              </Button>
            </div>
          </form>
        </section>
      )}
      {projectQuery.data && (
        <section className="surface-card project-setup-card">
          <header className="surface-header">
            <div>
              <h2>Project setup</h2>
              <p>Follow these steps to get your project ready for customers.</p>
            </div>
            <strong>
              {
                [
                  true,
                  layoutCount > 0,
                  units.length > 0,
                  project.status === "ACTIVE",
                ].filter(Boolean).length
              }{" "}
              of 4 complete
            </strong>
          </header>
          <ol className="project-setup-steps">
            <li className="is-complete">
              <span>✓</span>
              <div>
                <strong>Create project</strong>
                <small>Project details are saved.</small>
              </div>
            </li>
            <li className={layoutCount ? "is-complete" : "is-current"}>
              <span>{layoutCount ? "✓" : "2"}</span>
              <div>
                <strong>Upload a layout</strong>
                <small>
                  {layoutCount
                    ? `${layoutCount} layout${layoutCount === 1 ? "" : "s"} added.`
                    : "Add a floor plan or site map to start mapping."}
                </small>
              </div>
              {!layoutCount && (canManageLayouts || canViewMap) && (
                <Link href={studioUrl} className="text-link">
                  {canManageLayouts ? "Upload →" : "View Studio →"}
                </Link>
              )}
            </li>
            <li
              className={
                units.length ? "is-complete" : layoutCount ? "is-current" : ""
              }
            >
              <span>{units.length ? "✓" : "3"}</span>
              <div>
                <strong>Map inventory units</strong>
                <small>
                  {units.length
                    ? `${units.length} unit${units.length === 1 ? "" : "s"} mapped.`
                    : "Draw unit shapes and add their details in Map Studio."}
                </small>
              </div>
              {!units.length && canViewMap && (
                <Link href={studioUrl} className="text-link">
                  Open Studio →
                </Link>
              )}
            </li>
            <li
              className={
                project.status === "ACTIVE"
                  ? "is-complete"
                  : units.length && layoutCount
                    ? "is-current"
                    : ""
              }
            >
              <span>{project.status === "ACTIVE" ? "✓" : "4"}</span>
              <div>
                <strong>Publish public map</strong>
                <small>
                  {project.status === "ACTIVE"
                    ? "Your public project map is live."
                    : "Publish after adding a layout and at least one unit."}
                </small>
              </div>
              {canEditProject && project.status !== "ACTIVE" && (
                <Button
                  size="sm"
                  disabled={!layoutCount || !units.length}
                  onClick={() => void publish()}
                >
                  Publish
                </Button>
              )}
            </li>
          </ol>
        </section>
      )}
      {projectQuery.data && (
        <section className="surface-card project-public-settings-card">
          <header className="surface-header">
            <div>
              <h2>Public map status filters</h2>
              <p>
                Choose which inventory statuses customers can see and filter on.
              </p>
            </div>
          </header>
          <div className="setting-options project-public-settings-options">
            <label className="setting-check">
              <input
                type="checkbox"
                checked={
                  showNonAvailableUnits ??
                  (projectQuery.data.publicConfig?.showSoldUnits === true)
                }
                disabled={!canEditProject || publicVisibilityMutation.isPending}
                onChange={(event) => {
                  const nextValue = event.target.checked;
                  setShowNonAvailableUnits(nextValue);
                  publicVisibilityMutation.mutate(nextValue);
                }}
                aria-describedby="project-public-status-help"
              />
              <span>
                <strong>Show booked, sold, blocked, and off-market units</strong>
                <small id="project-public-status-help">
                  When enabled, those units appear on the public layout with
                  status filter chips. Available and reserved units remain
                  visible either way.
                </small>
              </span>
            </label>
            {!canEditProject && (
              <small className="field-hint">
                You need Edit project permission to change public visibility.
              </small>
            )}
          </div>
        </section>
      )}
      {projectQuery.data && (
        <section className="surface-card project-layouts-card">
          <header className="surface-header">
            <div>
              <h2>Project layouts</h2>
              <p>Choose a plan to manage its image and mapped unit outlines.</p>
            </div>
            {canManageLayouts && <Link
              className="sanui-button sanui-button--secondary sanui-button--md"
              href={studioUrl}
            >
              ＋ Add or manage layouts
            </Link>}
          </header>
          {layouts.length ? (
            <div className="project-layout-list">
              {layouts.map((layout) => {
                const count = units.filter(
                  (unit) => unit.layoutId === layout.id,
                ).length;
                return (
                  <article className="project-layout-row" key={layout.id}>
                    <div>
                      <strong>{layout.name}</strong>
                      <small>
                        {layout.width} × {layout.height} px · {count} mapped
                        unit{count === 1 ? "" : "s"}
                      </small>
                    </div>
                    {canViewMap && <Link
                      className="text-link"
                      href={`/studio?project=${encodeURIComponent(project.id)}&layout=${encodeURIComponent(layout.id)}`}
                    >
                      Manage in Studio →
                    </Link>}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="empty-state project-layout-empty">
              {canManageLayouts
                ? "No layouts yet. Add the correct floor plan or site plan in Map Studio."
                : "No layouts have been added. Ask a workspace owner or administrator to upload one."}
            </div>
          )}
        </section>
      )}
      {canViewInventory && <section className="overview-grid" aria-label="Project inventory summary">
        <article className="stat-card">
          <div className="stat-top">
            <span>Mapped units</span>
            <span className="stat-glyph">▤</span>
          </div>
          <div className="stat-value">{units.length}</div>
          <div className="stat-foot">Across project layouts</div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>Available</span>
            <span className="stat-glyph">◉</span>
          </div>
          <div className="stat-value">
            {saleUnits.filter((unit) => unit.status === "AVAILABLE").length}
          </div>
          <div className="stat-foot">Ready for enquiry</div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>Reserved</span>
            <span className="stat-glyph">⌂</span>
          </div>
          <div className="stat-value">
            {saleUnits.filter((unit) => unit.status === "RESERVED").length}
          </div>
          <div className="stat-foot">Active customer reservations</div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>Asking value</span>
            <span className="stat-glyph">₹</span>
          </div>
          <div className="stat-value stat-value--compact">
            {formatCurrency(saleUnits.reduce((sum, unit) => sum + unit.price, 0))}
          </div>
          <div className="stat-foot">Listed inventory value</div>
        </article>
      </section>}
      {canViewInventory && <section className="surface-card">
        <header className="surface-header">
          <div>
            <h2>Inventory</h2>
            <p>Units in {project.name}</p>
          </div>
          <Link
            className="text-link"
            href={`/inventory?project=${encodeURIComponent(project.id)}`}
          >
            Manage inventory →
          </Link>
        </header>
        <div className="table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th>Purpose</th>
                <th>Area</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleUnits.map((unit) => (
                <tr key={unit.id}>
                  <td>
                    <strong>{unit.unitNumber}</strong>
                  </td>
                  <td>{getUnitTypeLabel(unit.unitType, unit.metadata)}</td>
                  <td>{unit.purpose === "AMENITY" ? "Amenity · not for sale" : "For sale"}</td>
                  <td>
                    {unit.purpose === "AMENITY"
                      ? "—"
                      : unit.area.toLocaleString("en-IN")}{" "}
                    {unit.purpose === "AMENITY" ? "" : unit.areaUnit.toLowerCase()}
                  </td>
                  <td>
                    {unit.purpose === "AMENITY"
                      ? "Not for sale"
                      : formatCurrency(unit.price, unit.currency)}
                  </td>
                  <td>
                    {unit.purpose === "AMENITY" ? (
                      <Badge
                        style={{
                          backgroundColor: UNIT_PURPOSE_PRESENTATION.AMENITY.fill,
                          color: UNIT_PURPOSE_PRESENTATION.AMENITY.text,
                        }}
                      >
                        Not for sale
                      </Badge>
                    ) : (
                      <Badge
                        style={{
                          backgroundColor:
                            UNIT_STATUS_PRESENTATION[unit.status].fill,
                          color: UNIT_STATUS_PRESENTATION[unit.status].text,
                        }}
                      >
                        {UNIT_STATUS_PRESENTATION[unit.status].label}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="project-details-footer project-inventory-footer">
          <p className="project-inventory-footer__summary" aria-live="polite">
            Showing <strong>{firstVisibleUnit}–{lastVisibleUnit}</strong> of{" "}
            <strong>{units.length}</strong> units
            <span>
              {saleUnits.length} sale units · {amenityCount} amenities
            </span>
          </p>
          {inventoryPageCount > 1 && (
            <nav
              className="project-inventory-pagination"
              aria-label="Project inventory pagination"
            >
              <label htmlFor="project-inventory-page-size">Rows per page</label>
              <select
                id="project-inventory-page-size"
                value={activeInventoryPagination.pageSize}
                onChange={(event) => {
                  setInventoryPagination({
                    projectId: currentProjectId,
                    page: 1,
                    pageSize: Number(event.target.value),
                  });
                }}
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={48}>48</option>
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={visibleInventoryPage <= 1}
                onClick={() =>
                  setInventoryPagination({
                    ...activeInventoryPagination,
                    page: Math.max(1, visibleInventoryPage - 1),
                  })
                }
              >
                Previous
              </Button>
              <span aria-live="polite">
                Page {visibleInventoryPage} of {inventoryPageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={visibleInventoryPage >= inventoryPageCount}
                onClick={() =>
                  setInventoryPagination({
                    ...activeInventoryPagination,
                    page: Math.min(inventoryPageCount, visibleInventoryPage + 1),
                  })
                }
              >
                Next
              </Button>
            </nav>
          )}
        </footer>
      </section>}
      {!projectQuery.data && (
        <p className="settings-footnote">
          Showing sample project data. Sign in to load your organization’s saved
          project.
        </p>
      )}
    </AppShell>
  );
}
