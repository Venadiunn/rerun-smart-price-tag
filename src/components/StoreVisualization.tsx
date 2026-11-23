import { useState } from "react";
import { Button } from "./ui/button";
import { isOnHand } from "../lib/opening-stock";
import { storeSummary } from "../lib/store-layout";
import type { Location, Unit, Product } from "../lib/types";

const zones = [
  "Household, Health & Beauty",
  "Dairy & Refrigerated",
  "Frozen Foods",
  "Dry Grocery & Snacks",
  "Beverages",
  "Produce & Floral",
  "Meat, Seafood, Deli & Bakery",
];
const format = (n: number) => n.toLocaleString();
export function StoreVisualization({
  locations,
  units,
  opening,
  products,
  selected,
  onSelect,
}: {
  locations: Location[];
  units: Unit[];
  products: Product[];
  opening: Record<string, number>;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [choice, setChoice] = useState("");
  const groups = [...new Set(locations.map((l) => l.department))].sort(
    (a, b) => zones.indexOf(a) - zones.indexOf(b),
  );
  const department = groups.includes(choice)
    ? choice
    : groups.includes("Dry Grocery & Snacks")
      ? "Dry Grocery & Snacks"
      : groups[0];
  const homes = new Map(locations.map((l) => [l.id, l.department]));
  const variants = new Map<string, number>(),
    onHand = new Map<string, number>();
  for (const p of products) {
    const d = homes.get(p.locationId);
    if (d) variants.set(d, (variants.get(d) ?? 0) + 1);
  }
  for (const l of locations)
    onHand.set(
      l.department,
      (onHand.get(l.department) ?? 0) + (opening[l.id] ?? 0),
    );
  for (const u of units.filter(isOnHand)) {
    const d = homes.get(u.current_location_id ?? u.destination_id);
    if (d) onHand.set(d, (onHand.get(d) ?? 0) + 1);
  }
  return (
    <div
      className="store-visualization"
      aria-label="Interactive store floor plan"
    >
      <div className="store-back-wall">
        <span>Receiving & inspection</span>
        <span>Staff entrance</span>
      </div>
      <div
        className={
          groups.length === 7 ? "grocery-plan full-plan" : "grocery-plan"
        }
        aria-label="Departments"
      >
        {groups.map((name) => {
          const load = storeSummary(
            locations.filter((l) => l.department === name),
            units,
            opening,
          );
          const used = load.placed + load.reserved;
          return (
            <button
              key={name}
              type="button"
              className="department-zone"
              aria-pressed={department === name}
              onClick={() => {
                setChoice(name);
                onSelect("");
              }}
            >
              <strong>{name}</strong>
              <span>
                <b>{format(onHand.get(name) ?? 0)}</b> on hand
              </span>
              <small>{format(variants.get(name) ?? 0)} product variants</small>
              <meter
                aria-label={name + " capacity used"}
                min={0}
                max={load.capacity || 1}
                value={Math.min(used, load.capacity)}
              />
              <small>
                {format(load.available)} slots free
                {load.unlimited ? " + unlimited" : ""}
              </small>
            </button>
          );
        })}
      </div>
      <div className="store-front-wall">
        <span>↑ Entrance</span>
        <strong>Checkouts</strong>
        <span>Exit ↓</span>
      </div>
      {department && (
        <section className="bay-section">
          <h3>{department}</h3>
          <div className="bay-list">
            {storeSummary(
              locations.filter((l) => l.department === department),
              units,
              opening,
            ).loads.map((l) => (
              <Button
                key={l.id}
                variant={selected === l.id ? "secondary" : "outline"}
                className="bay-button"
                aria-label={`${selected === l.id ? "Selected" : "Select"} ${l.id}: ${l.confirmed} placed, ${l.reserved} reserved`}
                aria-pressed={selected === l.id}
                onClick={() => onSelect(l.id)}
              >
                <strong>
                  {l.aisle} · {l.rack || l.shelf}
                </strong>
                <span>
                  {format(l.confirmed)} placed · {format(l.reserved)} reserved
                </span>
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
