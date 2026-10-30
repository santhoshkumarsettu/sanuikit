"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { Badge, Button, Modal } from "sanui";
import { formatCurrency } from "@vstudio/utils";
import { AppShell } from "../../components/app-shell";

export default function ProjectsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({ queryKey: ["projects", { includeArchived: true }], queryFn: () => vstudioApi.projects(true), retry: false });
  const [actionProjectId, setActionProjectId] = useState<string>();
  const [actionMessage, setActionMessage] = useState("");
  const [openMenuProjectId, setOpenMenuProjectId] = useState<string>();
  const [deleteTarget, setDeleteTarget] = useState<(typeof projects)[number]>();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const actionMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) setOpenMenuProjectId(undefined);
    }
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setOpenMenuProjectId(undefined); }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeMenu); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  const projects = projectsQuery.data ?? [];
  const filtered = useMemo(() => projects.filter(project =>
    (status === "ALL" || project.status === status) &&
    (type === "ALL" || project.projectType === type) &&
    `${project.name} ${project.location ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  ), [projects, status, type, search]);
  const askingValueQuery = useQuery({
    queryKey: ["portfolio-value", projects.map(project => project.id)],
    queryFn: async () => {
      const units = await Promise.all(projects.map(project => vstudioApi.units(project.id)));
      return units.flat().reduce((total, unit) => total + unit.price, 0);
    },
    enabled: projects.length > 0,
    retry: false,
  });
  async function runProjectAction(project: (typeof projects)[number], action: "deactivate" | "archive" | "restore") {
    if (action === "archive" && !window.confirm(`Archive “${project.name}”? It will be hidden from project pickers and its public map will be taken offline. You can restore it later.`)) return;
    setActionProjectId(project.id);
    setOpenMenuProjectId(undefined);
    setActionMessage("");
    try {
      if (action === "restore") {
        await vstudioApi.updateProject(project.id, { status: "DRAFT" });
        setActionMessage(`${project.name} restored as a draft. Publish it again when ready.`);
      } else if (action === "archive") {
        await vstudioApi.archiveProject(project.id);
        setActionMessage(`${project.name} archived. You can restore it from this list.`);
      } else {
        await vstudioApi.updateProject(project.id, { status: "DRAFT" });
        setActionMessage(`${project.name} deactivated and its public map taken offline.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project"] }),
      ]);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The project status could not be changed.");
    } finally {
      setActionProjectId(undefined);
    }
  }

  async function permanentlyDeleteProject() {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name) return;
    setActionProjectId(deleteTarget.id);
    setActionMessage("");
    try {
      await vstudioApi.deleteProject(deleteTarget.id, deleteConfirmation);
      setActionMessage(`${deleteTarget.name} and its layouts, units, and bookings were permanently deleted.`);
      setDeleteTarget(undefined);
      setDeleteConfirmation("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["project"] }),
      ]);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "The project could not be deleted.");
    } finally {
      setActionProjectId(undefined);
    }
  }

  return <AppShell><div className="projects-page">
    <div className="page-title-row"><div><p className="page-eyebrow">Workspace</p><h1 className="page-title">Projects</h1><p className="page-subtitle">Manage property developments, layouts, and inventory.</p></div><Link href="/projects/new" className="sanui-button sanui-button--primary sanui-button--md">＋ New project</Link></div>
    {actionMessage && <p className="settings-footnote" role="status">{actionMessage}</p>}
    <section className="surface-card projects-list-card">
      <div className="inventory-toolbar"><div className="inventory-search"><input aria-label="Search projects" placeholder="Search projects by name or location" value={search} onChange={event => setSearch(event.target.value)} /></div><select className="sanui-select filter-select" aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select><select className="sanui-select filter-select" aria-label="Filter by type" value={type} onChange={event => setType(event.target.value)}><option value="ALL">All project types</option>{[...new Set(projects.map(project => project.projectType))].map(projectType => <option key={projectType} value={projectType}>{projectType.replaceAll("_", " ")}</option>)}</select><span className="result-count">{filtered.length} projects</span></div>
      {projectsQuery.isLoading ? <div className="empty-state">Loading projects…</div> : projectsQuery.isError ? <div className="empty-state" role="alert">Couldn’t load projects. Check your API connection and try again.<Button variant="secondary" size="sm" onClick={() => void projectsQuery.refetch()}>Retry</Button></div> : <>
        <div className="table-scroll"><table className="inventory-table projects-table"><thead><tr><th>Project</th><th>Type</th><th>Status</th><th>Units</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{filtered.map(project => <tr key={project.id} className="project-row-clickable" tabIndex={0} aria-label={`Open ${project.name}`} onClick={event => { const target = event.target; if (target instanceof Element && target.closest("a, button, input, select, [role='menu']")) return; router.push(`/projects/${project.slug}`); }} onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); router.push(`/projects/${project.slug}`); } }}><td><Link href={`/projects/${project.slug}`} className="project-name"><span className="project-thumb" /><span><strong>{project.name}</strong><small>{project.location || "Location not set"}</small></span></Link></td><td>{project.projectType.replaceAll("_", " ")}</td><td><Badge tone={project.status === "ACTIVE" ? "success" : "neutral"}>{project.status === "ARCHIVED" ? "ARCHIVED" : project.status}</Badge></td><td>{project._count?.units ?? "—"}</td><td>{new Date(project.updatedAt).toLocaleDateString()}</td><td><div className="project-row-actions"><div className="project-actions-menu" ref={openMenuProjectId === project.id ? actionMenuRef : undefined}><Button variant="ghost" size="sm" className="project-actions-trigger" aria-label={`Actions for ${project.name}`} aria-haspopup="menu" aria-expanded={openMenuProjectId === project.id} disabled={actionProjectId === project.id} onClick={() => setOpenMenuProjectId(current => current === project.id ? undefined : project.id)}>{actionProjectId === project.id ? "…" : <svg aria-hidden="true" viewBox="0 0 4 16" width="4" height="16" fill="currentColor"><circle cx="2" cy="2" r="1.6" /><circle cx="2" cy="8" r="1.6" /><circle cx="2" cy="14" r="1.6" /></svg>}</Button>{openMenuProjectId === project.id && <div className="project-actions-popover" role="menu">
          {project.status === "ARCHIVED" ? <button type="button" role="menuitem" onClick={() => void runProjectAction(project, "restore")}>Restore as draft</button> : <button type="button" role="menuitem" disabled={project.status === "DRAFT"} onClick={() => void runProjectAction(project, "deactivate")}>{project.status === "DRAFT" ? "Already deactivated" : "Deactivate"}</button>}
          {project.status === "ARCHIVED" ? <button type="button" role="menuitem" disabled>Already archived</button> : <button type="button" role="menuitem" onClick={() => void runProjectAction(project, "archive")}>Archive</button>}
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpenMenuProjectId(undefined); setDeleteTarget(project); setDeleteConfirmation(""); }}>Delete permanently</button>
        </div>}</div></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">{projects.length ? "No projects match these filters." : "No projects yet. Create a project to start mapping your inventory."}</div>}</div>
        <div className="list-footer">Showing {filtered.length} of {projects.length} projects</div>
      </>}
    </section>
    <section className="project-value"><span>Portfolio asking value</span><strong>{askingValueQuery.data === undefined ? "—" : formatCurrency(askingValueQuery.data)}</strong><small>{askingValueQuery.isError ? "Inventory value is unavailable" : "Across projects in this workspace"}</small></section>
    <Modal open={Boolean(deleteTarget)} title="Delete project permanently?" className="project-delete-modal" onClose={() => { if (actionProjectId !== deleteTarget?.id) { setDeleteTarget(undefined); setDeleteConfirmation(""); } }} footer={<><Button variant="secondary" disabled={actionProjectId === deleteTarget?.id} onClick={() => { setDeleteTarget(undefined); setDeleteConfirmation(""); }}>Cancel</Button><Button variant="danger" disabled={!deleteTarget || deleteConfirmation !== deleteTarget.name || actionProjectId === deleteTarget?.id} onClick={() => void permanentlyDeleteProject()}>{actionProjectId === deleteTarget?.id ? "Deleting…" : "Delete project"}</Button></>}>
      {deleteTarget && <div className="project-delete-content"><p><strong>{deleteTarget.name}</strong> and its layouts, inventory units, and bookings will be permanently deleted.</p><p>This can’t be undone. Type the project name below to confirm.</p><label htmlFor="project-delete-confirmation">Project name</label><input id="project-delete-confirmation" autoComplete="off" value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder={deleteTarget.name} /></div>}
    </Modal>
  </div></AppShell>;
}
