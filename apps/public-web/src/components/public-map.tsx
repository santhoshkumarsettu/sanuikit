"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { vstudioApi, type PublicInventoryUnit } from "@vstudio/api-client";
import { InteractiveMap, type MapShape } from "@vstudio/map-engine";
import {
  UNIT_CATEGORY_PRESENTATION,
  UNIT_PURPOSE_PRESENTATION,
  UNIT_STATUS_PRESENTATION,
  type AreaUnit,
  type UnitCategory,
  type UnitStatus,
} from "@vstudio/types";
import { formatArea, formatCurrency, getUnitTypeLabel } from "@vstudio/utils";
import { Badge, Button, ThemeSwitcher } from "sanui";
import { usePublicAppearance } from "./providers";

const projectTabs = [
  { id: "site-plan", label: "Site Plan" },
  { id: "media", label: "Media" },
  { id: "about", label: "About" },
] as const;

type ProjectTab = (typeof projectTabs)[number]["id"];
type StatusFilter = "ALL" | "AMENITIES" | UnitStatus;
type UnitSort = "number" | "price-asc" | "price-desc" | "area-asc" | "area-desc";

const unitNumbers = new Intl.Collator("en-IN", { numeric: true, sensitivity: "base" });
const squareMetersPerUnit: Record<AreaUnit, number> = {
  SQFT: 0.09290304,
  SQM: 1,
  ACRE: 4046.8564224,
  HECTARE: 10_000,
};

function compareMeasurements(left: number | null, right: number | null, descending: boolean) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return descending ? right - left : left - right;
}

function compareUnits(left: PublicInventoryUnit, right: PublicInventoryUnit, sort: UnitSort) {
  const byNumber = unitNumbers.compare(left.unitNumber, right.unitNumber);
  if (sort === "price-asc" || sort === "price-desc") {
    const leftPrice = left.price || null;
    const rightPrice = right.price || null;
    // Group displayed prices by currency before comparing their amounts.
    if (leftPrice !== null && rightPrice !== null && left.currency !== right.currency)
      return left.currency.localeCompare(right.currency);
    return compareMeasurements(leftPrice, rightPrice, sort === "price-desc") || byNumber;
  }
  if (sort === "area-asc" || sort === "area-desc") {
    const leftArea = left.area === null ? null : left.area * squareMetersPerUnit[left.areaUnit];
    const rightArea = right.area === null ? null : right.area * squareMetersPerUnit[right.areaUnit];
    return compareMeasurements(leftArea, rightArea, sort === "area-desc") || byNumber;
  }
  return byNumber;
}

export function PublicMap({
  slug,
  embedded = false,
}: {
  slug: string;
  embedded?: boolean;
}) {
  const { family, setFamily } = usePublicAppearance();
  const [activeTab, setActiveTab] = useState<ProjectTab>("site-plan");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | UnitCategory>("ALL");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [unitSort, setUnitSort] = useState<UnitSort>("number");
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [revealShape, setRevealShape] = useState<{ id: string }>();
  const [hoveredId, setHoveredId] = useState<string>();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [failedLogoUrl, setFailedLogoUrl] = useState<string>();
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
  const finderHeadingRef = useRef<HTMLHeadingElement>(null);
  const unitListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (embedded) return;
    const syncTab = () => {
      const tab = projectTabs.find(({ id }) => `#${id}` === window.location.hash);
      setActiveTab(tab?.id ?? "site-plan");
    };
    syncTab();
    window.addEventListener("hashchange", syncTab);
    return () => window.removeEventListener("hashchange", syncTab);
  }, [embedded, slug]);

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
  useEffect(() => {
    unitListRef.current?.scrollTo({ top: 0 });
  }, [query.data, selectedLayoutId, search, statusFilter, categoryFilter, unitSort]);
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
  const projectInitials =
    project.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase() || "P";
  const allUnits = remote.units as PublicInventoryUnit[];
  const layout =
    remote.layouts.find((item) => item.id === selectedLayoutId) ??
    remote.layouts[0];
  const publishedImages = remote.layouts.flatMap(({ assetUrl, ...item }) =>
    assetUrl ? [{ ...item, assetUrl }] : [],
  );
  const saleUnits = allUnits.filter((unit) => unit.purpose === "SALE");
  const amenityUnits = allUnits.filter((unit) => unit.purpose === "AMENITY");
  const availableCount = saleUnits.filter((unit) => unit.status === "AVAILABLE").length;
  const reservedCount = saleUnits.filter((unit) => unit.status === "RESERVED").length;
  const layoutUnits = layout
    ? allUnits.filter((unit) => unit.layoutId === layout.id)
    : [];
  const layoutAmenityCount = layoutUnits.filter((unit) => unit.purpose === "AMENITY").length;
  const layoutSaleCount = layoutUnits.length - layoutAmenityCount;
  const layoutCountLabel = [
    (layoutSaleCount > 0 || !layoutAmenityCount) &&
    `${layoutSaleCount} ${layoutSaleCount === 1 ? "unit" : "units"}`,
    layoutAmenityCount > 0 &&
    `${layoutAmenityCount} ${layoutAmenityCount === 1 ? "amenity" : "amenities"}`,
  ].filter(Boolean).join(" · ");
  const statusOptions = (
    Object.keys(UNIT_STATUS_PRESENTATION) as UnitStatus[]
  ).filter((status) =>
    layoutUnits.some((unit) => unit.purpose === "SALE" && unit.status === status),
  );
  const primaryStatuses: StatusFilter[] = [
    "ALL",
    ...statusOptions.filter((status) => status === "AVAILABLE" || status === "RESERVED"),
  ];
  const extraStatuses: StatusFilter[] = [
    ...statusOptions.filter((status) => status !== "AVAILABLE" && status !== "RESERVED"),
    "AMENITIES",
  ];
  const categoryOrder: UnitCategory[] = ["GOLD", "PLATINUM", "SILVER", "REGULAR"];
  const categoryOptions = categoryOrder.filter((category) =>
    layoutUnits.some(
      (unit) =>
        unit.purpose === "SALE" && unit.publicMetadata?.category === category,
    ),
  );
  const countForStatusFilter = (filter: StatusFilter) =>
    filter === "ALL"
      ? layoutUnits.length
      : filter === "AMENITIES"
        ? layoutAmenityCount
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
  const sortedUnits = [...visibleUnits].sort((left, right) => compareUnits(left, right, unitSort));
  const canSortByPrice = layoutUnits.some((unit) => (unit.price ?? 0) > 0);
  const canSortByArea = layoutUnits.some((unit) => unit.area !== null);
  const hasActiveMapFilter =
    statusFilter !== "ALL" || categoryFilter !== "ALL" || Boolean(search.trim());
  const hasVisibleAmenities = visibleUnits.some(
    (unit) => unit.purpose === "AMENITY",
  );
  const visibleUnitIds = new Set(visibleUnits.map((unit) => unit.id));
  const activeFilterLabel = [
    statusFilter === "ALL"
      ? undefined
      : statusFilter === "AMENITIES"
        ? "Amenities"
        : UNIT_STATUS_PRESENTATION[statusFilter].label,
    categoryFilter === "ALL"
      ? undefined
      : UNIT_CATEGORY_PRESENTATION[categoryFilter].label,
    search.trim() ? `“${search.trim()}”` : undefined,
  ].filter(Boolean).join(" · ");
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
  const contactEmail = project.publicConfig?.contactEmail?.trim();
  const contactPhone = project.publicConfig?.contactPhone?.replace(/[^\d+]/g, "");
  const allowEnquiries = project.publicConfig?.allowEnquiries !== false;
  const salesHref = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${project.name}`)}`
    : contactPhone ? `tel:${contactPhone}` : undefined;
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
    if (!allowEnquiries || !contactEmail) return;
    if (activeUnit) setSelectedId(activeUnit.id);
    setHoveredId(undefined);
    setEnquiryPrepared(false);
    setEnquiryOpen(true);
  };
  const closeEnquiry = () => setEnquiryOpen(false);
  const submitEnquiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || selected.purpose === "AMENITY" || !allowEnquiries || !contactEmail) return;
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
  const goToFinder = () => {
    const heading = finderHeadingRef.current;
    heading?.focus({ preventScroll: true });
    heading?.scrollIntoView({ block: "start" });
  };
  const selectFromMap = (id?: string) => {
    setSelectedId(id);
    setHoveredId(undefined);
    if (!id || isFullscreen) return;

    const list = unitListRef.current;
    const card = list?.querySelector<HTMLButtonElement>(`[data-unit-id="${CSS.escape(id)}"]`);
    if (!list || !card) return;
    const listBounds = list.getBoundingClientRect();
    const cardBounds = card.getBoundingClientRect();
    if (cardBounds.top < listBounds.top)
      list.scrollTop += cardBounds.top - listBounds.top - 3;
    else if (cardBounds.bottom > listBounds.bottom)
      list.scrollTop += cardBounds.bottom - listBounds.bottom + 3;
  };
  const selectFromFinder = (id: string) => {
    setSelectedId(id);
    setHoveredId(undefined);
    setRevealShape({ id });

    const canvas = mapCardRef.current?.querySelector<SVGSVGElement>(".vstudio-map__svg");
    const bounds = canvas?.getBoundingClientRect();
    if (bounds && (bounds.bottom <= 0 || bounds.top >= window.innerHeight)) {
      canvas?.focus({ preventScroll: true });
      canvas?.scrollIntoView({ block: "start" });
    }
  };
  const renderStatusFilter = (filter: StatusFilter) => {
    const isActive = statusFilter === filter && (filter !== "ALL" || categoryFilter === "ALL");
    const presentation = filter === "ALL"
      ? undefined
      : filter === "AMENITIES"
        ? UNIT_PURPOSE_PRESENTATION.AMENITY
        : UNIT_STATUS_PRESENTATION[filter];
    const filterStyle = presentation && {
      "--public-filter-fill": presentation.fill,
      "--public-filter-border": filter === "AMENITIES"
        ? UNIT_PURPOSE_PRESENTATION.AMENITY.stroke : presentation.text,
      "--public-filter-ink": presentation.text,
    } as CSSProperties;
    return (
      <button
        type="button"
        key={filter}
        aria-pressed={isActive}
        className={`public-filter${filter === "AMENITIES" ? " public-filter--amenity" : ""}${isActive ? " is-active" : ""}`}
        style={filterStyle}
        onClick={() => {
          setStatusFilter(filter);
          if (filter === "ALL" || filter === "AMENITIES") setCategoryFilter("ALL");
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
        {presentation && (
          <i
            aria-hidden="true"
            style={{
              backgroundColor: filter === "AMENITIES"
                ? UNIT_PURPOSE_PRESENTATION.AMENITY.stroke : presentation.fill
            }}
          />
        )}
        {filter === "ALL" ? "All" : filter === "AMENITIES" ? "Amenities" : presentation?.label}
        <span className="public-filter-count">
          {countForStatusFilter(filter)}
        </span>
      </button>
    );
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
        {activeUnit.purpose === "SALE" && (contactEmail || contactPhone) && (
          <div className="map-callout-actions">
            {allowEnquiries && contactEmail && (
              <button
                type="button"
                className="map-enquiry-button"
                onClick={startEnquiry}
              >
                Enquire about this unit <span aria-hidden="true">→</span>
              </button>
            )}
            <div className="map-contact-links">
              {contactEmail && (
                <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Enquiry about ${activeUnit.unitNumber}`)}`}>
                  Email
                </a>
              )}
              {contactPhone && (
                <a href={`tel:${contactPhone}`}>Call sales</a>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  ) : null;
  const selectProjectTab = (tab: ProjectTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    window.history.replaceState(null, "", `#${tab}`);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const handleProjectTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = projectTabs.findIndex(({ id }) => id === activeTab);
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
        nextIndex = (index + 1) % projectTabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (index + projectTabs.length - 1) % projectTabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = projectTabs.length - 1;
        break;
      default:
        return;
    }

    const nextTab = projectTabs[nextIndex];
    if (!nextTab) return;
    event.preventDefault();
    event.currentTarget
      .querySelector<HTMLButtonElement>(`#${nextTab.id}-tab`)
      ?.focus({ preventScroll: true });
    selectProjectTab(nextTab.id);
  };
  const projectLocation = project.location && (
    <p className="public-project-location">{project.location}</p>
  );
  const projectDescription = project.description && (
    <p className="public-project-description">{project.description}</p>
  );
  const availabilitySummary = (
    <dl className="public-stat-grid" aria-label="Unit availability summary">
      <div className="public-stat">
        <dt>
          <span className="public-stat-dot" aria-hidden="true" />
          Available
        </dt>
        <dd>{availableCount}</dd>
      </div>
      <div className="public-stat">
        <dt>
          <span className="public-stat-dot reserved" aria-hidden="true" />
          Reserved
        </dt>
        <dd>{reservedCount}</dd>
      </div>
      <div className="public-stat">
        <dt>Sale units</dt>
        <dd>{saleUnits.length}</dd>
      </div>
      <div className="public-stat">
        <dt>
          <span className="public-stat-dot amenity" aria-hidden="true" />
          Amenities
        </dt>
        <dd>{amenityUnits.length}</dd>
      </div>
    </dl>
  );
  const content = (
    <>
      <header className="public-header">
        <div className="public-header-left">
          <Link className="public-logo" href="/">
            <span>V</span> VStudio
          </Link>
          <div className="public-header-project">
            <span className="public-project-avatar" aria-hidden="true">
              {project.logoUrl && project.logoUrl !== failedLogoUrl ? (
                <Image
                  src={project.logoUrl}
                  alt=""
                  width={38}
                  height={38}
                  unoptimized
                  onError={() => setFailedLogoUrl(project.logoUrl)}
                />
              ) : projectInitials}
            </span>
            <div className="public-header-project-details">
              <h1 id="public-project-title">{project.name}</h1>
              {projectLocation}
            </div>
          </div>
          {!embedded && (
            <div
              className="public-section-nav"
              role="tablist"
              aria-label="Project sections"
              onKeyDown={handleProjectTabKeyDown}
            >
              {projectTabs.map(({ id, label }) => (
                <button
                  key={id}
                  id={`${id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={id === activeTab}
                  aria-controls={id}
                  tabIndex={id === activeTab ? 0 : -1}
                  onClick={() => selectProjectTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="public-header-right">
          <span className="public-live-indicator">
            <i /> Project availability
          </span>
          {!embedded && (
            <ThemeSwitcher
              className="public-theme-switcher"
              value={family}
              onChange={setFamily}
            />
          )}
          {allowEnquiries && salesHref && (
            <Button
              variant="secondary"
              onClick={() => window.location.assign(salesHref)}
            >
              Contact sales
            </Button>
          )}
        </div>
      </header>
      <div
        className="public-main-layout"
        id={embedded ? undefined : "site-plan"}
        role={embedded ? undefined : "tabpanel"}
        aria-labelledby={embedded ? undefined : "site-plan-tab"}
        tabIndex={embedded ? undefined : 0}
        hidden={!embedded && activeTab !== "site-plan"}
      >
        <section
          id={embedded ? "site-plan" : undefined}
          ref={mapCardRef}
          className="public-card public-map"
          style={layout ? { "--layout-aspect": `${layout.width} / ${layout.height}` } as CSSProperties : undefined}
          aria-labelledby={
            isFullscreen
              ? "public-site-plan-title"
              : "public-project-title public-site-plan-title"
          }
        >
          <header className="public-map-header" id={embedded ? "about" : undefined}>
            <p className="public-map-eyebrow">
              {isFullscreen ? "Interactive site plan" : (
                <>Property collection <span aria-hidden="true">/</span> <strong>Site plan</strong></>
              )}
            </p>
            <h2 id="public-site-plan-title">{layout?.name || "Site plan"}</h2>
            {layout && (
              <>
                <div className="public-map-summary">
                  <span>
                    {hasActiveMapFilter
                      ? `${visibleUnits.length} of ${layoutUnits.length} results`
                      : layoutCountLabel}
                  </span>
                  {activeFilterLabel && <small title={activeFilterLabel}>{activeFilterLabel}</small>}
                </div>
                <button type="button" className="public-find-unit" onClick={goToFinder}>
                  Find a unit <span aria-hidden="true">↓</span>
                </button>
              </>
            )}
            {embedded && projectDescription}
          </header>
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
                    setRevealShape(undefined);
                    setHoveredId(undefined);
                    setSearch("");
                    setStatusFilter("ALL");
                    setCategoryFilter("ALL");
                    setUnitSort("number");
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
            <div className="public-map-filters">
              <div className="public-filter-row" role="group" aria-label="Unit status filters">
                {primaryStatuses.map(renderStatusFilter)}
                <button
                  type="button"
                  className="public-filter public-more-filters"
                  aria-expanded={moreFiltersOpen}
                  aria-controls="public-extra-filters"
                  onClick={() => setMoreFiltersOpen((open) => !open)}
                >
                  More filters <span aria-hidden="true">{moreFiltersOpen ? "−" : "+"}</span>
                </button>
              </div>
              <div
                id="public-extra-filters"
                className="public-filter-row"
                role="group"
                aria-label="Additional unit and amenity filters"
                hidden={!moreFiltersOpen}
              >
                {extraStatuses.map(renderStatusFilter)}
                {categoryOptions.length > 0 && (
                  <>
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
                key={layout.id}
                width={layout.width}
                height={layout.height}
                backgroundUrl={layout.assetUrl}
                shapes={shapes}
                selectedId={hoveredId ?? selectedId}
                revealShape={revealShape}
                preserveAspectRatio
                fitOnFullscreenChange
                allowPageScroll
                touchHint="Tap a plot or amenity for details. Use + and − to zoom."
                selectionPopover={selectionPopover}
                tool="select"
                isFullscreen={isFullscreen}
                onFullscreenToggle={() => void toggleFullscreen()}
                onSelect={selectFromMap}
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
        <section className="public-card public-inventory" aria-labelledby="public-inventory-title">
          <header className="public-card-head">
            <div>
              <span className="public-section-label">FIND YOUR PROPERTY</span>
              <div className="public-inventory-title">
                <h2 id="public-inventory-title" ref={finderHeadingRef} tabIndex={-1}>
                  Units &amp; amenities
                </h2>
                <span className="public-inventory-count" aria-live="polite">
                  {visibleUnits.length} {visibleUnits.length === 1 ? "result" : "results"}
                </span>
              </div>
            </div>
          </header>
          <div className="public-details">
            <label className="public-search-wrap">
              <span className="public-search-icon" aria-hidden="true" />
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
            <label className="public-unit-sort">
              <span>Sort by</span>
              <select value={unitSort} onChange={(event) => setUnitSort(event.target.value as UnitSort)}>
                <option value="number">Unit number</option>
                <option value="price-asc" disabled={!canSortByPrice}>Price (low to high)</option>
                <option value="price-desc" disabled={!canSortByPrice}>Price (high to low)</option>
                <option value="area-asc" disabled={!canSortByArea}>Area (small to large)</option>
                <option value="area-desc" disabled={!canSortByArea}>Area (large to small)</option>
              </select>
            </label>
            {sortedUnits.length ? (
              <div
                ref={unitListRef}
                className="public-unit-list"
                role="region"
                aria-label="Property units and amenities"
                tabIndex={0}
              >
                {sortedUnits.map((unit) => (
                  <button
                    type="button"
                    key={unit.id}
                    data-unit-id={unit.id}
                    aria-pressed={unit.id === selectedId}
                    className={`public-unit-button${unit.id === selectedId ? " is-active" : ""}${unit.purpose === "AMENITY" ? " is-amenity" : ""}`}
                    onClick={() => selectFromFinder(unit.id)}
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
                      <span className="public-unit-badges">
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
                          </>
                        )}
                      </span>
                      {unit.purpose !== "AMENITY" && (
                        <small>{priceLabel(unit)}</small>
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
          {salesHref && (
            <div className="public-contact">
              <a href={salesHref}>
                Talk to our sales team <span aria-hidden="true">→</span>
              </a>
            </div>
          )}
        </section>
      </div>
      {!embedded && (
        <>
          <section
            id="media"
            className="public-card public-project-media"
            role="tabpanel"
            aria-labelledby="media-tab"
            tabIndex={0}
            hidden={activeTab !== "media"}
          >
            <div className="public-card-head">
              <h1>Media</h1>
            </div>
            {publishedImages.length ? (
              <ul className="public-media-grid">
                {publishedImages.map((image) => (
                  <li key={image.id}>
                    <a href={image.assetUrl} target="_blank" rel="noreferrer">
                      <Image
                        src={image.assetUrl}
                        alt=""
                        width={image.width}
                        height={image.height}
                        unoptimized
                      />
                      <span>{image.name}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="public-media-empty">No media has been published for this project yet.</p>
            )}
          </section>
          <section
            id="about"
            className="public-card public-hero public-project-about"
            role="tabpanel"
            aria-labelledby="about-tab"
            tabIndex={0}
            hidden={activeTab !== "about"}
          >
            <div className="public-project-heading">
              <h1>About {project.name}</h1>
              {projectLocation}
              {projectDescription}
              {allowEnquiries && salesHref && (
                <div className="public-about-sales" aria-label="Sales contact">
                  {contactEmail && <a href={salesHref}>Email sales</a>}
                  {contactPhone && <a href={`tel:${contactPhone}`}>Call sales</a>}
                </div>
              )}
            </div>
            {availabilitySummary}
          </section>
        </>
      )}
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
        {selected && contactEmail &&
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
        <span>{salesHref ? "Availability may change. Contact sales to confirm." : "Availability may change."}</span>
      </footer>
    </>
  );
  return <main className={shellClass}>{content}</main>;
}
