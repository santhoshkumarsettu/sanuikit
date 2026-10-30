"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { allowedUnitStatuses, type UnitStatus } from "@vstudio/types";
import { Badge, Button } from "sanui";
import { formatArea, formatCurrency } from "@vstudio/utils";
import { AppShell } from "../../components/app-shell";

function StatusBadge({ status }: { status: UnitStatus }) {
  const tone = status === "AVAILABLE" ? "success" : status === "RESERVED" ? "warning" : status === "BOOKED" ? "info" : status === "SOLD" ? "neutral" : "danger";
  return <Badge tone={tone}>{status.replaceAll("_", " ")}</Badge>;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [unitType, setUnitType] = useState("ALL");
  const [projectId, setProjectId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("project") ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Awaited<ReturnType<typeof vstudioApi.previewUnitImport>> | null>(null);
  const projectsQuery = useQuery({ queryKey: ["projects"], queryFn: () => vstudioApi.projects(), retry: false });
  const projects = projectsQuery.data ?? [];
  const selectedProjectId = projectId || projects[0]?.id || "";
  const unitsQuery = useQuery({ queryKey: ["units", selectedProjectId], queryFn: () => vstudioApi.units(selectedProjectId), enabled: Boolean(selectedProjectId), retry: false });
  const units = unitsQuery.data ?? [];
  const filtered = useMemo(() => units.filter(unit =>
    (status === "ALL" || unit.status === status) &&
    (unitType === "ALL" || unit.unitType === unitType) &&
    unit.unitNumber.toLowerCase().includes(search.toLowerCase()),
  ), [units, status, unitType, search]);
  const selectedUnits = units.filter(unit => selected.includes(unit.id));
  const primarySelectedStatus = selectedUnits[0]?.status;
  const validBulkStatuses = primarySelectedStatus
    ? [...allowedUnitStatuses(primarySelectedStatus)].filter(nextStatus =>
        selectedUnits.every(unit => allowedUnitStatuses(unit.status).has(nextStatus)),
      )
    : [];
  const bulkMutation = useMutation({
    mutationFn: (nextStatus: UnitStatus) => vstudioApi.bulkUpdateUnitStatus(selected, nextStatus),
    onSuccess: async result => { setSelected([]); setMessage(`Updated ${result.units.length} units.`); await queryClient.invalidateQueries({ queryKey: ["units", selectedProjectId] }); },
    onError: error => setMessage(error instanceof Error ? error.message : "Bulk status update failed."),
  });
  function confirmSold(unitNumber: string) {
    return window.confirm(`Mark ${unitNumber} as sold? Sold units cannot be returned to available inventory.`);
  }
  function changeUnitStatus(id: string, unitNumber: string, nextStatus: UnitStatus) {
    if (nextStatus === "SOLD" && !confirmSold(unitNumber)) return;
    statusMutation.mutate({ id, nextStatus });
  }
  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: UnitStatus }) => vstudioApi.updateUnitStatus(id, { status: nextStatus }),
    onSuccess: async () => { setMessage("Unit status updated."); await queryClient.invalidateQueries({ queryKey: ["units", selectedProjectId] }); },
    onError: error => setMessage(error instanceof Error ? error.message : "The unit status could not be updated."),
  });
  const previewMutation = useMutation({
    mutationFn: (csv: string) => vstudioApi.previewUnitImport(selectedProjectId, csv),
    onSuccess: result => { setCsvPreview(result); setMessage(result.canImport ? `${result.totalRows} rows are ready to import.` : `Found ${result.invalidRows.length} issue(s). No rows were changed.`); },
    onError: error => setMessage(error instanceof Error ? error.message : "CSV preview failed."),
  });
  const commitMutation = useMutation({
    mutationFn: () => vstudioApi.commitUnitImport(selectedProjectId, csvText),
    onSuccess: async result => { setCsvPreview(null); setCsvText(""); setMessage(`Imported ${result.imported} unit updates.`); await queryClient.invalidateQueries({ queryKey: ["units", selectedProjectId] }); },
    onError: error => setMessage(error instanceof Error ? error.message : "CSV import failed."),
  });
  function toggleOne(id: string) { setSelected(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); }
  async function loadCsv(file?: File) {
    if (!file || !selectedProjectId) return;
    const text = await file.text();
    setCsvText(text);
    setCsvPreview(null);
    previewMutation.mutate(text);
  }

  return <AppShell><div className="inventory-page">
    <div className="page-title-row"><div><p className="page-eyebrow">Workspace inventory</p><h1 className="page-title">Inventory</h1><p className="page-subtitle">Search, filter, and update mapped units in a project.</p></div><div className="title-actions"><label className="sanui-button sanui-button--secondary sanui-button--md">↑ Import CSV<input type="file" accept=".csv,text/csv" hidden disabled={!selectedProjectId || previewMutation.isPending} onChange={event => { void loadCsv(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label><a className="sanui-button sanui-button--primary sanui-button--md" href={selectedProjectId ? `/studio?project=${encodeURIComponent(selectedProjectId)}` : "/projects/new"}>＋ Add unit</a></div></div>
    <section className="surface-card inventory-card">
      <div className="inventory-toolbar"><select className="sanui-select filter-select" aria-label="Choose project" value={selectedProjectId} onChange={event => { setProjectId(event.target.value); setSelected([]); setCsvPreview(null); }}><option value="" disabled>Select a project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><div className="inventory-search"><input aria-label="Search unit number" placeholder="Search by unit number…" value={search} onChange={event => setSearch(event.target.value)} /></div><select className="sanui-select filter-select" aria-label="Filter by status" value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All statuses</option>{["AVAILABLE", "RESERVED", "BOOKED", "SOLD", "BLOCKED", "OFF_MARKET"].map(value => <option value={value} key={value}>{value.replaceAll("_", " ")}</option>)}</select><select className="sanui-select filter-select" aria-label="Filter by unit type" value={unitType} onChange={event => setUnitType(event.target.value)}><option value="ALL">All unit types</option>{[...new Set(units.map(unit => unit.unitType))].map(value => <option value={value} key={value}>{value}</option>)}</select><span className="result-count">{filtered.length} units</span></div>
      {message && <p className="settings-footnote" role="status">{message}<button type="button" aria-label="Dismiss message" onClick={() => setMessage("")}> ×</button></p>}
      {csvPreview && <div className="bulk-toolbar" role="region" aria-label="CSV import preview"><strong>{csvPreview.totalRows} CSV rows</strong><span>{csvPreview.canImport ? "All rows validated." : `${csvPreview.invalidRows.length} row issue(s).`}</span>{csvPreview.invalidRows.slice(0, 3).map(error => <small key={`${error.line}-${error.message}`}>Line {error.line}: {error.message}</small>)}{csvPreview.canImport && <Button size="sm" disabled={commitMutation.isPending} onClick={() => commitMutation.mutate()}>{commitMutation.isPending ? "Importing…" : "Apply import"}</Button>}<Button size="sm" variant="ghost" onClick={() => { setCsvPreview(null); setCsvText(""); }}>Cancel</Button></div>}
      {selected.length > 0 && <div className="bulk-toolbar"><strong>{selected.length} selected</strong><label htmlFor="bulk-status">Change status</label><select id="bulk-status" className="sanui-select filter-select" defaultValue="" onChange={event => { const nextStatus = event.target.value as UnitStatus; if (!nextStatus) return; if (nextStatus === "SOLD" && !window.confirm(`Mark all ${selected.length} selected units as sold? Sold units cannot be returned to available inventory.`)) { event.currentTarget.value = ""; return; } bulkMutation.mutate(nextStatus); }}><option value="" disabled>Choose status…</option>{validBulkStatuses.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button></div>}
      {projectsQuery.isLoading || (selectedProjectId && unitsQuery.isLoading) ? <div className="empty-state">Loading inventory…</div> : projectsQuery.isError ? <div className="empty-state" role="alert">Couldn’t load projects. Check your API connection and retry.</div> : unitsQuery.isError ? <div className="empty-state" role="alert">Couldn’t load this project’s inventory. <Button size="sm" variant="secondary" onClick={() => void unitsQuery.refetch()}>Retry</Button></div> : !selectedProjectId ? <div className="empty-state">Create a project before adding mapped inventory.</div> : <>
        <div className="table-scroll"><table className="inventory-table inventory-data-table"><thead><tr><th className="checkbox-cell"><input aria-label="Select all visible units" type="checkbox" checked={filtered.length > 0 && filtered.every(unit => selected.includes(unit.id))} onChange={event => setSelected(event.target.checked ? filtered.map(unit => unit.id) : [])} /></th><th>Unit</th><th>Type</th><th>Area</th><th>Price</th><th>Status</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>{filtered.map(unit => <tr key={unit.id}><td><input aria-label={`Select ${unit.unitNumber}`} type="checkbox" checked={selected.includes(unit.id)} onChange={() => toggleOne(unit.id)} /></td><td><strong>{unit.unitNumber}</strong></td><td>{unit.unitType}</td><td>{formatArea(unit.area, unit.areaUnit)}</td><td>{formatCurrency(unit.price, unit.currency)}</td><td><div className="inventory-status-cell"><StatusBadge status={unit.status} /><select className="sanui-select filter-select status-select" aria-label={`Change ${unit.unitNumber} status`} value={unit.status} disabled={statusMutation.isPending} onChange={event => changeUnitStatus(unit.id, unit.unitNumber, event.target.value as UnitStatus)}><option value={unit.status}>{unit.status.replaceAll("_", " ")}</option>{[...allowedUnitStatuses(unit.status)].filter(value => value !== unit.status).map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></div></td><td>{new Date(unit.updatedAt).toLocaleDateString()}</td><td><div className="inventory-row-actions">{allowedUnitStatuses(unit.status).has("SOLD") && <button className="text-button inventory-sold-action" type="button" disabled={statusMutation.isPending} onClick={() => changeUnitStatus(unit.id, unit.unitNumber, "SOLD")}>Mark sold</button>}<a className="text-link" href={`/studio?project=${encodeURIComponent(selectedProjectId)}&unit=${encodeURIComponent(unit.id)}`}>View map →</a></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-state">{units.length ? "No inventory matches the selected filters." : "No units in this project yet. Add units in Map Studio."}</div>}</div><div className="list-footer">Showing {filtered.length} of {units.length} units in {projects.find(project => project.id === selectedProjectId)?.name}</div>
      </>}
    </section>
  </div></AppShell>;
}
