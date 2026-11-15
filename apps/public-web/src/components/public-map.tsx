"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { vstudioApi, type PublicInventoryUnit } from "@vstudio/api-client";
import { InteractiveMap, type MapShape } from "@vstudio/map-engine";
import {
  UNIT_CATEGORY_PRESENTATION,
  UNIT_PURPOSE_PRESENTATION,
  UNIT_STATUS_PRESENTATION,
  type UnitCategory,
  type UnitStatus,
} from "@vstudio/types";
import { formatArea, formatCurrency, getUnitTypeLabel } from "@vstudio/utils";
import { Badge, Button } from "sanui";

export function PublicMap({
  slug,
  embedded = false,
}: {
  slug: string;
  embedded?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "AMENITIES" | UnitStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | UnitCategory>("ALL");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [hoveredId, setHoveredId] = useState<string>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [enquiryPrepared, setEnquiryPrepared] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [preferredContact, setPreferredContact] = useState<"EMAIL" | "PHONE">(
    "EMAIL",
  );
  const [message, setMessage] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mapCardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (enquiryOpen && !dialog.open) dialog.showModal();
    if (!enquiryOpen && dialog.open) dialog.close();
  }, [enquiryOpen]);
  useEffect(() => {
    const updateFullscreenState = () =>
      setIsFullscreen(document.fullscreenElement === mapCardRef.current);
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () =>
      document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);
  const query = useQuery({
    queryKey: ["public-project", slug],
    queryFn: () => vstudioApi.publicProject(slug),
    retry: false,
    // Refetch on tab focus so edits made in Studio quickly appear on an
    // already-open public map.
    staleTime: 0,
  });
  const shellClass = embedded ? "embed-shell" : "public-shell";

  if (query.isLoading)
    return (
      <main className={shellClass}>
        <section className="public-card public-details">
          <p>Loading project map…</p>
        </section>
      </main>
    );
  if (query.isError || !query.data)
    return (
      <main className={shellClass}>
        <section className="public-card public-details">
          <h1>Project map unavailable</h1>
          <p>This map may be unpublished, or the VStudio API may be offline.</p>
          <Link
            className="sanui-button sanui-button--secondary sanui-button--md"
            href="/"
          >
            Return home
          </Link>
        </section>
      </main>
    );

  const remote = query.data;
  const project = remote.project;
  const allUnits = remote.units as PublicInventoryUnit[];
  const layout =
    remote.layouts.find((item) => item.id === selectedLayoutId) ??
    remote.layouts[0];
  const saleUnits = allUnits.filter((unit) => unit.purpose === "SALE");
  const amenityUnits = allUnits.filter((unit) => unit.purpose === "AMENITY");
  const availableCount = saleUnits.filter((unit) => unit.status === "AVAILABLE").length;
  const reservedCount = saleUnits.filter((unit) => unit.status === "RESERVED").length;
  const layoutUnits = layout
    ? allUnits.filter((unit) => unit.layoutId === layout.id)
    : [];
  const statusOptions = (
    Object.keys(UNIT_STATUS_PRESENTATION) as UnitStatus[]
  ).filter((status) =>
    layoutUnits.some((unit) => unit.purpose === "SALE" && unit.status === status),
  );
  const categoryOrder: UnitCategory[] = ["GOLD", "PLATINUM", "SILVER", "REGULAR"];
  const categoryOptions = categoryOrder.filter((category) =>
    layoutUnits.some(
      (unit) =>
        unit.purpose === "SALE" && unit.publicMetadata?.category === category,
    ),
  );
  const countForStatusFilter = (filter: "ALL" | "AMENITIES" | UnitStatus) =>
    filter === "ALL"
      ? layoutUnits.length
      : filter === "AMENITIES"
        ? layoutUnits.filter((unit) => unit.purpose === "AMENITY").length
        : layoutUnits.filter(
            (unit) => unit.purpose === "SALE" && unit.status === filter,
          ).length;
  const matchingUnits = layoutUnits.filter((unit) =>
    `${unit.unitNumber} ${getUnitTypeLabel(unit.unitType, unit.publicMetadata)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const visibleUnits = matchingUnits.filter((unit) => {
    const statusMatches =
      statusFilter === "ALL" ||
      (statusFilter === "AMENITIES"
        ? unit.purpose === "AMENITY"
        : unit.purpose === "SALE" && unit.status === statusFilter);
    const categoryMatches =
      categoryFilter === "ALL" ||
      (unit.purpose === "SALE" &&
        unit.publicMetadata?.category === categoryFilter);
    return statusMatches && categoryMatches;
  });
  const hasActiveMapFilter =
    statusFilter !== "ALL" || categoryFilter !== "ALL" || Boolean(search.trim());
  const hasVisibleAmenities = visibleUnits.some(
    (unit) => unit.purpose === "AMENITY",
  );
  const visibleUnitIds = new Set(visibleUnits.map((unit) => unit.id));
  const activeFilterLabels = [
    statusFilter === "ALL"
      ? undefined
      : statusFilter === "AMENITIES"
        ? "Amenities"
        : UNIT_STATUS_PRESENTATION[statusFilter].label,
    categoryFilter === "ALL"
      ? undefined
      : UNIT_CATEGORY_PRESENTATION[categoryFilter].label,
    search.trim() ? `“${search.trim()}”` : undefined,
  ].filter((label): label is string => Boolean(label));
  const selected = allUnits.find((unit) => unit.id === selectedId);
  const hovered = allUnits.find((unit) => unit.id === hoveredId);
  // A click pins a unit preview. Hover previews take over again only after it is closed.
  const activeUnit = selected ?? hovered;
  const shapes: MapShape[] = layoutUnits.map((unit) => {
    const isDimmedContext =
      hasActiveMapFilter && !visibleUnitIds.has(unit.id);
    return {
      id: unit.id,
      geometry: unit.geometry,
      label: unit.unitNumber,
      purpose: unit.purpose,
      fill: isDimmedContext
        ? "color-mix(in srgb, var(--sanui-color-status-off-market) 68%, transparent)"
        : unit.purpose === "AMENITY"
          ? UNIT_PURPOSE_PRESENTATION.AMENITY.fill
          : UNIT_STATUS_PRESENTATION[unit.status].fill,
      stroke: isDimmedContext
        ? "var(--sanui-color-status-off-market)"
        : unit.purpose === "AMENITY"
          ? UNIT_PURPOSE_PRESENTATION.AMENITY.stroke
          : undefined,
    };
  });
  const areaLabel = (unit: PublicInventoryUnit) =>
    unit.area == null
      ? "Area not listed"
      : formatArea(unit.area, unit.areaUnit);
  const priceLabel = (unit: PublicInventoryUnit) =>
    unit.price == null || unit.price === 0
      ? "Price on request"
      : formatCurrency(unit.price, unit.currency);
  const contactEmail =
    typeof project.publicConfig?.contactEmail === "string"
      ? project.publicConfig.contactEmail
      : "sales@example.com";
  const contactPhone =
    typeof project.publicConfig?.contactPhone === "string"
      ? project.publicConfig.contactPhone
      : "";
  const allowEnquiries = project.publicConfig?.allowEnquiries !== false;
  const additionalDetails = activeUnit
    ? Object.entries(activeUnit.publicMetadata ?? {})
        .filter(
          ([key, value]) =>
            key !== "customTypeName" &&
            key !== "description" &&
            key !== "category" &&
            key !== "features" &&
            key !== "customAttributes" &&
            ["string", "number", "boolean"].includes(typeof value),
        )
        .slice(0, 8)
        .map(([key, value]) => {
          const labels: Record<string, string> = {
            block: "Block / tower / zone",
            floor: "Floor / level",
            facing: "Facing / orientation",
            bedrooms: "Bedrooms",
            bathrooms: "Bathrooms",
            parkingSpaces: "Parking spaces",
            parkingType: "Parking type",
            parkingCovered: "Parking coverage",
            roadWidth: "Road width",
          };
          const enumLabels: Record<string, string> = {
            CAR: "Car",
            TWO_WHEELER: "Two-wheeler",
            EV: "Electric vehicle",
            VISITOR: "Visitor",
            OTHER: "Other",
          };
          if (key === "parkingType" && typeof value === "string")
            value = enumLabels[value] ?? value;
          if (key === "facing" && typeof value === "string")
            value = `${value[0]}${value.slice(1).toLowerCase()}`;
          if (key === "parkingCovered" && typeof value === "boolean")
            value = value ? "Covered" : "Uncovered";
          if (key === "roadWidth") {
            const unit = activeUnit.publicMetadata?.roadWidthUnit === "M" ? "m" : "ft";
            value = `${value} ${unit}`;
          }
          return [labels[key] ?? key, value] as const;
        })
    : [];
  const publicFeatures = Array.isArray(activeUnit?.publicMetadata?.features)
    ? activeUnit.publicMetadata.features
        .filter((value): value is string => typeof value === "string")
        .slice(0, 12)
    : [];
  const publicCustomAttributes = Array.isArray(
    activeUnit?.publicMetadata?.customAttributes,
  )
    ? activeUnit.publicMetadata.customAttributes
        .filter(
          (attribute) =>
            typeof attribute?.label === "string" &&
            typeof attribute?.value === "string",
        )
        .slice(0, 8)
    : [];
  const startEnquiry = () => {
    if (activeUnit) setSelectedId(activeUnit.id);
    setHoveredId(undefined);
    setEnquiryPrepared(false);
    setEnquiryOpen(true);
  };
  const closeEnquiry = () => setEnquiryOpen(false);
  const submitEnquiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.purpose === "AMENITY") return;
    const body = [
      `Hello, I’m interested in ${project.name}, unit ${selected.unitNumber}.`,
      "",
      `Name: ${customerName}`,
      `Email: ${customerEmail}`,
      `Phone: ${customerPhone || "Not provided"}`,
      `Preferred contact: ${preferredContact === "PHONE" ? "Phone" : "Email"}`,
      `Unit: ${selected.unitNumber}`,
      `Availability: ${UNIT_STATUS_PRESENTATION[selected.status].label}`,
      `Type: ${getUnitTypeLabel(selected.unitType, selected.publicMetadata)}`,
      `Area: ${areaLabel(selected)}`,
      `Price: ${priceLabel(selected)}`,
      "",
      `Message: ${message || "Please contact me with more information."}`,
    ].join("\n");
    window.location.href = `mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${selected.unitNumber} · ${project.name}`)}&body=${encodeURIComponent(body)}`;
    setEnquiryPrepared(true);
  };
  const toggleFullscreen = async () => {
    const mapCard = mapCardRef.current;
    if (!mapCard) return;
    try {
      setFullscreenError("");
      if (document.fullscreenElement === mapCard)
        await document.exitFullscreen();
      else await mapCard.requestFullscreen();
    } catch {
      setFullscreenError("Fullscreen is not available in this browser.");
    }
  };
  const selectionPopover = activeUnit ? (
    <article
      className="map-callout-bubble"
      aria-label={`Details for ${activeUnit.purpose === "AMENITY" ? "amenity" : "unit"} ${activeUnit.unitNumber}`}
    >
      <div className="public-map-callout">
        <div className="map-callout-heading">
          <span className="map-callout-pin" aria-hidden="true">
            ⌖
          </span>
          <span className="public-section-label">
            {activeUnit.purpose === "AMENITY" ? "AMENITY DETAILS" : "UNIT DETAILS"}
          </span>
          <button
            type="button"
            className="map-callout-close"
            aria-label="Close unit details"
            onClick={() => {
              setSelectedId(undefined);
              setHoveredId(undefined);
            }}
          >
            ×
          </button>
        </div>
        <div className="map-callout-title">
          <h3>{activeUnit.unitNumber}</h3>
          <span className="public-unit-badges">
            {activeUnit.purpose === "AMENITY" ? (
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
                  backgroundColor: UNIT_STATUS_PRESENTATION[activeUnit.status].fill,
                  color: UNIT_STATUS_PRESENTATION[activeUnit.status].text,
                }}
              >
                {UNIT_STATUS_PRESENTATION[activeUnit.status].label}
              </Badge>
            )}
            {activeUnit.purpose === "SALE" &&
              activeUnit.publicMetadata?.category && (
                <span
                  className="public-category-badge"
                  style={{
                    backgroundColor:
                      UNIT_CATEGORY_PRESENTATION[
                        activeUnit.publicMetadata.category
                      ].fill,
                    color:
                      UNIT_CATEGORY_PRESENTATION[
                        activeUnit.publicMetadata.category
                      ].text,
                  }}
                >
                  {UNIT_CATEGORY_PRESENTATION[
                    activeUnit.publicMetadata.category
                  ].label}
                </span>
              )}
          </span>
        </div>
        <p className="map-callout-type">
          {activeUnit.purpose === "AMENITY" &&
          activeUnit.unitNumber.trim().toLowerCase() ===
            getUnitTypeLabel(activeUnit.unitType, activeUnit.publicMetadata)
              .trim()
              .toLowerCase()
            ? "Shared amenity"
            : getUnitTypeLabel(activeUnit.unitType, activeUnit.publicMetadata)}
        </p>
        {typeof activeUnit.publicMetadata?.description === "string" && (
          <p className="map-callout-description">
            {activeUnit.publicMetadata.description}
          </p>
        )}
        {activeUnit.purpose === "AMENITY" ? (
          <p className="public-amenity-note">
            Shared project area · not individually for sale
          </p>
        ) : (
          <div className="map-callout-facts">
            <div>
              <small>AREA</small>
              <strong>{areaLabel(activeUnit)}</strong>
            </div>
            <div>
              <small>PRICE</small>
              <strong>{priceLabel(activeUnit)}</strong>
            </div>
          </div>
        )}
        {additionalDetails.length > 0 && (
          <dl className="public-additional-details">
            {additionalDetails.map(([key, value]) => (
              <div key={key}>
                <dt>
                  {key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/[_-]/g, " ")
                    .trim()}
                </dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
        )}
        {publicCustomAttributes.length > 0 && (
          <dl className="public-additional-details">
            {publicCustomAttributes.map((attribute, index) => (
              <div key={`${attribute.label}-${index}`}>
                <dt>{attribute.label}</dt>
                <dd>{attribute.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {publicFeatures.length > 0 && (
          <div className="public-unit-features" aria-label="Unit features">
            {publicFeatures.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        )}
        {activeUnit.purpose === "SALE" && (
          <div className="map-callout-actions">
            {allowEnquiries && (
              <button
                type="button"
                className="map-enquiry-button"
                onClick={startEnquiry}
              >
                Enquire about this unit <span aria-hidden="true">→</span>
              </button>
            )}
            <div className="map-contact-links">
              <a
                href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${activeUnit.unitNumber}`)}`}
              >
                Email
              </a>
              {contactPhone && (
                <a href={`tel:${contactPhone.replace(/[^\d+]/g, "")}`}>
                  Call sales
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  ) : null;
  const content = (
    <>
      <header className="public-header">
        <Link className="public-logo" href="/">
          <span>V</span> VStudio
        </Link>
        <div className="public-header-right">
          <span className="public-live-indicator">
            <i /> Project availability
          </span>
          {allowEnquiries && (
            <Button
              variant="secondary"
              onClick={() =>
                window.location.assign(
                  `mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${project.name}`)}`,
                )
              }
            >
              Contact sales
            </Button>
          )}
        </div>
      </header>
      <section className="public-hero">
        <div className="public-project-heading">
          <p className="public-eyebrow">
            PROPERTY COLLECTION <span>／</span> SITE PLAN
          </p>
          <h1>{project.name}</h1>
          <p className="public-project-location">
            {project.location || "Explore this property"}
            {project.description ? (
              <>
                <span> · </span>
                {project.description}
              </>
            ) : null}
          </p>
        </div>
        <div
          className="public-stat-grid"
          aria-label="Unit availability summary"
        >
          <div className="public-stat">
            <span className="public-stat-dot available" />
            <strong>{availableCount}</strong>
            <small>Available</small>
          </div>
          <div className="public-stat">
            <span className="public-stat-dot reserved" />
            <strong>{reservedCount}</strong>
            <small>Reserved</small>
          </div>
          <div className="public-stat public-stat-total">
            <strong>{saleUnits.length}</strong>
            <small>Sale units</small>
          </div>
          <div className="public-stat public-stat-amenities">
            <span className="public-stat-dot amenity" />
            <strong>{amenityUnits.length}</strong>
            <small>Amenities</small>
          </div>
        </div>
      </section>
      <div className="public-project-layout">
        <section ref={mapCardRef} className="public-card public-map">
          <div className="public-card-head">
            <div>
              <span className="public-section-label">
                INTERACTIVE SITE PLAN
              </span>
              <h2>{layout ? `Explore ${layout.name}` : "Explore the layout"}</h2>
              <p>
                {hasActiveMapFilter
                  ? `${visibleUnits.length} ${visibleUnits.length === 1 ? "match" : "matches"} for ${activeFilterLabels.join(" · ")}; other units stay visible in gray.`
                  : "Select a highlighted unit or amenity to see its details."}
              </p>
            </div>
            <span className="public-count-pill">
              {hasActiveMapFilter
                ? `${visibleUnits.length} of ${layoutUnits.length} units`
                : `${layoutUnits.length} ${layoutUnits.length === 1 ? "unit" : "units"}`}
            </span>
          </div>
          <div
            className={`public-map-toolbar${remote.layouts.length > 1 ? " has-layout-picker" : ""}`}
          >
            {remote.layouts.length > 1 && (
              <label className="public-layout-picker">
                <span>Layout</span>
                <select
                  value={layout?.id ?? ""}
                  aria-label="Choose a layout"
                  onChange={(event) => {
                    setSelectedLayoutId(event.target.value);
                    setSelectedId(undefined);
                    setHoveredId(undefined);
                    setSearch("");
                    setStatusFilter("ALL");
                    setCategoryFilter("ALL");
                  }}
                >
                  {remote.layouts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div
              className="public-filter-row"
              role="group"
              aria-label="Filter units by availability, category, or amenities"
            >
              {(["ALL", ...statusOptions, "AMENITIES"] as Array<
                "ALL" | "AMENITIES" | UnitStatus
              >).map((filter) => {
                const isActive =
                  filter === "ALL"
                    ? statusFilter === "ALL" && categoryFilter === "ALL"
                    : statusFilter === filter;
                const filterFill =
                  filter === "AMENITIES"
                    ? UNIT_PURPOSE_PRESENTATION.AMENITY.fill
                    : filter === "ALL"
                      ? undefined
                      : UNIT_STATUS_PRESENTATION[filter].fill;
                const filterBorder =
                  filter === "AMENITIES"
                    ? UNIT_PURPOSE_PRESENTATION.AMENITY.stroke
                    : filter === "ALL"
                      ? undefined
                      : UNIT_STATUS_PRESENTATION[filter].text;
                const filterInk =
                  filter === "AMENITIES"
                    ? UNIT_PURPOSE_PRESENTATION.AMENITY.text
                    : filter === "ALL"
                      ? undefined
                      : UNIT_STATUS_PRESENTATION[filter].text;
                const filterStyle =
                  filterFill && filterBorder && filterInk
                    ? ({
                        "--public-filter-fill": filterFill,
                        "--public-filter-border": filterBorder,
                        "--public-filter-ink": filterInk,
                      } as CSSProperties)
                    : undefined;
                return (
                  <button
                    type="button"
                    key={filter}
                    aria-pressed={isActive}
                    className={`public-filter${filter === "AMENITIES" ? " public-filter--amenity" : ""}${isActive ? " is-active" : ""}`}
                    style={filterStyle}
                    onClick={() => {
                      setStatusFilter(filter === "ALL" ? "ALL" : filter);
                      if (filter === "ALL") setCategoryFilter("ALL");
                      if (filter === "AMENITIES") setCategoryFilter("ALL");
                      setHoveredId(undefined);
                      if (
                        selected &&
                        filter !== "ALL" &&
                        (filter === "AMENITIES"
                          ? selected.purpose !== "AMENITY"
                          : selected.purpose !== "SALE" ||
                            selected.status !== filter ||
                            (categoryFilter !== "ALL" &&
                              selected.publicMetadata?.category !== categoryFilter))
                      )
                        setSelectedId(undefined);
                    }}
                  >
                    {filter !== "ALL" && (
                      <i
                        aria-hidden="true"
                        style={{
                          backgroundColor:
                            filter === "AMENITIES"
                              ? UNIT_PURPOSE_PRESENTATION.AMENITY.stroke
                              : UNIT_STATUS_PRESENTATION[filter].fill,
                        }}
                      />
                    )}
                    {filter === "ALL"
                      ? "All"
                      : filter === "AMENITIES"
                        ? "Amenities"
                        : UNIT_STATUS_PRESENTATION[filter].label}
                    <span className="public-filter-count" aria-hidden="true">
                      {countForStatusFilter(filter)}
                    </span>
                  </button>
                );
              })}
              {categoryOptions.length > 0 && (
                <>
                  <span className="public-filter-divider" aria-hidden="true" />
                  {categoryOptions.map((category) => {
                    const presentation = UNIT_CATEGORY_PRESENTATION[category];
                    const isActive = categoryFilter === category;
                    return (
                      <button
                        type="button"
                        key={category}
                        aria-pressed={isActive}
                        className={`public-filter public-filter--category${isActive ? " is-active" : ""}`}
                        style={{
                          "--public-filter-fill": presentation.fill,
                          "--public-filter-border": presentation.text,
                          "--public-filter-ink": presentation.text,
                        } as CSSProperties}
                        onClick={() => {
                          const nextCategory =
                            categoryFilter === category ? "ALL" : category;
                          if (nextCategory !== "ALL" && statusFilter === "AMENITIES")
                            setStatusFilter("ALL");
                          setCategoryFilter(nextCategory);
                          setHoveredId(undefined);
                          if (
                            selected &&
                            nextCategory !== "ALL" &&
                            selected.publicMetadata?.category !== nextCategory
                          )
                            setSelectedId(undefined);
                        }}
                      >
                        <i
                          aria-hidden="true"
                          style={{ backgroundColor: presentation.text }}
                        />
                        {presentation.label}
                        <span className="public-filter-count" aria-hidden="true">
                          {
                            layoutUnits.filter(
                              (unit) =>
                                unit.purpose === "SALE" &&
                                unit.publicMetadata?.category === category,
                            ).length
                          }
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            {fullscreenError && (
              <small className="public-fullscreen-error" role="status">
                {fullscreenError}
              </small>
            )}
          </div>
          {layout ? (
            <>
              <InteractiveMap
                width={layout.width}
                height={layout.height}
                backgroundUrl={layout.assetUrl}
                shapes={shapes}
                selectedId={hoveredId ?? selectedId}
                selectionPopover={selectionPopover}
                tool="select"
                isFullscreen={isFullscreen}
                onFullscreenToggle={() => void toggleFullscreen()}
                onSelect={(id) => {
                  setSelectedId(id);
                  setHoveredId(undefined);
                }}
                onHover={(id) => {
                  // Once a plot is clicked, ignore hover changes until the pin is cleared.
                  if (!selectedId) setHoveredId(id);
                }}
                ariaLabel={`${project.name} public site plan`}
              />
              <div className="public-legend">
                {Object.entries(UNIT_STATUS_PRESENTATION).map(
                  ([status, meta]) => (
                    <span key={status}>
                      <i style={{ background: meta.fill }} />
                      {meta.label}
                    </span>
                  ),
                )}
                {hasActiveMapFilter && (
                  <span className="public-legend-context">
                    <i /> Other units (muted)
                  </span>
                )}
                {hasVisibleAmenities && (
                  <span className="public-legend-amenity">
                    <i /> Shared amenity
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              No map layout is available for this project.
            </div>
          )}
        </section>
        <aside className="public-card public-inventory">
          <header className="public-card-head">
            <div>
              <span className="public-section-label">FIND YOUR PROPERTY</span>
              <h2>Units &amp; amenities</h2>
            </div>
            <span className="public-count-pill">{visibleUnits.length}</span>
          </header>
          <div className="public-details">
            <label className="public-search-wrap">
              <span className="public-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                className="public-search"
                value={search}
                onChange={(event) => {
                  const value = event.target.value;
                  setSearch(value);
                  if (
                    selected &&
                    !selected.unitNumber
                      .toLowerCase()
                      .includes(value.toLowerCase())
                  )
                    setSelectedId(undefined);
                }}
                placeholder="Search units or amenities"
                aria-label="Search units or amenities"
              />
              {search && (
                <button
                  type="button"
                  className="public-search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    setSelectedId(undefined);
                  }}
                >
                  ×
                </button>
              )}
            </label>
            {visibleUnits.length ? (
              <div className="public-unit-list">
                {visibleUnits.map((unit) => (
                  <button
                    type="button"
                    key={unit.id}
                    aria-pressed={unit.id === selectedId}
                    className={`public-unit-button${unit.id === selectedId ? " is-active" : ""}${unit.purpose === "AMENITY" ? " is-amenity" : ""}`}
                    onClick={() => {
                      setSelectedId(unit.id);
                      setHoveredId(undefined);
                    }}
                  >
                    <span className="public-unit-main">
                      <strong>{unit.unitNumber}</strong>
                      <small>
                        {unit.purpose === "AMENITY"
                          ? unit.unitNumber.trim().toLowerCase() ===
                            getUnitTypeLabel(unit.unitType, unit.publicMetadata)
                              .trim()
                              .toLowerCase()
                            ? "Shared amenity"
                            : getUnitTypeLabel(unit.unitType, unit.publicMetadata)
                          : <>{areaLabel(unit)} <span>·</span> {getUnitTypeLabel(unit.unitType, unit.publicMetadata)}</>}
                      </small>
                    </span>
                    <span className="public-unit-side">
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
                        <>
                          {unit.publicMetadata?.category && (
                            <span
                              className="public-category-badge"
                              style={{
                                backgroundColor:
                                  UNIT_CATEGORY_PRESENTATION[
                                    unit.publicMetadata.category
                                  ].fill,
                                color:
                                  UNIT_CATEGORY_PRESENTATION[
                                    unit.publicMetadata.category
                                  ].text,
                              }}
                            >
                              {UNIT_CATEGORY_PRESENTATION[
                                unit.publicMetadata.category
                              ].label}
                            </span>
                          )}
                          <Badge
                            style={{
                              backgroundColor: UNIT_STATUS_PRESENTATION[unit.status].fill,
                              color: UNIT_STATUS_PRESENTATION[unit.status].text,
                            }}
                          >
                            {UNIT_STATUS_PRESENTATION[unit.status].label}
                          </Badge>
                          <small>{priceLabel(unit)}</small>
                        </>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="public-empty-units">
                <span>⌕</span>
                <strong>No units found</strong>
                <p>Try a different search or status filter.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("ALL");
                    setCategoryFilter("ALL");
                    setSelectedId(undefined);
                  }}
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
          <div className="public-contact">
            <p>Need help choosing a property?</p>
            <a href={`mailto:${contactEmail}`}>
              Talk to our sales team <span aria-hidden="true">→</span>
            </a>
          </div>
        </aside>
      </div>
      <dialog
        ref={dialogRef}
        className="public-enquiry-dialog"
        aria-labelledby="enquiry-dialog-title"
        onClose={() => setEnquiryOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) closeEnquiry();
        }}
      >
        <button
          type="button"
          className="enquiry-dialog-close"
          aria-label="Close enquiry form"
          onClick={closeEnquiry}
        >
          ×
        </button>
        {selected &&
          (enquiryPrepared ? (
            <div className="enquiry-confirmation">
              <span className="enquiry-confirmation-icon">✓</span>
              <p className="public-section-label">ENQUIRY READY</p>
              <h2 id="enquiry-dialog-title">Your email app should open</h2>
              <p>
                Your message for <strong>{selected.unitNumber}</strong> is
                ready. Send it from your email app to complete the enquiry.
              </p>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
              <button
                type="button"
                className="map-enquiry-button"
                onClick={closeEnquiry}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="public-section-label">PROPERTY ENQUIRY</p>
              <h2 id="enquiry-dialog-title">Ask about {selected.unitNumber}</h2>
              <p className="enquiry-dialog-intro">
                Share your details and we’ll prepare an enquiry with this unit’s
                information.
              </p>
              <div className="enquiry-unit-summary">
                <strong>{selected.unitNumber}</strong>
                <span>
                  {areaLabel(selected)} · {priceLabel(selected)}
                </span>
              </div>
              <form className="enquiry-form" onSubmit={submitEnquiry}>
                <label>
                  Your name
                  <input
                    required
                    minLength={2}
                    maxLength={160}
                    autoComplete="name"
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Full name"
                  />
                </label>
                <label>
                  Email address
                  <input
                    required
                    type="email"
                    maxLength={320}
                    autoComplete="email"
                    value={customerEmail}
                    onChange={(event) => setCustomerEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>
                <label>
                  Mobile number{" "}
                  <span className="enquiry-optional">Optional</span>
                  <input
                    required={preferredContact === "PHONE"}
                    type="tel"
                    maxLength={32}
                    autoComplete="tel"
                    value={customerPhone}
                    onChange={(event) => setCustomerPhone(event.target.value)}
                    placeholder="Include country code"
                  />
                </label>
                <label>
                  Preferred contact
                  <select
                    value={preferredContact}
                    onChange={(event) =>
                      setPreferredContact(
                        event.target.value as "EMAIL" | "PHONE",
                      )
                    }
                  >
                    <option value="EMAIL">Email</option>
                    <option value="PHONE">Phone</option>
                  </select>
                </label>
                <label className="enquiry-message-label">
                  Message
                  <textarea
                    rows={3}
                    maxLength={1200}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Tell us what you’d like to know"
                  />
                </label>
                <p className="enquiry-privacy-note">
                  Your details will be included in an email to the project sales
                  team.
                </p>
                <button type="submit" className="map-enquiry-button">
                  Prepare enquiry email <span aria-hidden="true">→</span>
                </button>
              </form>
            </>
          ))}
      </dialog>
      <footer className="public-footer">
        <span>Presented by VStudio</span>
        <span>Availability may change. Contact sales to confirm.</span>
      </footer>
    </>
  );
  return <main className={shellClass}>{content}</main>;
}
