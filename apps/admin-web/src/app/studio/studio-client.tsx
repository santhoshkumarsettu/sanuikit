"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { vstudioApi } from "@vstudio/api-client";
import { ApiError } from "@vstudio/api-client";
import { Modal, Button } from "sanui";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { unitFieldsSchema } from "@vstudio/validation";
import type { DrawingTool, MapShape } from "@vstudio/map-engine";
import { InteractiveMap } from "@vstudio/map-engine";
import {
  allowedUnitStatuses,
  UNIT_CATEGORY_PRESENTATION,
  UNIT_PURPOSE_PRESENTATION,
  UNIT_STATUS_PRESENTATION,
  type InventoryUnit,
  type MapStudioUnit,
  type UnitCategory,
  type UnitFacing,
  type UnitGeometry,
  type UnitStatus,
} from "@vstudio/types";
import { formatArea, formatCurrency, getUnitTypeLabel } from "@vstudio/utils";
import { useMapStudio } from "../../store/map-studio";
import { usePermissions } from "../../hooks/use-permissions";

const toolItems: { tool: DrawingTool; label: string; icon: string }[] = [
  { tool: "select", label: "Select", icon: "↖" },
  { tool: "pan", label: "Pan", icon: "✥" },
  { tool: "rectangle", label: "Rectangle", icon: "▱" },
  { tool: "polygon", label: "Polygon", icon: "⬠" },
  { tool: "edit", label: "Edit vertices", icon: "⌖" },
];
type UnitFormValues = z.input<typeof unitFieldsSchema>;
type ValidUnitFormValues = z.output<typeof unitFieldsSchema>;
function normalizeFacing(value?: string): UnitFacing | "" {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return "";
  const cardinal = ["EAST", "NORTH", "WEST", "SOUTH"] as const;
  const match = cardinal.find((direction) => normalized.startsWith(direction));
  return match ?? "";
}

const defaultUnitFormValues: UnitFormValues = {
  unitNumber: "",
  unitType: "PLOT",
  purpose: "SALE",
  area: 1500,
  areaUnit: "SQFT",
  price: 3_500_000,
  currency: "INR",
  showDetailsOnPublicMap: false,
  details: {
    customTypeName: "",
    description: "",
    block: "",
    floor: "",
    facing: "",
    category: "",
    parkingType: "CAR",
    parkingCovered: false,
    roadWidthUnit: "FT",
    features: [],
    customAttributes: [],
  },
};

function unitFormValues(unit?: InventoryUnit): UnitFormValues {
  const publicDetails = Object.keys(unit?.publicMetadata ?? {}).some(
    (key) => !["customTypeName", "category", "facing"].includes(key),
  );
  return {
    ...defaultUnitFormValues,
    unitNumber: unit?.unitNumber ?? defaultUnitFormValues.unitNumber,
    unitType:
      unit?.purpose === "AMENITY"
        ? "CUSTOM"
        : unit?.unitType ?? defaultUnitFormValues.unitType,
    purpose: unit?.purpose ?? defaultUnitFormValues.purpose,
    area: unit?.purpose === "AMENITY" ? 0 : unit?.area ?? defaultUnitFormValues.area,
    areaUnit: unit?.areaUnit ?? defaultUnitFormValues.areaUnit,
    price: unit?.purpose === "AMENITY" ? 0 : unit?.price ?? defaultUnitFormValues.price,
    currency: unit?.currency ?? defaultUnitFormValues.currency,
    showDetailsOnPublicMap: publicDetails,
    details: {
      ...defaultUnitFormValues.details,
      ...unit?.metadata,
      facing: normalizeFacing(unit?.metadata?.facing),
      category: unit?.metadata?.category ?? "",
      features: unit?.metadata?.features ?? [],
      customAttributes: unit?.metadata?.customAttributes ?? [],
    },
  };
}

const optionalNumber = (value: unknown) =>
  value === "" || value === null || value === undefined
    ? undefined
    : Number(value);
function geometryDescription(geometry?: UnitGeometry) {
  if (!geometry) return "Shape unavailable";
  if (geometry.kind === "RECTANGLE")
    return `Rectangle · ${Math.round(geometry.width)} × ${Math.round(geometry.height)} px`;
  const xs = geometry.points.map((point) => point.x);
  const ys = geometry.points.map((point) => point.y);
  const width = Math.round(Math.max(...xs) - Math.min(...xs));
  const height = Math.round(Math.max(...ys) - Math.min(...ys));
  return `Polygon · ${geometry.points.length} points · ${width} × ${height} px bounds`;
}

export function MapStudio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const projectId = searchParams.get("project") ?? undefined;
  const requestedLayoutId = searchParams.get("layout") ?? undefined;
  const requestedUnitId = searchParams.get("unit") ?? undefined;
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | undefined>(
    requestedLayoutId,
  );
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => vstudioApi.projects(),
    retry: false,
  });
  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => vstudioApi.project(projectId!),
    enabled: Boolean(projectId),
    retry: false,
  });
  const unitsQuery = useQuery({
    queryKey: ["map-units", projectId],
    queryFn: () => vstudioApi.mapUnits(projectId!),
    enabled: Boolean(projectId),
    retry: false,
  });
  const inventoryDetailsQuery = useQuery({
    queryKey: ["units", projectId],
    queryFn: () => vstudioApi.units(projectId!),
    enabled: Boolean(projectId && can("VIEW_INVENTORY")),
    retry: false,
  });
  const activeProject =
    projectQuery.data?.id === projectId ? projectQuery.data : undefined;
  const activeLayout =
    activeProject?.layouts.find((layout) => layout.id === selectedLayoutId) ??
    activeProject?.layouts[0];
  const activeLayoutUnitCount = activeLayout
    ? (unitsQuery.data?.filter((unit) => unit.layoutId === activeLayout.id)
        .length ?? 0)
    : 0;
  const assetQuery = useQuery({
    queryKey: ["layout-asset", activeLayout?.id],
    queryFn: () => vstudioApi.layoutAssetUrl(activeLayout!.id),
    enabled: Boolean(activeLayout?.id),
    retry: false,
  });
  const isConnected = Boolean(projectId && activeProject);
  const canReadMap = Boolean(
    isConnected && activeLayout && !unitsQuery.isLoading && !unitsQuery.isError,
  );
  const canEditMap = canReadMap && can("EDIT_MAP");
  const canCreateUnit = canReadMap && can("CREATE_UNIT");
  const canViewInventory = can("VIEW_INVENTORY");
  const canEditUnit = can("EDIT_UNIT");
  const canDeleteUnit = can("DELETE_UNIT");
  const canUpdateStatus = can("UPDATE_STATUS");
  const canCreateBooking = can("CREATE_BOOKING");
  const canUploadLayout = can("UPLOAD_LAYOUT");
  const hydrate = useMapStudio((state) => state.hydrate);
  useEffect(() => {
    hydrate(isConnected && unitsQuery.data ? unitsQuery.data : []);
  }, [isConnected, unitsQuery.data, hydrate]);
  const storeUnits = useMapStudio((state) => state.units);
  const units =
    isConnected && activeLayout && unitsQuery.data
      ? storeUnits.filter(
          (unit) =>
            unit.projectId === projectId && unit.layoutId === activeLayout.id,
        )
      : [];
  const selectedId = useMapStudio((state) => state.selectedId);
  const tool = useMapStudio((state) => state.tool);
  const undoStack = useMapStudio((state) => state.undoStack);
  const redoStack = useMapStudio((state) => state.redoStack);
  const setTool = useMapStudio((state) => state.setTool);
  const select = useMapStudio((state) => state.select);
  const updateGeometry = useMapStudio((state) => state.updateGeometry);
  const beginGeometryEdit = useMapStudio((state) => state.beginGeometryEdit);
  const commitGeometryEdit = useMapStudio((state) => state.commitGeometryEdit);
  const undo = useMapStudio((state) => state.undo);
  const redo = useMapStudio((state) => state.redo);
  const selected = units.find((unit) => unit.id === selectedId);
  const selectedInventoryDetails = inventoryDetailsQuery.data?.find(
    (unit) => unit.id === selectedId,
  );
  useEffect(() => {
    if (requestedUnitId && units.some((unit) => unit.id === requestedUnitId))
      select(requestedUnitId);
  }, [requestedUnitId, units, select]);
  const [newGeometry, setNewGeometry] = useState<UnitGeometry>();
  const [editingUnitId, setEditingUnitId] = useState<string>();
  const [editingUnit, setEditingUnit] = useState<InventoryUnit>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusPreviewFilter, setStatusPreviewFilter] = useState<
    "ALL" | "AMENITIES" | UnitStatus
  >("ALL");
  const [categoryPreviewFilter, setCategoryPreviewFilter] = useState<
    "ALL" | UnitCategory
  >("ALL");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [hasDraft, setHasDraft] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const [showFullscreenHint, setShowFullscreenHint] = useState(false);
  const [replacementFile, setReplacementFile] = useState<File>();
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [deleteLayoutDialogOpen, setDeleteLayoutDialogOpen] = useState(false);
  const [layoutActionPending, setLayoutActionPending] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const mapStudioShellRef = useRef<HTMLDivElement>(null);
  const fullscreenMessageTone =
    /(?:saved|updated|removed|uploaded|created|published|confirmed|cancelled)/i.test(
      message,
    )
      ? "is-success"
      : "is-error";
  useEffect(() => {
    let hintTimer: number | undefined;
    const updateFullscreenState = () => {
      const fullscreen =
        document.fullscreenElement === mapStudioShellRef.current ||
        isCssFullscreen;
      setIsFullscreen(fullscreen);
      if (hintTimer !== undefined) window.clearTimeout(hintTimer);
      setShowFullscreenHint(fullscreen);
      if (fullscreen)
        hintTimer = window.setTimeout(() => setShowFullscreenHint(false), 3500);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCssFullscreen) setIsCssFullscreen(false);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    window.addEventListener("keydown", handleKeyDown);
    updateFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
      window.removeEventListener("keydown", handleKeyDown);
      if (hintTimer !== undefined) window.clearTimeout(hintTimer);
    };
  }, [isCssFullscreen]);
  useEffect(() => {
    if (!isCssFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isCssFullscreen]);
  const form = useForm<UnitFormValues, undefined, ValidUnitFormValues>({
    resolver: zodResolver(unitFieldsSchema),
    defaultValues: defaultUnitFormValues,
  });
  const customAttributes = useFieldArray({
    control: form.control,
    name: "details.customAttributes",
  });
  const watchedUnitType = form.watch("unitType");
  const watchedPurpose = form.watch("purpose");
  const watchedCustomTypeName = form.watch("details.customTypeName");
  const watchedFeatures = form.watch("details.features") ?? [];
  const isPreviewFiltered =
    statusPreviewFilter !== "ALL" || categoryPreviewFilter !== "ALL";
  const allStatusOptions: UnitStatus[] = [
    "AVAILABLE",
    "RESERVED",
    "BOOKED",
    "SOLD",
    "BLOCKED",
    "OFF_MARKET",
  ];
  const statusPreviewOptions = allStatusOptions.filter((status) =>
    units.some((unit) => unit.purpose === "SALE" && unit.status === status),
  );
  const allCategoryOptions: UnitCategory[] = [
    "GOLD",
    "PLATINUM",
    "SILVER",
    "REGULAR",
  ];
  const categoryPreviewOptions = allCategoryOptions.filter((category) =>
    units.some((unit) => unit.category === category),
  );
  const visibleUnits = units.filter((unit) => {
    const matchesStatus =
      statusPreviewFilter === "ALL" ||
      (statusPreviewFilter === "AMENITIES"
        ? unit.purpose === "AMENITY"
        : unit.purpose === "SALE" && unit.status === statusPreviewFilter);
    const matchesCategory =
      categoryPreviewFilter === "ALL" ||
      (unit.purpose === "SALE" && unit.category === categoryPreviewFilter);
    return matchesStatus && matchesCategory;
  });
  function preparePreviewFilterChange() {
    if (hasDraft) {
      setMessage("Finish or cancel the current drawing before filtering the preview.");
      return false;
    }
    if (tool !== "select") setTool("select");
    select(undefined);
    return true;
  }
  function toggleStatusPreviewFilter(next: "ALL" | "AMENITIES" | UnitStatus) {
    if (!preparePreviewFilterChange()) return;
    setStatusPreviewFilter(next);
    if (next === "ALL" || next === "AMENITIES")
      setCategoryPreviewFilter("ALL");
  }
  function toggleCategoryPreviewFilter(next: UnitCategory) {
    if (!preparePreviewFilterChange()) return;
    setCategoryPreviewFilter((current) =>
      current === next ? "ALL" : next,
    );
    if (statusPreviewFilter === "AMENITIES")
      setStatusPreviewFilter("ALL");
  }
  const shapes: MapShape[] = useMemo(
    () =>
      visibleUnits.map((unit) => ({
        id: unit.id,
        geometry: unit.geometry,
        label: unit.unitNumber,
        purpose: unit.purpose,
        fill:
          unit.purpose === "AMENITY"
            ? UNIT_PURPOSE_PRESENTATION.AMENITY.fill
            : UNIT_STATUS_PRESENTATION[unit.status].fill,
        stroke:
          unit.purpose === "AMENITY"
            ? UNIT_PURPOSE_PRESENTATION.AMENITY.stroke
            : undefined,
      })),
    [visibleUnits],
  );
  const toolGuidance = isPreviewFiltered
    ? "Preview filter active: clear filters to draw or edit outlines."
    :
    tool === "select"
      ? "Select: click a unit to view its details."
      : tool === "pan"
        ? "Pan: drag the layout to move it."
        : tool === "rectangle"
          ? "Rectangle: click and drag on the layout to draw a unit."
          : tool === "polygon"
            ? "Polygon: click to add corners, then choose Finish polygon or double-click."
            : selected
              ? "Edit vertices: drag a handle to reshape; double-click an edge to add a point."
              : "Edit vertices: click an existing unit to show its handles.";

  async function toggleMapFullscreen() {
    const mapStudioShell = mapStudioShellRef.current;
    if (!mapStudioShell) return;
    if (isCssFullscreen) {
      setIsCssFullscreen(false);
      return;
    }
    try {
      if (document.fullscreenElement === mapStudioShell)
        await document.exitFullscreen();
      else if (
        document.fullscreenEnabled &&
        typeof mapStudioShell.requestFullscreen === "function"
      ) {
        await mapStudioShell.requestFullscreen();
        // Some embedded browsers resolve the request without entering native fullscreen.
        if (document.fullscreenElement !== mapStudioShell)
          setIsCssFullscreen(true);
      } else {
        setIsCssFullscreen(true);
      }
    } catch {
      setIsCssFullscreen(true);
    }
  }

  function onCreateGeometry(geometry: UnitGeometry) {
    if (isPreviewFiltered) {
      setMessage("Clear preview filters before adding or editing units.");
      return;
    }
    if (!canCreateUnit) {
      setMessage("Your role does not allow creating units on this layout.");
      return;
    }
    setEditingUnitId(undefined);
    setEditingUnit(undefined);
    setNewGeometry(geometry);
    form.reset(unitFormValues());
    setDialogOpen(true);
  }
  async function openEditDetails(unit: MapStudioUnit) {
    if (!canEditUnit) return;
    try {
      const details = await vstudioApi.unitForEditing(unit.id);
      setEditingUnit(details);
      setEditingUnitId(details.id);
      setNewGeometry(undefined);
      form.reset(unitFormValues(details));
      setDialogOpen(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unit details could not be loaded for editing.",
      );
    }
  }
  async function onSubmit(values: ValidUnitFormValues) {
    if (editingUnitId ? !canEditUnit : !canCreateUnit) {
      setMessage("Your role does not allow this inventory change.");
      return;
    }
    if (!isConnected || !projectId) {
      setMessage("Choose a project before adding inventory units.");
      return;
    }
    if (!activeLayout) {
      setMessage("Upload a layout before adding inventory units.");
      return;
    }
    try {
      const inventoryValues =
        values.purpose === "AMENITY"
          ? { ...values, area: 0, price: 0 }
          : values;
      if (editingUnitId) {
        const unit = editingUnit;
        if (!unit)
          throw new Error(
            "This unit is no longer on the selected layout. Reload and try again.",
          );
        const updated = await vstudioApi.updateUnitDetails(editingUnitId, {
          ...inventoryValues,
          expectedVersion: unit.version ?? 1,
        });
        await Promise.all([
          unitsQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: ["units", projectId] }),
        ]);
        select(updated.id);
        setDialogOpen(false);
        setEditingUnitId(undefined);
        setEditingUnit(undefined);
        setMessage(`Unit ${updated.unitNumber} details updated.`);
      } else {
        if (!newGeometry) return;
        const created = await vstudioApi.createUnit(projectId, {
          ...inventoryValues,
          layoutId: activeLayout.id,
          geometry: newGeometry,
        });
        await Promise.all([
          unitsQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: ["units", projectId] }),
        ]);
        select(created.id);
        setDialogOpen(false);
        setTool("select");
        setMessage(
          `Unit ${inventoryValues.unitNumber} saved to ${activeProject?.name ?? "the project"}.`,
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The unit could not be saved.",
      );
    }
  }
  async function uploadBackground(file?: File, replaceLayoutId?: string) {
    if (!file) return;
    if (!canUploadLayout) {
      setMessage("Your role does not allow layout changes.");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type) || file.size > 20 * 1024 * 1024) {
      setMessage("Choose a PNG, JPG, or WebP plan under 20 MB.");
      return;
    }
    if (!isConnected) {
      setMessage(
        "Choose a project from Projects before uploading a persistent layout.",
      );
      return;
    }
    if (replaceLayoutId) setLayoutActionPending(true);
    setMessage("Uploading and validating layout…");
    try {
      const bitmap = await createImageBitmap(file);
      if (bitmap.width < 1 || bitmap.height < 1) {
        bitmap.close();
        throw new Error("The selected image has invalid dimensions.");
      }
      let intent;
      try {
        intent = await vstudioApi.createLayoutUploadIntent(projectId!, {
          name: replaceLayoutId
            ? (activeLayout?.name ?? "Site layout")
            : file.name.replace(/\.[^.]+$/, "") || "Site layout",
          layoutId: replaceLayoutId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          width: bitmap.width,
          height: bitmap.height,
        });
      } finally {
        bitmap.close();
      }
      const upload = await fetch(intent.uploadUrl, {
        method: "PUT",
        headers: intent.uploadHeaders,
        body: file,
      });
      if (!upload.ok)
        throw new Error(
          "Object storage rejected the upload. Check the bucket CORS and signed URL settings.",
        );
      const confirmed = await vstudioApi.confirmLayoutUpload(intent.layoutId);
      await queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      await queryClient.invalidateQueries({
        queryKey: ["layout-asset", intent.layoutId],
      });
      if (replaceLayoutId) await unitsQuery.refetch();
      const refreshedProject = await projectQuery.refetch();
      if (
        refreshedProject.data?.layouts.some(
          (layout) => layout.id === intent.layoutId,
        )
      )
        setSelectedLayoutId(intent.layoutId);
      setMessage(
        replaceLayoutId
          ? `Layout image replaced${confirmed.scaledUnitCount ? `; ${confirmed.scaledUnitCount} mapped unit outlines were scaled to fit the new dimensions` : ""}. Review the map before continuing.`
          : "Layout uploaded and validated. You can now map units onto it.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The layout could not be uploaded.",
      );
    } finally {
      if (replaceLayoutId) setLayoutActionPending(false);
    }
  }
  function chooseReplacement(file?: File) {
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 20 * 1024 * 1024
    ) {
      setMessage("Choose a PNG, JPG, or WebP plan under 20 MB.");
      return;
    }
    setReplacementFile(file);
    setReplaceDialogOpen(true);
  }
  async function deleteActiveLayout() {
    if (!canUploadLayout) return;
    if (!activeLayout || activeLayoutUnitCount || layoutActionPending) return;
    setLayoutActionPending(true);
    try {
      await vstudioApi.deleteLayout(activeLayout.id);
      setDeleteLayoutDialogOpen(false);
      setSelectedLayoutId(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["project", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["map-units", projectId] }),
      ]);
      await projectQuery.refetch();
      await unitsQuery.refetch();
      setMessage(`Layout “${activeLayout.name}” deleted.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The layout could not be deleted.",
      );
    } finally {
      setLayoutActionPending(false);
    }
  }
  async function saveChanges() {
    if (!canEditMap) {
      setMessage("Your role does not allow map geometry changes.");
      return;
    }
    if (!isConnected || !activeLayout || !unitsQuery.data) {
      setMessage(
        "Choose a project and upload a layout before saving map changes.",
      );
      return;
    }
    const original = new Map(
      unitsQuery.data.map((unit) => [unit.id, JSON.stringify(unit.geometry)]),
    );
    const changed = units.filter(
      (unit) =>
        original.has(unit.id) &&
        original.get(unit.id) !== JSON.stringify(unit.geometry),
    );
    try {
      await Promise.all(
        changed.map((unit) =>
          vstudioApi.updateUnitGeometry(
            unit.id,
            unit.geometry,
            unit.version ?? 1,
          ),
        ),
      );
      await unitsQuery.refetch();
      setMessage(
        changed.length
          ? `Saved geometry for ${changed.length} unit${changed.length === 1 ? "" : "s"}.`
          : "All map changes are saved.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Map changes could not be saved.",
      );
    }
  }
  async function changeStatus(id: string, status: UnitStatus) {
    if (!canUpdateStatus) {
      setMessage("Your role does not allow inventory status changes.");
      return;
    }
    const unit = units.find((item) => item.id === id);
    if (
      status === "SOLD" &&
      unit &&
      !window.confirm(
        `Mark ${unit.unitNumber} as sold? Sold units cannot be returned to available inventory.`,
      )
    )
      return;
    if (!isConnected) {
      setMessage("Choose a project before changing unit availability.");
      return;
    }
    try {
      await vstudioApi.updateUnitStatus(id, { status });
      await unitsQuery.refetch();
      setMessage("Unit availability updated.");
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : "The unit status could not be updated.",
      );
    }
  }
  async function deleteSelected() {
    if (!selected || !canDeleteUnit) return;
    if (!isConnected) {
      setMessage("Choose a project before removing inventory units.");
      return;
    }
    setIsDeleting(true);
    try {
      await vstudioApi.deleteUnit(selected.id);
      await unitsQuery.refetch();
      select(undefined);
      setDeleteDialogOpen(false);
      setMessage("Unit removed from inventory.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The unit could not be removed.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="map-studio-page">
      <div className="page-title-row studio-page-heading">
        <div>
          <p className="page-eyebrow">
            PROJECT · {activeProject?.name.toUpperCase() ?? "SELECT A PROJECT"}
            {activeLayout
              ? ` / LAYOUT · ${activeLayout.name.toUpperCase()}`
              : ""}
          </p>
          <h1 className="page-title">Map Studio</h1>
          <p className="page-subtitle">
            {activeLayout
              ? `Draw and manage units against the layout’s ${activeLayout.width} × ${activeLayout.height} coordinate space.`
              : "Select a project and upload its layout to start mapping inventory."}
          </p>
        </div>
      </div>
      <section
        className="studio-layout-bar"
        aria-label="Project and layout controls"
      >
        <div className="studio-layout-fields">
          <label className="studio-layout-field">
            <span>Project</span>
            <select
              className="sanui-select filter-select"
              aria-label="Select project for Map Studio"
              value={projectId ?? ""}
              onChange={(event) => {
                setSelectedLayoutId(undefined);
                setStatusPreviewFilter("ALL");
                setCategoryPreviewFilter("ALL");
                router.push(
                  event.target.value
                    ? `/studio?project=${encodeURIComponent(event.target.value)}`
                    : "/studio",
                );
              }}
            >
              <option value="">
                {projectsQuery.isLoading
                  ? "Loading projects…"
                  : "Select a project"}
              </option>
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          {activeProject && activeProject.layouts.length > 0 && (
            <label className="studio-layout-field">
              <span>
                Layout <small>{activeProject.layouts.length} total</small>
              </span>
              <select
                className="sanui-select filter-select"
                aria-label="Select layout for Map Studio"
                value={activeLayout?.id ?? ""}
                onChange={(event) => {
                  setSelectedLayoutId(event.target.value);
                  setStatusPreviewFilter("ALL");
                  setCategoryPreviewFilter("ALL");
                  select(undefined);
                }}
              >
                {activeProject.layouts.map((layout) => {
                  const count =
                    unitsQuery.data?.filter(
                      (unit) => unit.layoutId === layout.id,
                    ).length ?? 0;
                  return (
                    <option key={layout.id} value={layout.id}>
                      {layout.name} · {count} unit{count === 1 ? "" : "s"}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
        </div>
        <div className="studio-layout-actions">
          {activeProject && activeLayout && (
            <>
              <input
                ref={replaceFileInputRef}
                className="sanui-visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => {
                  chooseReplacement(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              {canUploadLayout && (
                <>
                  <Button
                    variant="secondary"
                    disabled={layoutActionPending}
                    onClick={() => replaceFileInputRef.current?.click()}
                  >
                    Replace plan
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={layoutActionPending || activeLayoutUnitCount > 0}
                    title={
                      activeLayoutUnitCount
                        ? "Remove its mapped units before deleting this layout"
                        : "Delete the selected layout"
                    }
                    onClick={() => setDeleteLayoutDialogOpen(true)}
                  >
                    Delete layout
                  </Button>
                </>
              )}
            </>
          )}
          {can("CREATE_PROJECT") && projectsQuery.data?.length === 0 && !projectsQuery.isLoading && (
            <Link
              className="sanui-button sanui-button--secondary sanui-button--md studio-create-project"
              href="/projects/new?from=studio"
            >
              ＋ Create project
            </Link>
          )}
          {canUploadLayout && <label
            className={`studio-add-layout${isConnected ? "" : " is-disabled"}`}
            aria-disabled={!isConnected}
            title={
              isConnected
                ? "Add a separate layout to this project"
                : "Select a project before uploading"
            }
          >
            ＋ Add layout
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={!isConnected || layoutActionPending}
              onChange={(event) => {
                void uploadBackground(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
              hidden
            />
          </label>}
        </div>
      </section>
      {!projectId && !projectsQuery.isError && (
        <div className="studio-message" role="status">
          Choose a project here to upload its layout and save inventory to it.
          {projectsQuery.data?.length === 0 && (
            <>
              {" "}
              <Link href="/projects/new?from=studio">
                Create your first project
              </Link>
            </>
          )}
        </div>
      )}
      {message && (
        <div className="studio-message" role="status">
          {message}
          <button
            type="button"
            onClick={() => setMessage("")}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}
      <div
        ref={mapStudioShellRef}
        className={`map-studio-shell${isFullscreen ? " map-studio-shell--fullscreen" : ""}${!isConnected || !activeLayout ? " map-studio-shell--empty" : ""}`}
      >
        <section className="map-studio-main" aria-label="Map canvas">
          {!projectId && !projectsQuery.isError && (
            <div className="studio-start-state">
              <span className="studio-start-state__icon" aria-hidden="true">
                ⌖
              </span>
              <h2>Select a project to begin</h2>
              <p>
                Choose a project above to upload its layout and manage its
                mapped inventory.
              </p>
            </div>
          )}
          {!projectId && projectsQuery.isError && (
            <div className="studio-start-state" role="alert">
              <h2>Projects could not be loaded</h2>
              <p>Check your connection, then try again.</p>
              <Button
                variant="secondary"
                onClick={() => void projectsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {projectId && projectQuery.isLoading && (
            <div className="studio-start-state" role="status">
              <h2>Loading project…</h2>
              <p>Preparing the selected project.</p>
            </div>
          )}
          {projectId && projectQuery.isError && (
            <div className="studio-start-state" role="alert">
              <h2>Project could not be loaded</h2>
              <p>It may have been removed or you may not have access.</p>
              <Button
                variant="secondary"
                onClick={() => void projectQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {projectId && activeProject && unitsQuery.isError && (
            <div className="studio-start-state" role="alert">
              <h2>Map units could not be loaded</h2>
              <p>Retry to load this project’s map shapes. Map access is required.</p>
              <Button
                variant="secondary"
                onClick={() => void unitsQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {projectId && activeProject && activeLayout && assetQuery.isError && (
            <div className="studio-start-state" role="alert">
              <h2>Layout image could not be loaded</h2>
              <p>Retry to load the background plan.</p>
              <Button
                variant="secondary"
                onClick={() => void assetQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {projectId &&
            projectQuery.isSuccess &&
            activeProject &&
            !activeLayout && (
              <div className="studio-start-state">
                <span className="studio-start-state__icon" aria-hidden="true">
                  ▧
                </span>
                <h2>Upload a layout to get started</h2>
                <p>
                  This project does not have a layout yet. Upload a PNG, JPG, or
                  WebP plan to start mapping units.
                </p>
              </div>
            )}
          {projectId &&
            activeProject &&
            activeLayout &&
            unitsQuery.isLoading && (
              <div className="studio-start-state" role="status">
                <h2>Loading map units…</h2>
                <p>Getting this project’s mapped shapes.</p>
              </div>
            )}
          {projectId &&
            activeProject &&
            activeLayout &&
            assetQuery.isLoading && (
              <div className="studio-start-state" role="status">
                <h2>Loading layout…</h2>
                <p>Preparing the plan for editing.</p>
              </div>
            )}
          {projectId &&
            activeProject &&
            activeLayout &&
            !unitsQuery.isError &&
            !assetQuery.isError &&
            !unitsQuery.isLoading &&
            !assetQuery.isLoading && (
              <>
                <div
                  className="map-studio-toolbar"
                  aria-label="Map drawing tools"
                >
                  <div className="studio-toolbar-main">
                    <div className="studio-tool-groups">
                      <div
                        className="studio-tool-group"
                        role="group"
                        aria-label="Drawing tools"
                      >
                        {toolItems.filter((item) =>
                          item.tool === "select" || item.tool === "pan"
                            ? canReadMap
                            : item.tool === "edit"
                              ? canEditMap
                              : canCreateUnit,
                        ).map((item) => (
                          <button
                            key={item.tool}
                            type="button"
                            className={`tool-button${tool === item.tool ? " is-active" : ""}`}
                            aria-pressed={tool === item.tool}
                            disabled={
                              item.tool === "select" || item.tool === "pan"
                                ? !canReadMap
                                : item.tool === "edit"
                                  ? !canEditMap || isPreviewFiltered
                                  : !canCreateUnit || isPreviewFiltered
                            }
                            onClick={() => setTool(item.tool)}
                          >
                            <span aria-hidden="true">{item.icon}</span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                      <span className="tool-divider" />
                      <div
                        className="studio-tool-group"
                        role="group"
                        aria-label="History"
                      >
                        <button
                          className="tool-button"
                          type="button"
                          disabled={!canEditMap || isPreviewFiltered || !undoStack.length}
                          onClick={undo}
                          aria-label="Undo"
                        >
                          ↶ Undo
                        </button>
                        <button
                          className="tool-button"
                          type="button"
                          disabled={!canEditMap || isPreviewFiltered || !redoStack.length}
                          onClick={redo}
                          aria-label="Redo"
                        >
                          ↷ Redo
                        </button>
                      </div>
                      <span className="tool-divider" />
                      <button
                        className="tool-button studio-delete-tool"
                        type="button"
                        hidden={!canDeleteUnit && !(hasDraft && canCreateUnit)}
                        disabled={
                          hasDraft
                            ? !canCreateUnit
                            : !canDeleteUnit || !selected || isPreviewFiltered
                        }
                        onClick={() => {
                          if (hasDraft) {
                            setTool("select");
                            setHasDraft(false);
                          } else setDeleteDialogOpen(true);
                        }}
                      >
                        {hasDraft ? "× Cancel drawing" : "⌫ Delete unit"}
                      </button>
                    </div>
                    <Button
                      className="studio-save-button"
                      hidden={!canEditMap}
                      disabled={!canEditMap}
                      onClick={() => void saveChanges()}
                    >
                      Save changes
                    </Button>
                  </div>
                  <div className="studio-toolbar-footer">
                    <span className="studio-tool-guidance" role="status">
                      {toolGuidance}
                    </span>
                  </div>
                </div>
                <div className="map-canvas-wrap">
                  <InteractiveMap
                    width={activeLayout.width}
                    height={activeLayout.height}
                    backgroundUrl={assetQuery.data?.url}
                    backgroundOpacity={0.9}
                    shapes={shapes}
                    selectedId={selectedId}
                    tool={tool}
                    onSelect={select}
                    onCreate={onCreateGeometry}
                    onGeometryChange={(id, geometry) => {
                      if (isPreviewFiltered) {
                        setMessage("Clear preview filters before editing unit outlines.");
                        return;
                      }
                      updateGeometry(id, geometry);
                    }}
                    onGeometryEditStart={() => {
                      if (!isPreviewFiltered) beginGeometryEdit();
                    }}
                    onGeometryEditEnd={commitGeometryEdit}
                    onUndo={undo}
                    onRedo={redo}
                    onDraftChange={setHasDraft}
                    isFullscreen={isFullscreen}
                    onFullscreenToggle={() => void toggleMapFullscreen()}
                    ariaLabel={`${activeLayout.name}, interactive unit layout`}
                  />
                  <div className="map-meta">
                    <span>
                      {(isPreviewFiltered
                        ? visibleUnits.length + " of " + units.length + " units shown"
                        : units.length + " mapped units") + " · " + activeLayout.name}
                    </span>
                    <span>Coordinates: layout-pixel-v1</span>
                  </div>
                </div>
                {isFullscreen && showFullscreenHint && (
                  <div className="studio-fullscreen-toast" role="status">
                    Press <kbd>Esc</kbd> to exit fullscreen
                  </div>
                )}
              </>
            )}
        </section>
        {isConnected &&
          activeLayout &&
          !unitsQuery.isLoading &&
          !unitsQuery.isError &&
          !assetQuery.isLoading &&
          !assetQuery.isError && (
            <aside>
              {selected ? (
                <section className="detail-panel">
                  <header className="detail-panel__head">
                    <p>Selected unit</p>
                    <h2>{selected.unitNumber}</h2>
                  </header>
                  <div className="detail-fields">
                    <div className="detail-field">
                      <label>Unit type</label>
                      <strong>
                        {getUnitTypeLabel(selected.unitType, {
                          customTypeName:
                            selectedInventoryDetails?.metadata?.customTypeName ??
                            selected.customTypeName,
                        })}
                      </strong>
                    </div>
                    {selected.purpose === "AMENITY" ? (
                      <div className="detail-field">
                        <label>Inventory purpose</label>
                        <strong>Shared amenity · not for sale</strong>
                      </div>
                    ) : (
                      <>
                        {canViewInventory && (
                          <>
                            <div className="detail-field">
                              <label>Area</label>
                              <strong>
                                {selectedInventoryDetails
                                  ? formatArea(
                                      selectedInventoryDetails.area,
                                      selectedInventoryDetails.areaUnit,
                                    )
                                  : inventoryDetailsQuery.isLoading
                                    ? "Loading…"
                                    : "Unavailable"}
                              </strong>
                            </div>
                            <div className="detail-field">
                              <label>List price</label>
                              <strong>
                                {selectedInventoryDetails
                                  ? selectedInventoryDetails.price > 0
                                    ? formatCurrency(
                                        selectedInventoryDetails.price,
                                        selectedInventoryDetails.currency,
                                      )
                                    : "Not priced"
                                  : inventoryDetailsQuery.isLoading
                                    ? "Loading…"
                                    : "Unavailable"}
                              </strong>
                            </div>
                          </>
                        )}
                        <div className="detail-field">
                          <label>Status</label>
                          <select
                            className="sanui-select filter-select status-select"
                            value={selected.status}
                            disabled={!canUpdateStatus}
                            onChange={(event) =>
                              void changeStatus(
                                selected.id,
                                event.target.value as UnitStatus,
                              )
                            }
                            aria-label="Change unit status"
                          >
                            {Array.from(allowedUnitStatuses(selected.status)).map(
                              (status) => (
                                <option key={status} value={status}>
                                  {status.replace("_", " ")}
                                </option>
                              ),
                            )}
                          </select>
                          {canCreateBooking &&
                            (selected.status === "AVAILABLE" ||
                            selected.status === "RESERVED") && (
                            <small className="field-hint">
                              {selected.status === "AVAILABLE" ? (
                                <>
                                  To book this unit for a customer,{" "}
                                  <Link
                                    href={`/bookings?project=${encodeURIComponent(projectId!)}&unit=${encodeURIComponent(selected.id)}`}
                                  >
                                    create a booking
                                  </Link>
                                  . It will be reserved until confirmed.
                                </>
                              ) : (
                                <>
                                  Confirm the customer booking in{" "}
                                  <Link
                                    href={`/bookings?project=${encodeURIComponent(projectId!)}`}
                                  >
                                    Bookings
                                  </Link>{" "}
                                  to mark this unit as booked.
                                </>
                              )}
                            </small>
                          )}
                        </div>
                      </>
                    )}
                    {canViewInventory ? (
                      <>
                    {inventoryDetailsQuery.isError && (
                      <p className="field-hint" role="alert">
                        Inventory details could not be loaded.
                      </p>
                    )}
                    {selectedInventoryDetails?.metadata?.description && (
                      <div className="detail-field">
                        <label>Description</label>
                        <p className="studio-unit-description">
                          {selectedInventoryDetails.metadata.description}
                        </p>
                      </div>
                    )}
                    {[
                      ["Block / zone", selectedInventoryDetails?.metadata?.block],
                      [
                        "Category",
                        selectedInventoryDetails?.metadata?.category
                          ? UNIT_CATEGORY_PRESENTATION[
                              selectedInventoryDetails.metadata.category
                            ].label
                          : undefined,
                      ],
                      ["Floor / level", selectedInventoryDetails?.metadata?.floor],
                      [
                        "Facing",
                        selectedInventoryDetails?.metadata?.facing
                          ? `${selectedInventoryDetails.metadata.facing[0]}${selectedInventoryDetails.metadata.facing.slice(1).toLowerCase()}`
                          : undefined,
                      ],
                      ["Bedrooms", selectedInventoryDetails?.metadata?.bedrooms],
                      ["Bathrooms", selectedInventoryDetails?.metadata?.bathrooms],
                      ["Parking spaces", selectedInventoryDetails?.metadata?.parkingSpaces],
                      [
                        "Parking type",
                        selectedInventoryDetails?.metadata?.parkingType?.replaceAll("_", " "),
                      ],
                      [
                        "Covered parking",
                        selectedInventoryDetails?.metadata?.parkingCovered === undefined
                          ? undefined
                          : selectedInventoryDetails.metadata.parkingCovered
                            ? "Yes"
                            : "No",
                      ],
                      [
                        "Road width",
                        selectedInventoryDetails?.metadata?.roadWidth
                          ? `${selectedInventoryDetails.metadata.roadWidth} ${selectedInventoryDetails.metadata.roadWidthUnit === "M" ? "m" : "ft"}`
                          : undefined,
                      ],
                    ]
                      .filter(
                        ([, value]) => value !== undefined && value !== "",
                      )
                      .map(([label, value]) => (
                        <div className="detail-field" key={String(label)}>
                          <label>{label}</label>
                          <strong>{String(value)}</strong>
                        </div>
                      ))}
                    {Boolean(selectedInventoryDetails?.metadata?.features?.length) && (
                      <div className="detail-field">
                        <label>Features</label>
                        <div className="studio-feature-list">
                          {selectedInventoryDetails?.metadata?.features?.map((feature) => (
                            <span key={feature}>{feature}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedInventoryDetails?.metadata?.customAttributes?.map((attribute) => (
                      <div className="detail-field" key={attribute.label}>
                        <label>{attribute.label}</label>
                        <strong>{attribute.value}</strong>
                      </div>
                    ))}
                      </>
                    ) : (
                      <p className="field-hint">
                        Map outlines and unit status are available to this role.
                        Ask an administrator for View inventory access to see
                        prices, area, and detailed unit information.
                      </p>
                    )}
                    <div className="detail-field">
                      <label>Updated</label>
                      <strong>
                        {new Date(selectedInventoryDetails?.updatedAt ?? selected.updatedAt).toLocaleString()}
                      </strong>
                    </div>
                  </div>
                  <div className="detail-panel__actions">
                    {canUpdateStatus && selected.purpose === "SALE" &&
                      allowedUnitStatuses(selected.status).has("SOLD") && (
                      <Button
                        className="mark-sold-button"
                        variant="secondary"
                        onClick={() => void changeStatus(selected.id, "SOLD")}
                      >
                        Mark as sold
                      </Button>
                    )}
                    {canCreateBooking && selected.purpose === "SALE" && selected.status === "AVAILABLE" && (
                      <Link
                        className="sanui-button sanui-button--secondary sanui-button--md"
                        href={`/bookings?project=${encodeURIComponent(projectId!)}&unit=${encodeURIComponent(selected.id)}`}
                      >
                        Book for customer
                      </Link>
                    )}
                    {canCreateBooking && selected.purpose === "SALE" && selected.status === "RESERVED" && (
                      <Link
                        className="sanui-button sanui-button--secondary sanui-button--md"
                        href={`/bookings?project=${encodeURIComponent(projectId!)}`}
                      >
                        Confirm booking
                      </Link>
                    )}
                    {canEditUnit && (
                      <Button
                        variant="secondary"
                        onClick={() => void openEditDetails(selected)}
                      >
                        Edit unit details
                      </Button>
                    )}
                    {canEditMap && (
                      <Button
                        variant="secondary"
                        disabled={isPreviewFiltered}
                        onClick={() => setTool("edit")}
                      >
                        Edit outline
                      </Button>
                    )}
                    {canDeleteUnit && (
                      <Button
                        variant="ghost"
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        Remove from inventory
                      </Button>
                    )}
                  </div>
                </section>
              ) : (
                <section className="detail-panel">
                  <header className="detail-panel__head">
                    <p>Map selection</p>
                    <h2>Select a unit</h2>
                  </header>
                  <div className="detail-fields">
                    <p className="no-margin preview-note">
                      Select a unit to see its inventory details and edit its
                      shape or information.
                    </p>
                    <div className="detail-field">
                      <label>Current tool</label>
                      <strong>
                        {toolItems.find((item) => item.tool === tool)?.label}
                      </strong>
                    </div>
                  </div>
                </section>
              )}
              <section className="detail-panel map-legend">
                <span className="legend-title">Preview filters</span>
                <p className="studio-filter-help">
                  Filter the map by availability or zone. Clear filters to draw
                  or edit outlines on the full layout.
                  {categoryPreviewOptions.length === 0 && (
                    <> Zone filters appear after you assign a category to a sale unit.</>
                  )}
                </p>
                <div
                  className="studio-preview-filters"
                  role="group"
                  aria-label="Filter Map Studio preview"
                >
                  <button
                    type="button"
                    className={
                      "studio-preview-filter" +
                      (statusPreviewFilter === "ALL" &&
                      categoryPreviewFilter === "ALL"
                        ? " is-active"
                        : "")
                    }
                    aria-pressed={
                      statusPreviewFilter === "ALL" &&
                      categoryPreviewFilter === "ALL"
                    }
                    onClick={() => toggleStatusPreviewFilter("ALL")}
                  >
                    All units <span>{units.length}</span>
                  </button>
                  {statusPreviewOptions.map((status) => (
                    <button
                      type="button"
                      className={
                        "studio-preview-filter" +
                        (statusPreviewFilter === status ? " is-active" : "")
                      }
                      key={status}
                      aria-pressed={statusPreviewFilter === status}
                      onClick={() =>
                        toggleStatusPreviewFilter(
                          statusPreviewFilter === status ? "ALL" : status,
                        )
                      }
                    >
                      <i
                        aria-hidden="true"
                        style={{
                          backgroundColor: UNIT_STATUS_PRESENTATION[status].fill,
                        }}
                      />
                      {UNIT_STATUS_PRESENTATION[status].label}
                      <span>
                        {
                          units.filter(
                            (unit) =>
                              unit.purpose === "SALE" &&
                              unit.status === status,
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                  {units.some((unit) => unit.purpose === "AMENITY") && (
                    <button
                      type="button"
                      className={
                        "studio-preview-filter" +
                        (statusPreviewFilter === "AMENITIES" ? " is-active" : "")
                      }
                      aria-pressed={statusPreviewFilter === "AMENITIES"}
                      onClick={() =>
                        toggleStatusPreviewFilter(
                          statusPreviewFilter === "AMENITIES"
                            ? "ALL"
                            : "AMENITIES",
                        )
                      }
                    >
                      <i
                        className="studio-preview-filter__amenity"
                        aria-hidden="true"
                      />
                      Amenities
                      <span>
                        {
                          units.filter((unit) => unit.purpose === "AMENITY")
                            .length
                        }
                      </span>
                    </button>
                  )}
                  {categoryPreviewOptions.length > 0 && (
                    <>
                      <span
                        className="studio-preview-filter-divider"
                        aria-hidden="true"
                      />
                      {categoryPreviewOptions.map((category) => (
                        <button
                          type="button"
                          className={
                            "studio-preview-filter studio-preview-filter--category" +
                            (categoryPreviewFilter === category
                              ? " is-active"
                              : "")
                          }
                          key={category}
                          aria-pressed={categoryPreviewFilter === category}
                          onClick={() => toggleCategoryPreviewFilter(category)}
                        >
                          <i
                            aria-hidden="true"
                            style={{
                              backgroundColor:
                                UNIT_CATEGORY_PRESENTATION[category].text,
                            }}
                          />
                          {UNIT_CATEGORY_PRESENTATION[category].label}
                          <span>
                            {
                              units.filter((unit) => unit.category === category)
                                .length
                            }
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </section>
            </aside>
          )}
        {isFullscreen && message && (
          <div
            className={`studio-fullscreen-feedback ${fullscreenMessageTone}`}
            role="status"
          >
            {message}
            <button
              type="button"
              onClick={() => setMessage("")}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}
        <Modal
          open={dialogOpen}
          title={
            editingUnit
              ? `Edit unit · ${editingUnit.unitNumber}`
              : "Create inventory unit"
          }
          onClose={() => {
            setDialogOpen(false);
            setEditingUnitId(undefined);
            setEditingUnit(undefined);
          }}
          footer={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setDialogOpen(false);
                  setEditingUnitId(undefined);
                  setEditingUnit(undefined);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={form.handleSubmit(onSubmit)}
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Saving…"
                  : editingUnit
                    ? "Save unit details"
                    : "Create unit"}
              </Button>
            </>
          }
        >
          <form
            className="unit-create-form"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <p className="modal-description">
              Add the inventory facts connected to this mapped shape. Status
              changes continue to follow the booking workflow.
            </p>
            <div className="unit-layout-summary">
              <div>
                <small>Project</small>
                <strong>{activeProject?.name ?? "—"}</strong>
              </div>
              <div>
                <small>Layout</small>
                <strong>{activeLayout?.name ?? "—"}</strong>
              </div>
              <div>
                <small>Layout coordinate space</small>
                <strong>
                  {activeLayout
                    ? `${activeLayout.width} × ${activeLayout.height} px`
                    : "—"}
                </strong>
                <span>Pixel dimensions read from the uploaded layout image.</span>
              </div>
              <div>
                <small>Mapped shape</small>
                <strong>
                  {geometryDescription(editingUnit?.geometry ?? newGeometry)}
                </strong>
                <span>Derived from the saved or drawn shape geometry.</span>
              </div>
            </div>

            <section className="unit-form-section">
              <div className="unit-form-section__heading">
                <span>01</span>
                <div>
                  <h3>Unit identity</h3>
                  <p>Give this shape a unique inventory identifier.</p>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-field unit-form-wide">
                  <label htmlFor="unitPurpose">Inventory purpose</label>
                  <select
                    id="unitPurpose"
                    {...form.register("purpose", {
                      onChange: (event) => {
                        if (
                          event.target.value === "AMENITY" &&
                          form.getValues("unitType") !== "CUSTOM"
                        )
                          form.setValue("unitType", "CUSTOM", {
                            shouldDirty: true,
                          });
                        if (event.target.value === "AMENITY")
                          form.setValue("details.category", "", {
                            shouldDirty: true,
                          });
                      },
                    })}
                  >
                    <option value="SALE">For sale</option>
                    <option value="AMENITY">Amenity / shared area · not for sale</option>
                  </select>
                  <small className="field-hint">
                    {watchedPurpose === "AMENITY"
                      ? "Amenities stay clickable on the map, but have no sale price, sale status, or booking actions."
                      : "Sale units can show area, pricing, availability, and customer booking actions."}
                  </small>
                </div>
                <div className="form-field">
                  <label htmlFor="unitNumber">
                    Unit number <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="unitNumber"
                    {...form.register("unitNumber")}
                    placeholder="e.g. A-104, P-08, ROAD-1"
                  />
                  {form.formState.errors.unitNumber && (
                    <small className="form-error">
                      {form.formState.errors.unitNumber.message}
                    </small>
                  )}
                </div>
                <div className="form-field">
                  <label htmlFor="unitType">
                    Unit type <span aria-hidden="true">*</span>
                  </label>
                  {watchedPurpose === "AMENITY" ? (
                    <>
                      <input
                        id="unitType"
                        type="hidden"
                        defaultValue="CUSTOM"
                        {...form.register("unitType")}
                      />
                      <div className="unit-type-fixed" aria-label="Custom amenity">
                        Custom amenity
                      </div>
                      <small className="field-hint">
                        Amenities are stored as custom units. Add the facility name below.
                      </small>
                    </>
                  ) : (
                    <select id="unitType" {...form.register("unitType")}>
                      <option value="PLOT">Residential plot</option>
                      <option value="APARTMENT">Apartment</option>
                      <option value="VILLA">Villa</option>
                      <option value="OFFICE">Office</option>
                      <option value="SHOP">Shop</option>
                      <option value="PARKING">Parking</option>
                      <option value="ROOM">Room</option>
                      <option value="WAREHOUSE">Warehouse</option>
                      <option value="CUSTOM">Custom type</option>
                    </select>
                  )}
                </div>
                {watchedUnitType === "CUSTOM" && (
                  <div className="form-field unit-form-wide">
                    <label htmlFor="customTypeName">
                      Custom type name <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="customTypeName"
                      {...form.register("details.customTypeName")}
                      placeholder="e.g. Road, Garden, Clubhouse, Storage"
                      aria-describedby="custom-type-hint custom-type-error"
                    />
                    <small id="custom-type-hint" className="field-hint">
                      {watchedPurpose === "AMENITY"
                        ? "Name the shared facility, for example Gym, Playground, Park, or Road."
                        : "This name replaces “Custom” on the public map and inventory lists."}
                    </small>
                    {form.formState.errors.details?.customTypeName && (
                      <small className="form-error" id="custom-type-error">
                        {form.formState.errors.details.customTypeName.message}
                      </small>
                    )}
                  </div>
                )}
                {watchedPurpose === "SALE" && (
                  <div className="form-field">
                    <label htmlFor="unitCategory">Zone category</label>
                    <select id="unitCategory" {...form.register("details.category")}>
                      <option value="">Unassigned</option>
                      <option value="GOLD">Gold zone</option>
                      <option value="PLATINUM">Platinum zone</option>
                      <option value="SILVER">Silver zone</option>
                      <option value="REGULAR">Regular zone</option>
                    </select>
                    <small className="field-hint">
                      Use the same category for units in a zone. Zone category and facing appear on the public map; assign a category to multiple units from Inventory.
                    </small>
                  </div>
                )}
              </div>
            </section>

            {watchedPurpose === "SALE" ? (
              <section className="unit-form-section">
                <div className="unit-form-section__heading">
                  <span>02</span>
                  <div>
                    <h3>Area and pricing</h3>
                    <p>Record the marketed area and listed value.</p>
                  </div>
                </div>
                <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="unitArea">
                    Area <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="unitArea"
                    type="number"
                    min="0.001"
                    step="any"
                    {...form.register("area", { valueAsNumber: true })}
                  />
                  {form.formState.errors.area && (
                    <small className="form-error">
                      {form.formState.errors.area.message}
                    </small>
                  )}
                </div>
                <div className="form-field">
                  <label htmlFor="areaUnit">Area unit</label>
                  <select id="areaUnit" {...form.register("areaUnit")}>
                    <option value="SQFT">Square feet (sq ft)</option>
                    <option value="SQM">Square metres (sq m)</option>
                    <option value="ACRE">Acres</option>
                    <option value="HECTARE">Hectares</option>
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="unitPrice">
                    List price <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="1"
                    {...form.register("price", { valueAsNumber: true })}
                  />
                  <small className="field-hint">
                    Enter 0 when the price is not applicable; it will be shown
                    as “Not priced”.
                  </small>
                  {form.formState.errors.price && (
                    <small className="form-error">
                      {form.formState.errors.price.message}
                    </small>
                  )}
                </div>
                <div className="form-field">
                  <label htmlFor="currency">Currency</label>
                  <select id="currency" {...form.register("currency")}>
                    <option value="INR">INR · ₹</option>
                    <option value="USD">USD · $</option>
                    <option value="EUR">EUR · €</option>
                  </select>
                </div>
                </div>
              </section>
            ) : (
              <div className="unit-amenity-note" role="note">
                <strong>Shared amenity · not for sale</strong>
                <span>
                  Area and price are not applicable. Customers can open this
                  shape on the public map to read its description and features.
                </span>
              </div>
            )}

            <section className="unit-form-section">
              <div className="unit-form-section__heading">
                <span>03</span>
                <div>
                  <h3>Location and property details</h3>
                  <p>
                    Optional information for plots, floors, parking, roads, and
                    other custom inventory.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label htmlFor="unitBlock">Block, tower, or zone</label>
                  <input
                    id="unitBlock"
                    {...form.register("details.block")}
                    placeholder="e.g. Tower A, North Zone"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="unitFloor">Floor or level</label>
                  <input
                    id="unitFloor"
                    {...form.register("details.floor")}
                    placeholder="e.g. Ground, Level 2, Basement P1"
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="unitFacing">Facing / orientation</label>
                  <select
                    id="unitFacing"
                    {...form.register("details.facing")}
                  >
                    <option value="">Choose facing (optional)</option>
                    <option value="EAST">East</option>
                    <option value="NORTH">North</option>
                    <option value="WEST">West</option>
                    <option value="SOUTH">South</option>
                  </select>
                  <small className="field-hint">
                    Select the direction the unit faces. This appears in the public unit details.
                  </small>
                </div>
                {["APARTMENT", "VILLA", "ROOM"].includes(watchedUnitType) && (
                  <>
                    <div className="form-field">
                      <label htmlFor="unitBedrooms">Bedrooms</label>
                      <input
                        id="unitBedrooms"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        {...form.register("details.bedrooms", {
                          setValueAs: optionalNumber,
                        })}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="unitBathrooms">Bathrooms</label>
                      <input
                        id="unitBathrooms"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        {...form.register("details.bathrooms", {
                          setValueAs: optionalNumber,
                        })}
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="unitParkingSpaces">Parking spaces</label>
                      <input
                        id="unitParkingSpaces"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        {...form.register("details.parkingSpaces", {
                          setValueAs: optionalNumber,
                        })}
                      />
                    </div>
                  </>
                )}
                {(watchedUnitType === "PARKING" ||
                  (watchedUnitType === "CUSTOM" &&
                    /parking/i.test(watchedCustomTypeName ?? ""))) && (
                  <>
                    <div className="form-field">
                      <label htmlFor="parkingType">Parking space type</label>
                      <select
                        id="parkingType"
                        {...form.register("details.parkingType")}
                      >
                        <option value="CAR">Car</option>
                        <option value="TWO_WHEELER">Two-wheeler</option>
                        <option value="EV">Electric vehicle</option>
                        <option value="VISITOR">Visitor</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <label className="setting-check unit-form-check">
                      <input
                        type="checkbox"
                        {...form.register("details.parkingCovered")}
                      />
                      <span>Covered parking</span>
                    </label>
                  </>
                )}
                {watchedUnitType === "CUSTOM" &&
                  /road|street|drive/i.test(watchedCustomTypeName ?? "") && (
                    <>
                      <div className="form-field">
                        <label htmlFor="roadWidth">Road width</label>
                        <input
                          id="roadWidth"
                          type="number"
                          min="0.01"
                          step="any"
                          {...form.register("details.roadWidth", {
                            setValueAs: optionalNumber,
                          })}
                        />
                      </div>
                      <div className="form-field">
                        <label htmlFor="roadWidthUnit">Width unit</label>
                        <select
                          id="roadWidthUnit"
                          {...form.register("details.roadWidthUnit")}
                        >
                          <option value="FT">Feet</option>
                          <option value="M">Metres</option>
                        </select>
                      </div>
                    </>
                  )}
              </div>
              <div className="form-field unit-form-description">
                <label htmlFor="unitDescription">Description</label>
                <textarea
                  id="unitDescription"
                  rows={3}
                  maxLength={2000}
                  {...form.register("details.description")}
                  placeholder="Describe the unit, access, condition, or anything a sales team should know."
                />
                <small className="field-hint">
                  Keep customer-facing information factual and avoid personal or
                  confidential data.
                </small>
              </div>
              <div className="form-field unit-form-description">
                <label htmlFor="unitFeatures">Features</label>
                <textarea
                  id="unitFeatures"
                  rows={2}
                  value={watchedFeatures.join(", ")}
                  onChange={(event) =>
                    form.setValue(
                      "details.features",
                      event.target.value
                        .split(",")
                        .map((feature) => feature.trim())
                        .filter(Boolean),
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                  placeholder="Separate with commas: corner unit, paved access, EV charging"
                />
                <small className="field-hint">
                  Enter up to 20 short features, separated by commas.
                </small>
              </div>
              <div className="unit-custom-attributes">
                <div className="unit-custom-attributes__heading">
                  <div>
                    <strong>Additional details</strong>
                    <small>
                      Add details specific to this property, such as “Gate
                      access: 24 hours”.
                    </small>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      customAttributes.append({ label: "", value: "" })
                    }
                  >
                    ＋ Add detail
                  </Button>
                </div>
                {customAttributes.fields.map((field, index) => (
                  <div className="unit-custom-attribute-row" key={field.id}>
                    <div className="form-field">
                      <label htmlFor={`custom-label-${index}`}>Label</label>
                      <input
                        id={`custom-label-${index}`}
                        {...form.register(
                          `details.customAttributes.${index}.label`,
                        )}
                        placeholder="e.g. Access hours"
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor={`custom-value-${index}`}>Value</label>
                      <input
                        id={`custom-value-${index}`}
                        {...form.register(
                          `details.customAttributes.${index}.value`,
                        )}
                        placeholder="e.g. 24 hours"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Remove additional detail ${index + 1}`}
                      onClick={() => customAttributes.remove(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
              <label className="setting-check unit-form-public-toggle">
                <input
                  type="checkbox"
                  {...form.register("showDetailsOnPublicMap")}
                />
                <span>
                  <strong>Show additional details on the public map</strong>
                  <small>
                    Zone category and facing are public map details. Enable
                    this to show the remaining details, such as description,
                    block, and features.
                  </small>
                </span>
              </label>
            </section>
            <div className="unit-availability-note">
              <strong>
                {watchedPurpose === "AMENITY"
                  ? "Shared amenity"
                  : "Availability"}
              </strong>
              <span>
                {watchedPurpose === "AMENITY"
                  ? "Amenities are not assigned a sale status and cannot be booked or marked sold."
                  : "New units start as Available. Reserve a unit through Bookings, then confirm it there to mark it Booked."}
              </span>
            </div>
            <button
              className="visually-hidden-submit"
              type="submit"
              aria-hidden="true"
              tabIndex={-1}
            >
              {editingUnit ? "Save unit details" : "Create unit"}
            </button>
          </form>
        </Modal>
        <Modal
          open={deleteDialogOpen && Boolean(selected)}
          title="Remove unit from inventory?"
          onClose={() => {
            if (!isDeleting) setDeleteDialogOpen(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={isDeleting}
                onClick={() => setDeleteDialogOpen(false)}
              >
                Keep unit
              </Button>
              <Button
                variant="danger"
                disabled={isDeleting}
                onClick={() => void deleteSelected()}
              >
                {isDeleting ? "Removing…" : "Remove unit"}
              </Button>
            </>
          }
        >
          <p className="modal-description">
            Remove unit <strong>{selected?.unitNumber}</strong>? This will
            delete its inventory record and map shape. This action cannot be
            undone.
          </p>
        </Modal>
        <Modal
          open={replaceDialogOpen && Boolean(replacementFile && activeLayout)}
          title="Replace this layout image?"
          onClose={() => {
            if (!layoutActionPending) {
              setReplaceDialogOpen(false);
              setReplacementFile(undefined);
            }
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={layoutActionPending}
                onClick={() => {
                  setReplaceDialogOpen(false);
                  setReplacementFile(undefined);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  layoutActionPending || !replacementFile || !activeLayout
                }
                onClick={() => {
                  const file = replacementFile;
                  const layoutId = activeLayout?.id;
                  setReplaceDialogOpen(false);
                  setReplacementFile(undefined);
                  if (file && layoutId) void uploadBackground(file, layoutId);
                }}
              >
                {layoutActionPending ? "Replacing…" : "Replace layout"}
              </Button>
            </>
          }
        >
          <p className="modal-description">
            Replace <strong>{activeLayout?.name}</strong> with{" "}
            <strong>{replacementFile?.name}</strong>. The existing layout stays
            in place if the upload fails.
            {activeLayoutUnitCount > 0 && (
              <>
                {" "}
                Its {activeLayoutUnitCount} mapped unit outline
                {activeLayoutUnitCount === 1 ? " will" : "s will"} scale
                proportionally if the new image dimensions differ. Review the
                map and save any corrections afterward.
              </>
            )}
          </p>
        </Modal>
        <Modal
          open={deleteLayoutDialogOpen && Boolean(activeLayout)}
          title="Delete this layout?"
          onClose={() => {
            if (!layoutActionPending) setDeleteLayoutDialogOpen(false);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={layoutActionPending}
                onClick={() => setDeleteLayoutDialogOpen(false)}
              >
                Keep layout
              </Button>
              <Button
                variant="danger"
                disabled={layoutActionPending || activeLayoutUnitCount > 0}
                onClick={() => void deleteActiveLayout()}
              >
                {layoutActionPending ? "Deleting…" : "Delete layout"}
              </Button>
            </>
          }
        >
          <p className="modal-description">
            Delete <strong>{activeLayout?.name}</strong> and its stored image?
            This cannot be undone. Layouts with mapped units must be replaced or
            have their units removed before deletion.
          </p>
          {activeLayoutUnitCount > 0 && (
            <p className="form-error" role="status">
              This layout still has {activeLayoutUnitCount} mapped unit
              {activeLayoutUnitCount === 1 ? "" : "s"}.
            </p>
          )}
        </Modal>
      </div>
    </div>
  );
}
