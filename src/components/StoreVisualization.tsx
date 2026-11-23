import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "./ui/button";
import { isOnHand } from "../lib/opening-stock";
import { storeSummary } from "../lib/store-layout";
import type { Location, Unit, Product } from "../lib/types";

const floorZones = new Map([
  ["Dairy & Refrigerated", "dairy"],
  ["Household, Health & Beauty", "household"],
  ["Frozen Foods", "frozen"],
  ["Dry Grocery & Snacks", "grocery"],
  ["Beverages", "beverages"],
  ["Produce & Floral", "produce"],
  ["Meat, Seafood, Deli & Bakery", "fresh"],
]);
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
  const departments = [...new Set(locations.map((l) => l.department))];
  const mappedDepartments = [...floorZones.keys()].filter((name) =>
    departments.includes(name),
  );
  const groups = [
    ...mappedDepartments,
    ...departments.filter((name) => !floorZones.has(name)),
  ];
  const fullPlan =
    groups.length === floorZones.size &&
    mappedDepartments.length === floorZones.size;
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
  const departmentLocations = locations.filter(
    (l) => l.department === department,
  );
  const load = storeSummary(departmentLocations, units, opening);
  return (
    <section
      className="store-visualization"
      aria-label="Interactive store floor plan"
    >
      <div className="store-back-wall">
        <span>Receiving & inspection</span>
        <span>Staff entrance</span>
      </div>
      <div className={fullPlan ? "grocery-plan full-plan" : "grocery-plan"}>
        {groups.map((name) => (
          <button
            key={name}
            type="button"
            className="department-zone"
            data-zone={floorZones.get(name)}
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
          </button>
        ))}
        <div className="store-checkout">
          <span>
            <ArrowUp aria-hidden="true" /> Entrance
          </span>
          <strong>Checkouts</strong>
          <span>
            Exit <ArrowDown aria-hidden="true" />
          </span>
        </div>
      </div>
      {department && (
        <section className="bay-section">
          <div className="bay-heading">
            <h3>{department}</h3>
            <span>
              {format(load.available)} slots free
              {load.unlimited ? " + unlimited" : ""}
            </span>
            {load.capacity > 0 && (
              <meter
                aria-label={department + " capacity used"}
                min={0}
                max={load.capacity}
                value={Math.min(load.placed + load.reserved, load.capacity)}
              />
            )}
          </div>
          {departmentLocations.some((l) => /^G[1-7]-BAY-/.test(l.id)) && (
            <p className="muted">
              Grocery bays group multiple fixtures and their backstock.
            </p>
          )}
          <div className="bay-list">
            {load.loads.map((l) => (
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
    </section>
  );
}
