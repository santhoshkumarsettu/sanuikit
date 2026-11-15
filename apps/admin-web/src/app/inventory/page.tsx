"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import {
  allowedUnitStatuses,
  UNIT_CATEGORY_PRESENTATION,
  UNIT_PURPOSE_PRESENTATION,
  UNIT_STATUS_PRESENTATION,
  type UnitCategory,
  type UnitPurpose,
  type UnitStatus,
} from "@vstudio/types";
import { Badge, Button } from "sanui";
import { formatArea, formatCurrency, getUnitTypeLabel } from "@vstudio/utils";
import { AppShell } from "../../components/app-shell";
import { usePermissions } from "../../hooks/use-permissions";

function StatusBadge({ status }: { status: UnitStatus }) {
  const presentation = UNIT_STATUS_PRESENTATION[status];
  return (
    <Badge
      style={{ backgroundColor: presentation.fill, color: presentation.text }}
    >
      {presentation.label}
    </Badge>
  );
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canCreateUnit = can("CREATE_UNIT");
  const canEditUnit = can("EDIT_UNIT");
  const canUpdateStatus = can("UPDATE_STATUS");
  const canCreateBooking = can("CREATE_BOOKING");
  const canExport = can("EXPORT_DATA");
  const canViewMap = can("VIEW_MAP");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [category, setCategory] = useState<"ALL" | UnitCategory>("ALL");
  const [unitType, setUnitType] = useState("ALL");
  const [purpose, setPurpose] = useState<"ALL" | UnitPurpose>("ALL");
  const [projectId, setProjectId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("project") ?? ""),
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkCategorySelection, setBulkCategorySelection] = useState("");
  const [message, setMessage] = useState("");
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<Awaited<
    ReturnType<typeof vstudioApi.previewUnitImport>
  > | null>(null);
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => vstudioApi.projects(),
    retry: false,
  });
  const projects = projectsQuery.data ?? [];
  const selectedProjectId = projectId || projects[0]?.id || "";
  const unitsQuery = useQuery({
    queryKey: ["units", selectedProjectId],
    queryFn: () => vstudioApi.units(selectedProjectId),
    enabled: Boolean(selectedProjectId),
    retry: false,
  });
  const units = unitsQuery.data ?? [];
  const filtered = useMemo(
    () =>
      units.filter(
        (unit) =>
          (status === "ALL" || unit.status === status) &&
          (category === "ALL" || unit.metadata?.category === category) &&
          (purpose === "ALL" || unit.purpose === purpose) &&
          (unitType === "ALL" || unit.unitType === unitType) &&
          unit.unitNumber.toLowerCase().includes(search.toLowerCase()),
      ),
    [units, status, category, purpose, unitType, search],
  );
  const canManageSelection = canUpdateStatus || canEditUnit;
  const selectableFiltered = canManageSelection
    ? filtered.filter((unit) => unit.purpose === "SALE")
    : [];
  const selectedUnits = units.filter(
    (unit) => unit.purpose === "SALE" && selected.includes(unit.id),
  );
  const primarySelectedStatus = selectedUnits[0]?.status;
  const validBulkStatuses = primarySelectedStatus
    ? [...allowedUnitStatuses(primarySelectedStatus)].filter((nextStatus) =>
        selectedUnits.every((unit) =>
          allowedUnitStatuses(unit.status).has(nextStatus),
        ),
      )
    : [];
  const bulkMutation = useMutation({
    mutationFn: (nextStatus: UnitStatus) =>
      vstudioApi.bulkUpdateUnitStatus(selected, nextStatus),
    onSuccess: async (result) => {
      setSelected([]);
      setMessage(`Updated ${result.units.length} units.`);
      await queryClient.invalidateQueries({
        queryKey: ["units", selectedProjectId],
      });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error ? error.message : "Bulk status update failed.",
      ),
  });
  const bulkCategoryMutation = useMutation({
    mutationFn: (nextCategory: UnitCategory | null) =>
      vstudioApi.bulkUpdateUnitCategory(
        selectedProjectId,
        selected,
        nextCategory,
      ),
    onSuccess: async (result) => {
      setSelected([]);
      setBulkCategorySelection("");
      setMessage(`Assigned categories to ${result.units.length} units.`);
      await queryClient.invalidateQueries({
        queryKey: ["units", selectedProjectId],
      });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "The category could not be assigned to the selected units.",
      ),
    onSettled: () => setBulkCategorySelection(""),
  });
  function confirmSold(unitNumber: string) {
    return window.confirm(
      `Mark ${unitNumber} as sold? Sold units cannot be returned to available inventory.`,
    );
  }
  function changeUnitStatus(
    id: string,
    unitNumber: string,
    nextStatus: UnitStatus,
  ) {
    if (nextStatus === "SOLD" && !confirmSold(unitNumber)) return;
    statusMutation.mutate({ id, nextStatus });
  }
  const statusMutation = useMutation({
    mutationFn: ({ id, nextStatus }: { id: string; nextStatus: UnitStatus }) =>
      vstudioApi.updateUnitStatus(id, { status: nextStatus }),
    onSuccess: async () => {
      setMessage("Unit status updated.");
      await queryClient.invalidateQueries({
        queryKey: ["units", selectedProjectId],
      });
    },
    onError: (error) =>
      setMessage(
        error instanceof Error
          ? error.message
          : "The unit status could not be updated.",
      ),
  });
  const previewMutation = useMutation({
    mutationFn: (csv: string) =>
      vstudioApi.previewUnitImport(selectedProjectId, csv),
    onSuccess: (result) => {
      setCsvPreview(result);
      setMessage(
        result.canImport
          ? `${result.totalRows} rows are ready to import.`
          : `Found ${result.invalidRows.length} issue(s). No rows were changed.`,
      );
    },
    onError: (error) =>
      setMessage(
        error instanceof Error ? error.message : "CSV preview failed.",
      ),
  });
  const commitMutation = useMutation({
    mutationFn: () => vstudioApi.commitUnitImport(selectedProjectId, csvText),
    onSuccess: async (result) => {
      setCsvPreview(null);
      setCsvText("");
      setMessage(`Imported ${result.imported} unit updates.`);
      await queryClient.invalidateQueries({
        queryKey: ["units", selectedProjectId],
      });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "CSV import failed."),
  });
  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }
  async function loadCsv(file?: File) {
    if (!file || !selectedProjectId) return;
    const text = await file.text();
    setCsvText(text);
    setCsvPreview(null);
    previewMutation.mutate(text);
  }

  return (
    <AppShell>
      <div className="inventory-page">
        <div className="page-title-row">
          <div>
            <p className="page-eyebrow">Workspace inventory</p>
            <h1 className="page-title">Inventory</h1>
            <p className="page-subtitle">
              Search, filter, and update mapped units in a project.
            </p>
          </div>
          <div className="title-actions">
            {canEditUnit && (
              <label className="sanui-button sanui-button--secondary sanui-button--md">
                ↑ Import CSV
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  disabled={!selectedProjectId || previewMutation.isPending}
                  onChange={(event) => {
                    void loadCsv(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            )}
            {canCreateUnit && (
              <a
                className="sanui-button sanui-button--primary sanui-button--md"
                href={selectedProjectId ? `/studio?project=${encodeURIComponent(selectedProjectId)}` : "/projects/new"}
              >
                ＋ Add unit
              </a>
            )}
            {canExport && selectedProjectId && (
              <a
                className="sanui-button sanui-button--secondary sanui-button--md"
                href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"}/projects/${encodeURIComponent(selectedProjectId)}/units/export`}
                target="_blank"
                rel="noreferrer"
              >
                ↓ Export CSV
              </a>
            )}
          </div>
        </div>
        <section className="surface-card inventory-card">
          <div className="inventory-toolbar">
            <select
              className="sanui-select filter-select"
              aria-label="Choose project"
              value={selectedProjectId}
              onChange={(event) => {
                setProjectId(event.target.value);
                setSelected([]);
                setBulkCategorySelection("");
                setCsvPreview(null);
              }}
            >
              <option value="" disabled>
                Select a project
              </option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <div className="inventory-search">
              <input
                aria-label="Search unit number"
                placeholder="Search by unit number…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              className="sanui-select filter-select"
              aria-label="Filter by status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ALL">All statuses</option>
              {[
                "AVAILABLE",
                "RESERVED",
                "BOOKED",
                "SOLD",
                "BLOCKED",
                "OFF_MARKET",
              ].map((value) => (
                <option value={value} key={value}>
                  {value.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <select
              className="sanui-select filter-select"
              aria-label="Filter by zone category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as "ALL" | UnitCategory)
              }
            >
              <option value="ALL">All categories</option>
              {(Object.keys(UNIT_CATEGORY_PRESENTATION) as UnitCategory[])
                .filter((value) =>
                  units.some((unit) => unit.metadata?.category === value),
                )
                .map((value) => (
                  <option value={value} key={value}>
                    {UNIT_CATEGORY_PRESENTATION[value].label}
                  </option>
                ))}
            </select>
            <select
              className="sanui-select filter-select"
              aria-label="Filter by inventory purpose"
              value={purpose}
              onChange={(event) =>
                setPurpose(event.target.value as "ALL" | UnitPurpose)
              }
            >
              <option value="ALL">All inventory</option>
              <option value="SALE">For sale</option>
              <option value="AMENITY">Amenities · not for sale</option>
            </select>
            <select
              className="sanui-select filter-select"
              aria-label="Filter by unit type"
              value={unitType}
              onChange={(event) => setUnitType(event.target.value)}
            >
              <option value="ALL">All unit types</option>
              {[...new Set(units.map((unit) => unit.unitType))].map((value) => (
                <option value={value} key={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className="result-count">{filtered.length} units</span>
          </div>
          {message && (
            <p className="settings-footnote" role="status">
              {message}
              <button
                type="button"
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                {" "}
                ×
              </button>
            </p>
          )}
          {canEditUnit && csvPreview && (
            <div
              className="bulk-toolbar"
              role="region"
              aria-label="CSV import preview"
            >
              <strong>{csvPreview.totalRows} CSV rows</strong>
              <span>
                {csvPreview.canImport
                  ? "All rows validated."
                  : `${csvPreview.invalidRows.length} row issue(s).`}
              </span>
              {csvPreview.invalidRows.slice(0, 3).map((error) => (
                <small key={`${error.line}-${error.message}`}>
                  Line {error.line}: {error.message}
                </small>
              ))}
              {csvPreview.canImport && (
                <Button
                  size="sm"
                  disabled={commitMutation.isPending}
                  onClick={() => commitMutation.mutate()}
                >
                  {commitMutation.isPending ? "Importing…" : "Apply import"}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCsvPreview(null);
                  setCsvText("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
          {canManageSelection && selected.length > 0 && (
            <div className="bulk-toolbar">
              <strong>{selectedUnits.length} sale units selected</strong>
              {canUpdateStatus && (
                <>
                  <label htmlFor="bulk-status">Change status</label>
                  <select
                    id="bulk-status"
                    className="sanui-select filter-select"
                    defaultValue=""
                    disabled={bulkMutation.isPending}
                    onChange={(event) => {
                      const nextStatus = event.target.value as UnitStatus;
                      if (!nextStatus) return;
                      if (
                        nextStatus === "SOLD" &&
                        !window.confirm(
                          `Mark all ${selectedUnits.length} selected units as sold? Sold units cannot be returned to available inventory.`,
                        )
                      ) {
                        event.currentTarget.value = "";
                        return;
                      }
                      bulkMutation.mutate(nextStatus);
                    }}
                  >
                    <option value="" disabled>
                      Choose status…
                    </option>
                    {validBulkStatuses.map((value) => (
                      <option key={value} value={value}>
                        {value.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {canEditUnit && (
                <>
                  <label htmlFor="bulk-category">Assign category</label>
                  <select
                    id="bulk-category"
                    className="sanui-select filter-select bulk-category-select"
                    value={bulkCategorySelection}
                    disabled={bulkCategoryMutation.isPending || selectedUnits.length !== selected.length}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setBulkCategorySelection(value);
                      bulkCategoryMutation.mutate(
                        value === "UNASSIGNED" ? null : (value as UnitCategory),
                      );
                    }}
                  >
                    <option value="" disabled>
                      Choose category…
                    </option>
                    <option value="UNASSIGNED">Remove category</option>
                    {(Object.keys(UNIT_CATEGORY_PRESENTATION) as UnitCategory[]).map(
                      (value) => (
                        <option key={value} value={value}>
                          {UNIT_CATEGORY_PRESENTATION[value].label}
                        </option>
                      ),
                    )}
                  </select>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected([]);
                  setBulkCategorySelection("");
                }}
              >
                Clear selection
              </Button>
            </div>
          )}
          {projectsQuery.isLoading ||
          (selectedProjectId && unitsQuery.isLoading) ? (
            <div className="empty-state">Loading inventory…</div>
          ) : projectsQuery.isError ? (
            <div className="empty-state" role="alert">
              Couldn’t load projects. Check your API connection and retry.
            </div>
          ) : unitsQuery.isError ? (
            <div className="empty-state" role="alert">
              Couldn’t load this project’s inventory.{" "}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void unitsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : !selectedProjectId ? (
            <div className="empty-state">
              Create a project before adding mapped inventory.
            </div>
          ) : (
            <>
              <div className="table-scroll">
                <table className={`inventory-table inventory-data-table${canManageSelection ? " inventory-data-table--selectable" : ""}`}>
                  <thead>
                    <tr>
                      {canManageSelection && <th className="checkbox-cell">
                        <input
                          aria-label="Select all visible units"
                          type="checkbox"
                          disabled={selectableFiltered.length === 0}
                          checked={
                            selectableFiltered.length > 0 &&
                            selectableFiltered.every((unit) => selected.includes(unit.id))
                          }
                          onChange={(event) =>
                            setSelected(
                              event.target.checked
                                ? selectableFiltered.map((unit) => unit.id)
                                : [],
                            )
                          }
                        />
                      </th>}
                      <th>Unit</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Purpose</th>
                      <th>Area</th>
                      <th>Price</th>
                      <th>Status</th>
                      <th>Last updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((unit) => (
                      <tr key={unit.id}>
                        {canManageSelection && <td>
                          <input
                            aria-label={`Select ${unit.unitNumber}`}
                            type="checkbox"
                            disabled={unit.purpose === "AMENITY"}
                            checked={selected.includes(unit.id)}
                            onChange={() => toggleOne(unit.id)}
                          />
                        </td>}
                        <td>
                          <strong>{unit.unitNumber}</strong>
                        </td>
                        <td>
                          {getUnitTypeLabel(unit.unitType, unit.metadata)}
                        </td>
                        <td>
                          {unit.metadata?.category ? (
                            <Badge
                              style={{
                                backgroundColor:
                                  UNIT_CATEGORY_PRESENTATION[
                                    unit.metadata.category
                                  ].fill,
                                color:
                                  UNIT_CATEGORY_PRESENTATION[
                                    unit.metadata.category
                                  ].text,
                              }}
                            >
                              {UNIT_CATEGORY_PRESENTATION[
                                unit.metadata.category
                              ].label}
                            </Badge>
                          ) : (
                            <span className="inventory-category-empty">Unassigned</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            style={
                              unit.purpose === "AMENITY"
                                ? {
                                    backgroundColor: UNIT_PURPOSE_PRESENTATION.AMENITY.fill,
                                    color: UNIT_PURPOSE_PRESENTATION.AMENITY.text,
                                  }
                                : undefined
                            }
                          >
                            {unit.purpose === "AMENITY"
                              ? "Amenity · not for sale"
                              : UNIT_PURPOSE_PRESENTATION.SALE.label}
                          </Badge>
                        </td>
                        <td>
                          {unit.purpose === "AMENITY"
                            ? "—"
                            : formatArea(unit.area, unit.areaUnit)}
                        </td>
                        <td>
                          {unit.purpose === "AMENITY"
                            ? "Not for sale"
                            : unit.price > 0
                              ? formatCurrency(unit.price, unit.currency)
                              : "Not priced"}
                        </td>
                        <td>
                          {unit.purpose === "AMENITY" ? (
                            <span className="inventory-not-for-sale">
                              No sale status
                            </span>
                          ) : (
                            <div className="inventory-status-cell">
                              <StatusBadge status={unit.status} />
                              <select
                                className="sanui-select filter-select status-select"
                                aria-label={`Change ${unit.unitNumber} status`}
                                value={unit.status}
                                hidden={!canUpdateStatus}
                                disabled={!canUpdateStatus || statusMutation.isPending}
                                onChange={(event) =>
                                  changeUnitStatus(
                                    unit.id,
                                    unit.unitNumber,
                                    event.target.value as UnitStatus,
                                  )
                                }
                              >
                                <option value={unit.status}>
                                  {unit.status.replaceAll("_", " ")}
                                </option>
                                {[...allowedUnitStatuses(unit.status)]
                                  .filter((value) => value !== unit.status)
                                  .map((value) => (
                                    <option key={value} value={value}>
                                      {value.replaceAll("_", " ")}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td>{new Date(unit.updatedAt).toLocaleDateString()}</td>
                        <td>
                          <div className="inventory-row-actions">
                            {canCreateBooking && unit.purpose === "SALE" && unit.status === "AVAILABLE" && (
                              <a
                                className="text-link"
                                href={`/bookings?project=${encodeURIComponent(selectedProjectId)}&unit=${encodeURIComponent(unit.id)}`}
                              >
                                Book for customer
                              </a>
                            )}
                            {canCreateBooking && unit.purpose === "SALE" && unit.status === "RESERVED" && (
                              <a
                                className="text-link"
                                href={`/bookings?project=${encodeURIComponent(selectedProjectId)}`}
                              >
                                Confirm booking
                              </a>
                            )}
                            {canUpdateStatus && unit.purpose === "SALE" && allowedUnitStatuses(unit.status).has("SOLD") && (
                              <button
                                className="text-button inventory-sold-action"
                                type="button"
                                disabled={statusMutation.isPending}
                                onClick={() =>
                                  changeUnitStatus(
                                    unit.id,
                                    unit.unitNumber,
                                    "SOLD",
                                  )
                                }
                              >
                                Mark sold
                              </button>
                            )}
                            {canViewMap && <a
                              className="text-link"
                              href={`/studio?project=${encodeURIComponent(selectedProjectId)}&unit=${encodeURIComponent(unit.id)}`}
                            >
                              View map →
                            </a>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="empty-state">
                    {units.length
                      ? "No inventory matches the selected filters."
                      : "No units in this project yet. Add units in Map Studio."}
                  </div>
                )}
              </div>
              <div className="list-footer">
                Showing {filtered.length} of {units.length} units in{" "}
                {
                  projects.find((project) => project.id === selectedProjectId)
                    ?.name
                }
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
