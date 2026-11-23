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
import { useEffect, useRef, useState } from "react";

import { Link } from "@tanstack/react-router";
import { useWorkspace } from "../lib/context";
import { PageTitle, Status } from "../components/ui";
import { StoreVisualization } from "../components/StoreVisualization";
import { isOnHand } from "../lib/opening-stock";
import { storeSummary } from "../lib/store-layout";
import { locationLoad, restockRoute } from "../lib/sorting";
export function Locations() {
  const { data, openProduct } = useWorkspace(),
    [selected, setSelected] = useState(""),
    [view, setView] = useState("floor"),
    [detailLimit, setDetailLimit] = useState(20),
    [department, setDepartment] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const schematicHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (selected && matchMedia("(max-width: 1100px)").matches) {
      detailHeading.current?.focus({ preventScroll: true });
      detailHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [selected]);
  const locations = data.master.locations.filter(
      (l) => !department || l.department === department,
    ),
    location = data.master.locations.find((l) => l.id === selected);
  const summary = storeSummary(locations, data.units, data.stock.byLocation);
  const ids = new Set(locations.map((l) => l.id));
  const onHand =
    locations.reduce((sum, l) => sum + (data.stock.byLocation[l.id] ?? 0), 0) +
    data.units.filter(
      (u) =>
        isOnHand(u) &&
        (!department || ids.has(u.current_location_id ?? u.destination_id)),
    ).length;
  const variants = data.master.products.filter((p) =>
    ids.has(p.locationId),
  ).length;
  const placedByProduct = new Map<string, number>();
  if (location) {
    for (const lot of data.stock.byProduct.values()) {
      if (lot.location_id === location.id)
        placedByProduct.set(lot.product_id, lot.remaining);
    }
    for (const unit of data.units) {
      if (unit.current_location_id === location.id)
        placedByProduct.set(
          unit.product_id,
          (placedByProduct.get(unit.product_id) ?? 0) + 1,
        );
    }
  }
  const selectLocation = (id: string) => {
    setSelected(id);
    setDetailLimit(20);
  };
  return (
    <>
      <PageTitle
        eyebrow="DESTINATIONS & CAPACITY"
        title="Store locations"
        description="Review placements, reservations, and available fixture capacity."
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
            value: onHand.toLocaleString(),
            note: variants.toLocaleString() + " product variants",
          },
          {
            label: "TOTAL CAPACITY",
            value: summary.unlimited
              ? summary.capacity.toLocaleString() + "+"
              : summary.capacity.toLocaleString(),
            note: "configured unit slots",
          },
          {
            label: "ALREADY SORTED",
            value: summary.placed.toLocaleString(),
            note: "recorded placements",
          },
          {
            label: "RESERVED",
            value: summary.reserved.toLocaleString(),
            note: "queued for restocking",
          },
          {
            label: "AVAILABLE",
            value: summary.available.toLocaleString(),
            note: "uncommitted slots",
          },
        ].map((s) => (
          <div key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
            <small>{s.note}</small>
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
              onChange={(e) => {
                setDepartment(e.target.value);
                setSelected("");
              }}
            >
              <NativeSelectOption value="">All departments</NativeSelectOption>
              {[...new Set(data.master.locations.map((l) => l.department))].map(
                (d) => (
                  <NativeSelectOption key={d}>{d}</NativeSelectOption>
                ),
              )}
            </NativeSelect>
          </div>
          <div
            className="store-view-controls"
            role="group"
            aria-label="Store view"
          >
            <Button
              type="button"
              className={view === "floor" ? "primary" : "secondary"}
              aria-pressed={view === "floor"}
              onClick={() => setView("floor")}
            >
              Floor plan
            </Button>
            <Button
              type="button"
              className={view === "grid" ? "primary" : "secondary"}
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              Capacity grid
            </Button>
          </div>
          {view === "floor" ? (
            <StoreVisualization
              locations={locations}
              units={data.units}
              opening={data.stock.byLocation}
              products={data.master.products}
              selected={selected}
              onSelect={selectLocation}
            />
          ) : (
            <div className="map-floor">
              <div className="map-entrance">
                STORE ENTRANCE <span>↑</span>
              </div>
              <div className="location-grid">
                {locations.map((l) => {
                  const load = locationLoad(
                      data.units,
                      l.id,
                      data.stock.byLocation,
                    ),
                    full = l.capacity !== null && load.committed >= l.capacity;
                  return (
                    <Card
                      key={l.id}
                      className={`map-location gap-0 py-0 ring-0 ${selected === l.id ? "selected" : ""} ${full ? "at-capacity" : ""}`}
                    >
                      <small>{l.department}</small>
                      <strong>{l.aisle}</strong>
                      <span>
                        {[l.rack, l.shelf].filter(Boolean).join(" / ")}
                      </span>
                      <Progress
                        className="capacity-bar"
                        aria-label={`${l.id} capacity used`}
                        value={
                          l.capacity
                            ? Math.min(100, (load.committed / l.capacity) * 100)
                            : 0
                        }
                      />
                      <small>
                        {load.confirmed} placed · {load.reserved} reserved /{" "}
                        {l.capacity ?? "∞"}
                      </small>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        aria-label={`${selected === l.id ? "Selected" : "Select"} ${l.id}`}
                        aria-pressed={selected === l.id}
                        onClick={() => selectLocation(l.id)}
                      >
                        {selected === l.id ? "Selected" : "Select"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
              <div className="map-legend">
                <span>
                  <i />
                  Space available
                </span>
                <span>
                  <i className="amber" />
                  At capacity
                </span>
                <span>
                  <i className="indigo" />
                  Selected destination
                </span>
              </div>
            </div>
          )}
          <p className="hint map-note">
            Schematic only. ReRun shows where an item belongs and its last
            confirmed placement; it does not locate merchandise automatically.
          </p>
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
            {location && (
              <Button
                className="location-back"
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
          {location ? (
            <>
              <span className="eyebrow">{location.department}</span>
              <h2 className="location-title">{location.id}</h2>
              <div className="facts">
                <div>
                  <small>Rack</small>
                  <strong>{location.rack || "—"}</strong>
                </div>
                <div>
                  <small>Shelf</small>
                  <strong>{location.shelf || "—"}</strong>
                </div>
                <div>
                  <small>Capacity</small>
                  <strong>
                    {location.capacity?.toLocaleString() ?? "Unlimited"}
                  </strong>
                </div>
                <div>
                  <small>Confirmed units</small>
                  <strong>
                    {locationLoad(
                      data.units,
                      location.id,
                      data.stock.byLocation,
                    ).confirmed.toLocaleString()}
                  </strong>
                </div>
              </div>
              <h3 className="subheading">Assigned products</h3>
              <ItemGroup className="gap-0" aria-label="Assigned products">
                {data.master.products
                  .filter((p) => p.locationId === location.id)
                  .slice(0, detailLimit)
                  .map((p) => (
                    <div role="listitem" key={p.id}>
                      <Item className="location-item">
                        <ItemContent className="min-w-0">
                          <ItemTitle className="line-clamp-none block w-full break-words text-left">
                            {p.name}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none text-xs mono break-all">
                            {p.id} ·{" "}
                            {(placedByProduct.get(p.id) ?? 0).toLocaleString()}{" "}
                            placed
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`View product: ${p.name} (${p.id})`}
                            onClick={() => openProduct(p.id)}
                          >
                            View product
                          </Button>
                        </ItemActions>
                      </Item>
                    </div>
                  ))}
              </ItemGroup>
              {data.master.products.filter((p) => p.locationId === location.id)
                .length > detailLimit && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => setDetailLimit(detailLimit + 30)}
                >
                  Show more assigned products
                </Button>
              )}
              <h3 className="subheading">Restock reservations</h3>
              <ItemGroup className="gap-0" aria-label="Restock reservations">
                {restockRoute(data.units)
                  .filter((u) => u.destination_id === location.id)
                  .map((u) => (
                    <div role="listitem" key={u.id}>
                      <Item className="location-item">
                        <ItemContent className="min-w-0">
                          <ItemTitle>{u.product_id}</ItemTitle>
                          <ItemDescription className="line-clamp-none text-xs mono break-all">
                            {u.id}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Status value={u.status} />
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`View unit ${u.id}`}
                            onClick={() => openProduct(u.product_id, u.id)}
                          >
                            View unit
                          </Button>
                        </ItemActions>
                      </Item>
                    </div>
                  ))}
              </ItemGroup>
              <h3 className="subheading">Last confirmed placements</h3>
              <ItemGroup
                className="gap-0"
                aria-label="Last confirmed placements"
              >
                {data.units
                  .filter((u) => u.current_location_id === location.id)
                  .map((u) => (
                    <div role="listitem" key={u.id}>
                      <Item className="location-item">
                        <ItemContent className="min-w-0">
                          <ItemDescription className="line-clamp-none text-xs mono break-all">
                            {u.id}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions>
                          <Status value={u.status} />
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`View unit ${u.id}`}
                            onClick={() => openProduct(u.product_id, u.id)}
                          >
                            View unit
                          </Button>
                        </ItemActions>
                      </Item>
                    </div>
                  ))}
              </ItemGroup>
            </>
          ) : (
            <EmptyState className="calm-empty">
              <EmptyHeader>
                <EmptyTitle>Choose a destination.</EmptyTitle>
                <EmptyDescription>
                  Select a rack or shelf to see products and capacity.
                </EmptyDescription>
              </EmptyHeader>
            </EmptyState>
          )}
        </Card>
      </div>
    </>
  );
}
