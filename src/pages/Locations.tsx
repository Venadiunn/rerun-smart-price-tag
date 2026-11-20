import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { MapPin, ArrowRight, Layers3 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useWorkspace } from "../lib/context";
import { PageTitle, Status } from "../components/ui";
import { StoreVisualization } from "../components/StoreVisualization";
import { storeSummary } from "../lib/store-layout";
import { locationLoad, restockRoute } from "../lib/sorting";
export function Locations() {
  const { data, openProduct } = useWorkspace(),
    [selected, setSelected] = useState(""),
    [view, setView] = useState("floor"),
    [detailLimit, setDetailLimit] = useState(20),
    [department, setDepartment] = useState("");
  const locations = data.master.locations.filter(
      (l) => !department || l.department === department,
    ),
    location = data.master.locations.find((l) => l.id === selected);
  const summary = storeSummary(data.master.locations, data.units);
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
          <Link className="secondary" to="/master">
            Manage locations
            <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="store-overview" aria-label="Store capacity summary">
        {[
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
          {
            label: "MASTER CATALOG",
            value: data.master.products.length.toLocaleString(),
            note: "unique product variants",
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
            <h2>
              <Layers3 size={19} />
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
                  const load = locationLoad(data.units, l.id),
                    full = l.capacity !== null && load.committed >= l.capacity;
                  return (
                    <Button
                      type="button"
                      key={l.id}
                      className={`map-location ${selected === l.id ? "selected" : ""} ${full ? "at-capacity" : ""}`}
                      onClick={() => selectLocation(l.id)}
                    >
                      <span className="map-pin">
                        <MapPin size={20} />
                      </span>
                      <small>{l.department}</small>
                      <strong>{l.aisle}</strong>
                      <span>
                        {[l.rack, l.shelf].filter(Boolean).join(" / ")}
                      </span>
                      <div className="capacity-bar">
                        <i
                          style={{
                            width: `${l.capacity ? Math.min(100, (load.committed / l.capacity) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <small>
                        {load.confirmed} placed · {load.reserved} reserved /{" "}
                        {l.capacity ?? "∞"}
                      </small>
                    </Button>
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
            <h2>Destination details</h2>
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
                  <strong>{location.capacity ?? "Unlimited"}</strong>
                </div>
                <div>
                  <small>Confirmed units</small>
                  <strong>
                    {
                      data.units.filter(
                        (u) => u.current_location_id === location.id,
                      ).length
                    }
                  </strong>
                </div>
              </div>
              <h3 className="subheading">Assigned products</h3>
              {data.master.products
                .filter((p) => p.locationId === location.id)
                .slice(0, detailLimit)
                .map((p) => (
                  <Button
                    type="button"
                    className="location-item"
                    key={p.id}
                    onClick={() => openProduct(p.id)}
                  >
                    <span>
                      {p.name}
                      <small>{p.id}</small>
                    </span>
                    <ArrowRight size={16} />
                  </Button>
                ))}
              {data.master.products.filter((p) => p.locationId === location.id)
                .length > detailLimit && (
                <Button
                  type="button"
                  className="secondary"
                  onClick={() => setDetailLimit(detailLimit + 30)}
                >
                  Show more assigned products
                </Button>
              )}
              <h3 className="subheading">Restock reservations</h3>
              {restockRoute(data.units)
                .filter((u) => u.destination_id === location.id)
                .map((u) => (
                  <Button
                    type="button"
                    className="location-item"
                    key={u.id}
                    onClick={() => openProduct(u.product_id, u.id)}
                  >
                    <span>
                      {u.product_id}
                      <small className="mono">{u.id}</small>
                    </span>
                    <Status value={u.status} />
                  </Button>
                ))}
              <h3 className="subheading">Last confirmed placements</h3>
              {data.units
                .filter((u) => u.current_location_id === location.id)
                .map((u) => (
                  <Button
                    type="button"
                    className="location-item"
                    key={u.id}
                    onClick={() => openProduct(u.product_id, u.id)}
                  >
                    <span className="mono">{u.id}</span>
                    <Status value={u.status} />
                  </Button>
                ))}
            </>
          ) : (
            <div className="calm-empty">
              <MapPin size={32} />
              <h3>Choose a destination.</h3>
              <p>Select a rack or shelf to see products and capacity.</p>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
