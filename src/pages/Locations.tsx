import {
  Empty as EmptyState,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useWorkspace } from "../lib/context";
import { PageTitle, Status } from "../components/ui";
import { StoreVisualization } from "../components/StoreVisualization";
import {
  getFloorPlan,
  measureFloorStock,
  shelfAddress,
} from "../lib/floor-plan";
import { storeSummary } from "../lib/store-layout";
import { restockRoute } from "../lib/sorting";
import type { Location, Unit } from "../lib/types";

type Destination = { kind: "aisle" | "location"; id: string };
const format = (value: number) => value.toLocaleString();

function configuredLocationLabel(location: Location) {
  return /^G[1-7]-BAY-\d+$/.test(location.id)
    ? "Storage group " + location.id
    : [location.aisle, location.rack, location.shelf]
        .filter(Boolean)
        .join(" · ");
}

function DestinationUnits({
  title,
  units,
  openProduct,
}: {
  title: string;
  units: Unit[];
  openProduct: (productId: string, unitId: string) => void;
}) {
  return (
    <>
      <h3 className="subheading">{title}</h3>
      {units.length ? (
        <ItemGroup className="gap-0" aria-label={title}>
          {units.map((unit) => (
            <div role="listitem" key={unit.id}>
              <Item className="location-item">
                <ItemContent className="min-w-0">
                  <ItemTitle>{unit.product_id}</ItemTitle>
                  <ItemDescription className="line-clamp-none text-xs mono break-all">
                    {unit.id}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Status value={unit.status} />
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`View unit ${unit.id}`}
                    onClick={() => openProduct(unit.product_id, unit.id)}
                  >
                    View unit
                  </Button>
                </ItemActions>
              </Item>
            </div>
          ))}
        </ItemGroup>
      ) : (
        <p className="hint">No recorded units to show.</p>
      )}
    </>
  );
}

export function Locations() {
  const { data, openProduct } = useWorkspace();
  const [selection, setSelection] = useState<Destination | null>(null);
  const [view, setView] = useState<"floor" | "grid">("floor");
  const [detailLimit, setDetailLimit] = useState(20);
  const [department, setDepartment] = useState("");
  const [floorDepartment, setFloorDepartment] = useState(
    "Dry Grocery & Snacks",
  );

  const detailHeading = useRef<HTMLHeadingElement>(null);
  const schematicHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selection) {
      detailHeading.current?.focus({ preventScroll: true });
      detailHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [selection]);

  const plan = getFloorPlan(data.master);
  const floorStock = useMemo(
    () =>
      measureFloorStock(data.master, plan, data.units, data.stock.byProduct),
    [data.master, plan, data.units, data.stock.byProduct],
  );
  const locations = data.master.locations.filter(
    (location) => !department || location.department === department,
  );
  const location =
    selection?.kind === "location"
      ? locations.find((item) => item.id === selection.id)
      : undefined;
  const aisle =
    selection?.kind === "aisle" ? plan.byAisle.get(selection.id) : undefined;
  const summary = storeSummary(locations, data.units, data.stock.byLocation);
  const onHand = department
    ? (floorStock.byDepartment.get(department)?.onHand ?? 0)
    : floorStock.total.onHand;
  const variants = department
    ? (plan.departments.find((item) => item.name === department)?.variants ?? 0)
    : plan.byProduct.size;

  const currentLoad = summary.loads.find((load) => load.id === location?.id);
  const aisleStock = aisle && floorStock.byAisle.get(aisle.id);
  const assignedProducts =
    aisle?.products ??
    (location
      ? data.master.products.filter((p) => p.locationId === location.id)
      : []);
  const assignedHomes = new Map(
    assignedProducts.map((p) => [p.id, p.locationId]),
  );
  const aisleLocationIds =
    aisle &&
    new Set(
      data.master.locations
        .filter((l) => l.department === aisle.department)
        .map((l) => l.id),
    );
  const confirmed = data.units.filter(
    (unit) =>
      unit.current_location_id &&
      (location
        ? unit.current_location_id === location.id
        : aisleLocationIds?.has(unit.current_location_id) &&
          assignedHomes.has(unit.product_id)),
  );
  const reservations = restockRoute(data.units).filter((u) =>
    location
      ? u.destination_id === location.id
      : aisle && assignedHomes.get(u.product_id) === u.destination_id,
  );
  const placedByProduct = new Map<string, number>();
  if (location) {
    for (const lot of data.stock.byProduct.values()) {
      if (lot.location_id === location.id)
        placedByProduct.set(lot.product_id, lot.remaining);
    }
    for (const unit of confirmed)
      placedByProduct.set(
        unit.product_id,
        (placedByProduct.get(unit.product_id) ?? 0) + 1,
      );
  }
  const facts =
    aisle && aisleStock
      ? [
          [
            "Showroom run",
            `${aisle.lengthFeet} ft · ${aisle.bays} four-foot ${aisle.bays === 1 ? "bay" : "bays"}`,
          ],
          ["Shelf positions", format(aisle.shelfUnits)],
          ["On shelves (est.)", format(aisleStock.shelf)],
          ["Backstock (est.)", format(aisleStock.backstock)],
          ["Awaiting placement", format(aisleStock.staging)],
        ]
      : currentLoad
        ? [
            [
              "Configured unit slots",
              currentLoad.capacity === null
                ? "Unlimited"
                : format(currentLoad.capacity),
            ],
            ["Confirmed units", format(currentLoad.confirmed)],
            ["Reserved units", format(currentLoad.reserved)],
          ]
        : [];

  function choose(destination: Destination) {
    setSelection(destination);
    setDetailLimit(20);
  }
  function changeView(next: "floor" | "grid") {
    if (next !== view) setSelection(null);
    setView(next);
  }
  return (
    <>
      <PageTitle
        eyebrow="DESTINATIONS & CAPACITY"
        title="Store locations"
        description="Explore the modeled sales floor and check recorded placements and reservations."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            role="link"
            render={<Link to="/master" />}
          >
            Manage locations
          </Button>
        }
      />
      <div className="store-overview" aria-label="Store capacity summary">
        {[
          {
            label: "ITEMS ON HAND",
            value: format(onHand),
            note: format(variants) + " product variants",
          },
          {
            label: "TOTAL CAPACITY",
            value: format(summary.capacity) + (summary.unlimited ? "+" : ""),
            note: "configured unit slots",
          },
          {
            label: "ALREADY SORTED",
            value: format(summary.placed),
            note: "recorded placements",
          },
          {
            label: "RESERVED",
            value: format(summary.reserved),
            note: "queued for restocking",
          },
          {
            label: "AVAILABLE",
            value: format(summary.available),
            note: "uncommitted slots",
          },
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
      <div className="map-layout">
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2
              ref={schematicHeading}
              tabIndex={-1}
              className="location-focus-heading"
            >
              Store schematic
            </h2>
            <NativeSelect
              aria-label="Department filter"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setSelection(null);
              }}
            >
              <NativeSelectOption value="">All departments</NativeSelectOption>
              {plan.departments.map(({ name }) => (
                <NativeSelectOption key={name} value={name}>
                  {name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div
            className="store-view-controls"
            role="group"
            aria-label="Store view"
          >
            <Button
              type="button"
              variant={view === "floor" ? "default" : "outline"}
              aria-pressed={view === "floor"}
              onClick={() => changeView("floor")}
            >
              Floor plan
            </Button>
            <Button
              type="button"
              variant={view === "grid" ? "default" : "outline"}
              aria-pressed={view === "grid"}
              onClick={() => changeView("grid")}
            >
              Capacity grid
            </Button>
          </div>
          {view === "floor" ? (
            <StoreVisualization
              plan={plan}
              stock={floorStock}
              department={department || floorDepartment}
              selectedAisle={aisle?.id}
              onChooseDepartment={(name) => {
                setFloorDepartment(name);
                if (department) setDepartment(name);
                setSelection(null);
              }}
              onChooseAisle={(id) => choose({ kind: "aisle", id })}
            />
          ) : (
            <div className="map-floor">
              <p className="hint capacity-explainer">
                These storage groups hold recorded placements and reservations.
                Each grocery group can include shelf space and backstock across
                multiple fixtures.
              </p>
              <div className="location-grid">
                {summary.loads.map((load) => {
                  const full =
                    load.capacity !== null && load.committed >= load.capacity;
                  return (
                    <Card
                      key={load.id}
                      className={`map-location gap-0 py-0 ring-0 ${location?.id === load.id ? "selected" : ""} ${full ? "at-capacity" : ""}`}
                    >
                      <small>{load.department}</small>
                      <strong>{configuredLocationLabel(load)}</strong>
                      <span>
                        {!/^G[1-7]-BAY-\d+$/.test(load.id)
                          ? load.id
                          : "Shelf space and backstock"}
                      </span>
                      <Progress
                        className="capacity-bar"
                        aria-label={`${load.id} capacity used`}
                        value={
                          load.capacity
                            ? Math.min(
                                100,
                                (load.committed / load.capacity) * 100,
                              )
                            : 0
                        }
                      />
                      <small>
                        {format(load.confirmed)} placed ·{" "}
                        {format(load.reserved)} reserved /{" "}
                        {load.capacity === null ? "∞" : format(load.capacity)}
                      </small>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        aria-label={`${location?.id === load.id ? "Selected" : "Select"} ${load.id}`}
                        aria-pressed={location?.id === load.id}
                        onClick={() =>
                          choose({ kind: "location", id: load.id })
                        }
                      >
                        {location?.id === load.id ? "Selected" : "Select"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
              <div className="map-legend">
                <span>
                  <i /> Space available
                </span>
                <span>
                  <i className="amber" /> At capacity
                </span>
                <span>
                  <i className="indigo" /> Selected destination
                </span>
              </div>
            </div>
          )}
        </Card>
        <Card className="panel destination-details gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2
              ref={detailHeading}
              tabIndex={-1}
              className="location-focus-heading"
            >
              Destination details
            </h2>
            {(aisle || location) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  schematicHeading.current?.focus({ preventScroll: true });
                  schematicHeading.current?.scrollIntoView({ block: "start" });
                }}
              >
                Back to store schematic
              </Button>
            )}
          </div>
          {aisle || location ? (
            <>
              <span className="eyebrow">
                {aisle?.department ?? location?.department}
              </span>
              <h3 className="location-title">
                {aisle
                  ? `Aisle ${aisle.id}`
                  : configuredLocationLabel(location!)}
              </h3>
              <dl className="facts">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt>
                      <small>{label}</small>
                    </dt>
                    <dd>
                      <strong>{value}</strong>
                    </dd>
                  </div>
                ))}
              </dl>
              <h3 className="subheading">Assigned products</h3>
              {assignedProducts.length ? (
                <ItemGroup className="gap-0" aria-label="Assigned products">
                  {assignedProducts.slice(0, detailLimit).map((product) => {
                    const address = aisle && plan.byProduct.get(product.id);
                    return (
                      <div role="listitem" key={product.id}>
                        <Item className="location-item">
                          <ItemContent className="min-w-0">
                            <ItemTitle className="line-clamp-none block w-full break-words text-left">
                              {product.name}
                            </ItemTitle>
                            <ItemDescription className="line-clamp-none text-xs mono break-words">
                              {product.id} ·{" "}
                              {address
                                ? shelfAddress(address)
                                : `${format(placedByProduct.get(product.id) ?? 0)} placed`}
                            </ItemDescription>
                          </ItemContent>
                          <ItemActions>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`View product: ${product.name} (${product.id})`}
                              onClick={() => openProduct(product.id)}
                            >
                              View product
                            </Button>
                          </ItemActions>
                        </Item>
                      </div>
                    );
                  })}
                </ItemGroup>
              ) : (
                <p className="hint">No products are assigned here.</p>
              )}
              {assignedProducts.length > detailLimit && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => setDetailLimit((limit) => limit + 30)}
                >
                  Show more assigned products
                </Button>
              )}
              <DestinationUnits
                title="Restock reservations"
                units={reservations}
                openProduct={openProduct}
              />
              <DestinationUnits
                title="Last confirmed placements"
                units={confirmed}
                openProduct={openProduct}
              />
            </>
          ) : (
            <EmptyState className="calm-empty">
              <EmptyHeader>
                <EmptyTitle>Choose a destination.</EmptyTitle>
                <EmptyDescription>
                  Select an aisle on the floor plan or a storage group in
                  Capacity grid.
                </EmptyDescription>
              </EmptyHeader>
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
