"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { Badge, Button } from "sanui";
import { formatCurrency } from "@vstudio/utils";
import { AppShell } from "../../components/app-shell";

export default function ProjectsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => vstudioApi.projects(), retry: false });
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

  return <AppShell><div className="projects-page">
    <div className="page-title-row"><div><p className="page-eyebrow">Workspace</p><h1 className="page-title">Projects</h1><p className="page-subtitle">Manage property developments, layouts, and inventory.</p></div><Link href="/projects/new" className="sanui-button sanui-button--primary sanui-button--md">＋ New project</Link></div>
    <section className="surface-card projects-list-card">
      <div className="inventory-toolbar"><div className="inventory-search"><input aria-label="Search projects" placeholder="Search projects by name or location" value={search} onChange={event => setSearch(event.target.value)} /></div><select className="sanui-select filter-select" aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="DRAFT">Draft</option><option value="ARCHIVED">Archived</option></select><select className="sanui-select filter-select" aria-label="Filter by type" value={type} onChange={event => setType(event.target.value)}><option value="ALL">All project types</option>{[...new Set(projects.map(project => project.projectType))].map(projectType => <option key={projectType} value={projectType}>{projectType.replaceAll("_", " ")}</option>)}</select><span className="result-count">{filtered.length} projects</span></div>
      {projectsQuery.isLoading ? <div className="empty-state">Loading projects…</div> : projectsQuery.isError ? <div className="empty-state" role="alert">Couldn’t load projects. Check your API connection and try again.<Button variant="secondary" size="sm" onClick={() => void projectsQuery.refetch()}>Retry</Button></div> : <>
        <div className="table-scroll"><table className="inventory-table projects-table"><thead><tr><th>Project</th><th>Type</th><th>Status</th><th>Units</th><th>Updated</th><th /></tr></thead><tbody>{filtered.map(project => <tr key={project.id}><td><Link href={`/projects/${project.slug}`} className="project-name"><span className="project-thumb" /><span><strong>{project.name}</strong><small>{project.location || "Location not set"}</small></span></Link></td><td>{project.projectType.replaceAll("_", " ")}</td><td><Badge tone={project.status === "ACTIVE" ? "success" : "neutral"}>{project.status}</Badge></td><td>{project._count?.units ?? "—"}</td><td>{new Date(project.updatedAt).toLocaleDateString()}</td><td><Link href={`/projects/${project.slug}`} className="text-link">Open →</Link></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">{projects.length ? "No projects match these filters." : "No projects yet. Create a project to start mapping your inventory."}</div>}</div>
        <div className="list-footer">Showing {filtered.length} of {projects.length} projects</div>
      </>}
    </section>
    <section className="project-value"><span>Portfolio asking value</span><strong>{askingValueQuery.data === undefined ? "—" : formatCurrency(askingValueQuery.data)}</strong><small>{askingValueQuery.isError ? "Inventory value is unavailable" : "Across projects in this workspace"}</small></section>
  </div></AppShell>;
}
