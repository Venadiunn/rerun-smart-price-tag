import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import type { Location, Unit } from "../lib/types";
import { storeAisles } from "../lib/store-layout";
import { locationLoad } from "../lib/sorting";

export function StoreVisualization({
  locations,
  units,
  selected,
  onSelect,
}: {
  locations: Location[];
  units: Unit[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const aisles = storeAisles(locations);
  return (
    <div
      className="store-visualization"
      aria-label="Interactive store floor plan"
    >
      <div className="store-back-wall">
        <span>Receiving & inspection</span>
        <span>STAFF ACCESS</span>
      </div>
      <div className="store-walkway">
        <span>REAR CROSS AISLE</span>
      </div>
      <div className="store-aisles">
        {aisles.map((aisle) => (
          <section
            className="store-aisle"
            key={aisle.id}
            aria-label={`${aisle.id} ${aisle.label}`}
          >
            <header>
              <span className="eyebrow">{aisle.id}</span>
              <h3>{aisle.label}</h3>
            </header>
            <div className="store-fixtures">
              {aisle.fixtures.map((l) => {
                const load = locationLoad(units, l.id),
                  full = l.capacity !== null && load.committed >= l.capacity;
                const slots =
                  l.capacity === null
                    ? Math.max(30, load.committed)
                    : l.capacity;
                return (
                  <Card
                    key={l.id}
                    className={`store-fixture gap-0 py-0 ring-0 ${selected === l.id ? "selected" : ""} ${full ? "full" : ""}`}
                  >
                    <span className="fixture-top">
                      <strong>
                        {[l.rack, l.shelf].filter(Boolean).join(" / ")}
                      </strong>
                      <small>{l.capacity ?? "∞"} slots</small>
                    </span>
                    <span className="fixture-slots" aria-hidden="true">
                      {Array.from({ length: Math.min(slots, 100) }, (_, i) => (
                        <i
                          key={i}
                          className={
                            i < load.confirmed
                              ? "placed"
                              : i < load.committed
                                ? "reserved"
                                : ""
                          }
                        />
                      ))}
                    </span>
                    <span className="fixture-counts">
                      <span>{load.confirmed} placed</span>
                      <span>{load.reserved} reserved</span>
                    </span>
                    <Button
                      variant={selected === l.id ? "secondary" : "outline"}
                      className="mt-2 w-full"
                      size="sm"
                      aria-label={
                        (selected === l.id ? "Selected " : "Select ") +
                        l.id +
                        ": " +
                        load.confirmed +
                        " placed, " +
                        load.reserved +
                        " reserved, capacity " +
                        (l.capacity ?? "unlimited")
                      }
                      aria-pressed={selected === l.id}
                      onClick={() => onSelect(l.id)}
                    >
                      {selected === l.id ? "Selected" : "Select"}
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {!aisles.length && (
        <p className="store-empty">No locations match this department.</p>
      )}
      <div className="store-walkway front">
        <span>MAIN CUSTOMER WALKWAY</span>
      </div>
      <div className="store-front-wall">
        <span>Entrance / exit</span>
        <span>Checkout</span>
      </div>
      <div className="store-map-key">
        <span>
          <i className="placed" /> Placed
        </span>
        <span>
          <i className="reserved" /> Reserved for restocking
        </span>
        <span>
          <i /> Available slot
        </span>
      </div>
      <p className="hint">
        Mock store layout. Each marker represents one unit of configured
        capacity. Locations show recorded placements and reservations.
      </p>
    </div>
  );
}
