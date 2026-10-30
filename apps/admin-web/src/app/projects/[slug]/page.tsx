"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { Badge, Button } from "sanui";
import { demoProject, formatCurrency } from "@vstudio/utils";
import { AppShell } from "../../../components/app-shell";

export default function ProjectDetailsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
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
    enabled: Boolean(projectQuery.data?.id),
    retry: false,
  });
  const units = unitsQuery.data ?? [];
  const layoutCount = projectQuery.data?.layouts.length ?? 0;
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState(false);
  const [availabilityPending, setAvailabilityPending] = useState(false);
  const [editValues, setEditValues] = useState({ name: "", slug: "", location: "", description: "" });
  const editProject = useMutation({
    mutationFn: () => vstudioApi.updateProject(project.id, editValues),
    onSuccess: async updated => {
      setEditing(false);
      setMessage("Project details saved.");
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["projects"] }), queryClient.invalidateQueries({ queryKey: ["project", slug] })]);
      if (updated.slug !== slug) { router.replace(`/projects/${updated.slug}`); return; }
      await projectQuery.refetch();
    },
    onError: error => setMessage(error instanceof Error ? error.message : "Project details could not be saved."),
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
    if (current.status !== "ARCHIVED" && !window.confirm(`Deactivate “${current.name}”? Its public map will be taken offline. You can restore the project later.`)) return;
    setAvailabilityPending(true);
    try {
      if (current.status === "ARCHIVED") {
        await vstudioApi.updateProject(current.id, { status: "DRAFT" });
        setMessage("Project restored as a draft. Publish it again when ready.");
      } else {
        await vstudioApi.archiveProject(current.id);
        setMessage("Project deactivated and its public map taken offline. You can restore it from Projects.");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project", slug] }),
      ]);
      await projectQuery.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Project availability could not be changed.");
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
          {projectQuery.data && <Button variant="secondary" onClick={() => { setEditValues({ name: project.name, slug: project.slug, location: project.location ?? "", description: project.description ?? "" }); setEditing(value => !value); }}>Edit project</Button>}
          {projectQuery.data && <Button variant="secondary" disabled={availabilityPending} onClick={() => void toggleAvailability()}>{availabilityPending ? "Saving…" : projectQuery.data.status === "ARCHIVED" ? "Restore project" : "Deactivate project"}</Button>}
          {projectQuery.data?.status !== "ACTIVE" && projectQuery.data?.status !== "ARCHIVED" && (
            <Button variant="secondary" onClick={() => void publish()}>
              Publish map
            </Button>
          )}
          {project.status === "ACTIVE" && project.publicEnabled && <Link
            className="sanui-button sanui-button--secondary sanui-button--md"
            href={publicUrl}
            target="_blank"
          >
            View public map ↗
          </Link>}
          <Link
            className="sanui-button sanui-button--primary sanui-button--md"
            href={studioUrl}
          >
            Open Map Studio →
          </Link>
        </div>
      </div>
      {message && (
        <p className="settings-footnote" role="status">
          {message}
        </p>
      )}
      {editing && <section className="surface-card form-card"><form className="project-form" onSubmit={event => { event.preventDefault(); editProject.mutate(); }}><h2>Edit project details</h2><div className="form-field"><label htmlFor="edit-project-name">Project name</label><input id="edit-project-name" required maxLength={120} value={editValues.name} onChange={event => setEditValues({ ...editValues, name: event.target.value })} /></div><div className="form-field"><label htmlFor="edit-project-slug">Public URL slug</label><input id="edit-project-slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={editValues.slug} onChange={event => setEditValues({ ...editValues, slug: event.target.value })} /><small className="field-hint">Changing the slug changes the public project URL.</small></div><div className="form-field"><label htmlFor="edit-project-location">Location</label><input id="edit-project-location" value={editValues.location} onChange={event => setEditValues({ ...editValues, location: event.target.value })} /></div><div className="form-field"><label htmlFor="edit-project-description">Description</label><textarea id="edit-project-description" value={editValues.description} onChange={event => setEditValues({ ...editValues, description: event.target.value })} /></div>{editProject.error && <p className="form-error" role="alert">{editProject.error.message}</p>}<div className="form-actions"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={editProject.isPending}>{editProject.isPending ? "Saving…" : "Save details"}</Button></div></form></section>}
      {projectQuery.data && <section className="surface-card project-setup-card"><header className="surface-header"><div><h2>Project setup</h2><p>Follow these steps to get your project ready for customers.</p></div><strong>{[true, layoutCount > 0, units.length > 0, project.status === "ACTIVE"].filter(Boolean).length} of 4 complete</strong></header><ol className="project-setup-steps"><li className="is-complete"><span>✓</span><div><strong>Create project</strong><small>Project details are saved.</small></div></li><li className={layoutCount ? "is-complete" : "is-current"}><span>{layoutCount ? "✓" : "2"}</span><div><strong>Upload a layout</strong><small>{layoutCount ? `${layoutCount} layout${layoutCount === 1 ? "" : "s"} added.` : "Add a floor plan or site map to start mapping."}</small></div>{!layoutCount && <Link href={studioUrl} className="text-link">Upload →</Link>}</li><li className={units.length ? "is-complete" : layoutCount ? "is-current" : ""}><span>{units.length ? "✓" : "3"}</span><div><strong>Map inventory units</strong><small>{units.length ? `${units.length} unit${units.length === 1 ? "" : "s"} mapped.` : "Draw unit shapes and add their details in Map Studio."}</small></div>{!units.length && <Link href={studioUrl} className="text-link">Open Studio →</Link>}</li><li className={project.status === "ACTIVE" ? "is-complete" : units.length && layoutCount ? "is-current" : ""}><span>{project.status === "ACTIVE" ? "✓" : "4"}</span><div><strong>Publish public map</strong><small>{project.status === "ACTIVE" ? "Your public project map is live." : "Publish after adding a layout and at least one unit."}</small></div>{project.status !== "ACTIVE" && <Button size="sm" disabled={!layoutCount || !units.length} onClick={() => void publish()}>Publish</Button>}</li></ol></section>}
      <section className="overview-grid" aria-label="Project inventory summary">
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
            {units.filter((unit) => unit.status === "AVAILABLE").length}
          </div>
          <div className="stat-foot">Ready for enquiry</div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>Reserved</span>
            <span className="stat-glyph">⌂</span>
          </div>
          <div className="stat-value">
            {units.filter((unit) => unit.status === "RESERVED").length}
          </div>
          <div className="stat-foot">Active customer reservations</div>
        </article>
        <article className="stat-card">
          <div className="stat-top">
            <span>Asking value</span>
            <span className="stat-glyph">₹</span>
          </div>
          <div className="stat-value stat-value--compact">
            {formatCurrency(units.reduce((sum, unit) => sum + unit.price, 0))}
          </div>
          <div className="stat-foot">Listed inventory value</div>
        </article>
      </section>
      <section className="surface-card">
        <header className="surface-header">
          <div>
            <h2>Inventory</h2>
            <p>Units in {project.name}</p>
          </div>
          <Link className="text-link" href={`/inventory?project=${encodeURIComponent(project.id)}`}>
            Manage inventory →
          </Link>
        </header>
        <div className="table-scroll">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th>Area</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {units.slice(0, 12).map((unit) => (
                <tr key={unit.id}>
                  <td>
                    <strong>{unit.unitNumber}</strong>
                  </td>
                  <td>{unit.unitType}</td>
                  <td>
                    {unit.area.toLocaleString("en-IN")}{" "}
                    {unit.areaUnit.toLowerCase()}
                  </td>
                  <td>{formatCurrency(unit.price, unit.currency)}</td>
                  <td>
                    <Badge
                      tone={
                        unit.status === "AVAILABLE"
                          ? "success"
                          : unit.status === "RESERVED"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {unit.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="list-footer project-details-footer">
          {units.length} units currently shown in this project
        </footer>
      </section>
      {!projectQuery.data && (
        <p className="settings-footnote">
          Showing sample project data. Sign in to load your organization’s saved
          project.
        </p>
      )}
    </AppShell>
  );
}
