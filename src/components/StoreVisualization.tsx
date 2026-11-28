import { Button } from "./ui/button";
import type { FloorPlan } from "../lib/floor-plan";
import type { measureFloorStock } from "../lib/floor-plan";

const layoutOrder = [
  [["Household, Health & Beauty"], ["Produce & Floral"]],
  [["Dairy & Refrigerated"], ["Dry Grocery & Snacks", "Beverages"]],
  [["Frozen Foods"], ["Meat, Seafood, Deli & Bakery"]],
];
type Department = FloorPlan["departments"][number];
const format = (value: number) => value.toLocaleString();
const area = (departments: Department[]) =>
  departments.reduce((sum, department) => sum + department.floorArea, 0);
const tracks = (weights: number[]) =>
  weights.map((weight) => `minmax(0, ${Math.max(1, weight)}fr)`).join(" ");

export function StoreVisualization({
  plan,
  stock,
  department,
  selectedAisle,
  onChooseDepartment,
  onChooseAisle,
}: {
  plan: FloorPlan;
  stock: ReturnType<typeof measureFloorStock>;
  department: string;
  selectedAisle?: string;
  onChooseDepartment: (department: string) => void;
  onChooseAisle: (id: string) => void;
}) {
  const visibleDepartments = plan.departments.filter(
    (group) => group.floorArea > 0,
  );
  const byName = new Map(
    visibleDepartments.map((group) => [group.name, group]),
  );
  const used = new Set<string>();
  const columns = layoutOrder
    .map((column) =>
      column
        .map((row) =>
          row.flatMap((name) => {
            const zone = byName.get(name);
            if (!zone) return [];
            used.add(name);
            return [zone];
          }),
        )
        .filter((row) => row.length),
    )
    .filter((column) => column.length);
  for (const zone of visibleDepartments)
    if (!used.has(zone.name)) columns.push([[zone]]);
  const active =
    plan.departments.find((zone) => zone.name === department) ??
    visibleDepartments[0];
  const activeStock = active && stock.byDepartment.get(active.name);
  const footprint = plan.salesArea + plan.backroomArea + plan.checkoutArea;

  return (
    <section
      className="store-visualization"
      aria-label="Interactive store floor plan"
    >
      {footprint > 0 && (
        <>
          <div className="floor-metrics" aria-label="Modeled store dimensions">
            <span>
              <b>{format(footprint)} sq ft</b> modeled footprint
            </span>
            <span>
              <b>{format(plan.aisleCount)}</b> aisles & display runs
            </span>
            <span>
              <b>{format(plan.bayCount)}</b> four-foot bays
            </span>
          </div>
          <figure className="store-footprint">
            <div
              className="floor-diagram"
              style={{
                gridTemplateRows: tracks(
                  plan.backroomArea
                    ? [plan.backroomArea, plan.salesArea, plan.checkoutArea]
                    : [plan.salesArea, plan.checkoutArea],
                ),
              }}
            >
              {plan.backroomArea > 0 && (
                <div className="floor-backroom">
                  <strong>Backroom & receiving</strong>
                  <span>
                    {format(plan.backroomArea)} sq ft ·{" "}
                    {format(stock.total.backstock)} units estimated in backstock
                  </span>
                </div>
              )}
              <div
                className="floor-departments"
                style={{
                  gridTemplateColumns: tracks(
                    columns.map((column) => area(column.flat())),
                  ),
                }}
              >
                {columns.map((column) => (
                  <div
                    className="floor-column"
                    key={column[0][0].fixture.code}
                    style={{
                      gridTemplateRows: tracks(column.map(area)),
                    }}
                  >
                    {column.map((row) => (
                      <div
                        className="floor-row"
                        key={row[0].fixture.code}
                        style={{
                          gridTemplateColumns: tracks(
                            row.map((zone) => zone.floorArea),
                          ),
                        }}
                      >
                        {row.map((zone) => (
                          <button
                            key={zone.name}
                            type="button"
                            className="department-zone"
                            data-zone={zone.fixture.code}
                            aria-label={zone.name}
                            aria-pressed={active?.name === zone.name}
                            onClick={() => onChooseDepartment(zone.name)}
                          >
                            <span className="zone-code" aria-hidden="true">
                              {zone.fixture.code}
                            </span>
                            <span className="zone-shelves" aria-hidden="true">
                              {zone.aisles.map((aisle) => (
                                <i
                                  key={aisle.id}
                                  style={{
                                    width: `${(aisle.bays / zone.fixture.baysPerAisle) * 100}%`,
                                  }}
                                />
                              ))}
                            </span>
                            <span className="zone-label">
                              <strong>{zone.fixture.shortName}</strong>
                              <span className="zone-count">
                                <b>
                                  {format(
                                    stock.byDepartment.get(zone.name)?.onHand ??
                                      0,
                                  )}
                                </b>{" "}
                                on hand
                              </span>
                              <small className="zone-count">
                                {format(zone.variants)} variants
                              </small>
                            </span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="floor-checkout">
                <span>↑ Entrance</span>
                <strong>Checkouts</strong>
                <span>Exit ↓</span>
              </div>
            </div>
            <figcaption className="hint">
              Block area represents estimated floor space. Choose a department
              to see its aisles, shelf stock, and backstock.
            </figcaption>
          </figure>
          <div
            className="floor-legend"
            role="group"
            aria-label="Department key"
          >
            {visibleDepartments.map((zone) => (
              <Button
                key={zone.name}
                type="button"
                variant={active?.name === zone.name ? "secondary" : "outline"}
                aria-label={`Choose ${zone.name}`}
                aria-pressed={active?.name === zone.name}
                onClick={() => onChooseDepartment(zone.name)}
              >
                <span className="legend-code">{zone.fixture.code}</span>
                <span className="legend-label">
                  <strong>{zone.fixture.shortName}</strong>
                  <span>
                    <b>
                      {format(stock.byDepartment.get(zone.name)?.onHand ?? 0)}
                    </b>{" "}
                    on hand
                  </span>
                  <small>{format(zone.variants)} variants</small>
                </span>
              </Button>
            ))}
          </div>
        </>
      )}
      {active && activeStock && (
        <section
          className="aisle-section"
          aria-label={active.name + " aisle plan"}
        >
          <div className="aisle-heading">
            <div>
              <h3>{active.name}</h3>
              <p className="hint">
                {format(active.floorArea)} sq ft of sales floor ·{" "}
                {format(active.aisles.length)} aisles and display runs ·{" "}
                {format(active.bays)} bays
              </p>
            </div>
            <p className="aisle-assumption">
              <b>{active.fixture.type}</b> ·{" "}
              {active.fixture.sides === 2 ? "Two-sided" : "Single-sided"} ·{" "}
              {active.fixture.levels} shelf levels · up to{" "}
              {active.variantsPerFace} variants per face
            </p>
          </div>
          <dl className="floor-stock">
            <div>
              <dt>On hand</dt>
              <dd>{format(activeStock.onHand)}</dd>
              <small>{format(active.variants)} variants</small>
            </div>
            <div>
              <dt>On shelves (est.)</dt>
              <dd>{format(activeStock.shelf)}</dd>
              <small>{format(active.shelfUnits)} planned positions</small>
            </div>
            <div>
              <dt>Backstock (est.)</dt>
              <dd>{format(activeStock.backstock)}</dd>
              <small>{format(active.backroomArea)} sq ft of storage</small>
            </div>
            <div>
              <dt>Awaiting placement</dt>
              <dd>{format(activeStock.staging)}</dd>
            </div>
          </dl>
          {active.aisles.length === 0 ? (
            <p className="hint">
              No products have a shelf assignment in this department.
            </p>
          ) : (
            <div
              className="aisle-list"
              role="group"
              aria-label="Select an aisle"
            >
              {active.aisles.map((aisle) => (
                <Button
                  key={aisle.id}
                  type="button"
                  variant={selectedAisle === aisle.id ? "secondary" : "outline"}
                  className="aisle-button"
                  aria-pressed={selectedAisle === aisle.id}
                  onClick={() => onChooseAisle(aisle.id)}
                >
                  <strong>Aisle {aisle.id}</strong>
                  <span>
                    {aisle.bays} {aisle.bays === 1 ? "bay" : "bays"} ·{" "}
                    {format(aisle.products.length)} variants
                  </span>
                </Button>
              ))}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
