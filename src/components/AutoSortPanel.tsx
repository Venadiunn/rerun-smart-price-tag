import { useState } from "react";
import { Route, Download, ArrowRight } from "lucide-react";
import { command, exportCSV } from "../lib/api";
import { useWorkspace } from "../lib/context";
import { restockRoute, type SortResult } from "../lib/sorting";

export function AutoSortPanel() {
  const { data, run, busy, openProduct } = useWorkspace();
  const [result, setResult] = useState<SortResult | null>(null);
  const [limit, setLimit] = useState(15);
  const [query, setQuery] = useState("");
  const route = restockRoute(data.units);
  const eligible = data.units.filter((u) =>
    ["Received in Store", "Inspected"].includes(u.status),
  );
  const visible = route.filter((u) =>
    `${u.product_id} ${u.id} ${u.destination_id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="panel sort-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRODUCT ID → DESIGNATED LOCATION</span>
          <h2>
            <Route size={20} /> Automatic sorting
          </h2>
        </div>
        <button
          className="primary"
          disabled={busy || eligible.length === 0}
          onClick={async () => {
            const sorted = await run(
              () => command<SortResult>("auto_sort", {}),
              "Sorting complete.",
            );
            if (sorted) setResult(sorted);
          }}
        >
          Auto sort {eligible.length} units
        </button>
      </div>
      <p>
        New arrivals automatically match their product ID to the master index.
        Available space is reserved before units enter the restock route. Staff
        confirm placement at the rack or shelf.
      </p>
      <div className="sort-summary" aria-live="polite">
        <strong>{route.length} ready to place</strong>
        <span>{eligible.length} awaiting sorting or review</span>
        {result && (
          <span>
            {result.sorted} newly routed · {result.waiting.length} held for
            review
          </span>
        )}
      </div>
      {result && result.waiting.length > 0 && (
        <div className="notice" role="status">
          <div>
            <strong>Some units need attention</strong>
            {result.waiting.map((w) => (
              <p key={w.unitId}>
                <button
                  className="text-button"
                  onClick={() => openProduct(w.productId, w.unitId)}
                >
                  {w.productId} · {w.unitId}
                </button>{" "}
                → {w.locationId}: {w.reason}
              </p>
            ))}
            <p>
              Resolve the hold or ask a manager to assign overflow, then retry
              sorting.
            </p>
          </div>
        </div>
      )}
      <div className="table-toolbar">
        <label className="search-box">
          <input
            aria-label="Search restock route"
            placeholder="Find a product ID, unit or destination…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(15);
            }}
          />
        </label>
        <button
          className="secondary"
          disabled={!route.length}
          onClick={() =>
            exportCSV(
              route.map((u, i) => ({
                Stop: i + 1,
                Location: u.destination_id,
                Product_ID: u.product_id,
                Product: data.master.products.find((p) => p.id === u.product_id)
                  ?.name,
                Unit_ID: u.id,
                Status: u.status,
              })),
              "rerun-restock-route.csv",
            )
          }
        >
          <Download size={16} /> Export restock route
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Destination</th>
              <th>Product ID</th>
              <th>Unit</th>
              <th>Placement</th>
            </tr>
          </thead>
          <tbody>
            {visible.slice(0, limit).map((u) => (
              <tr key={u.id}>
                <td>{u.destination_id}</td>
                <td className="mono">{u.product_id}</td>
                <td className="mono">{u.id}</td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => openProduct(u.product_id, u.id)}
                  >
                    Review & place <ArrowRight size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <p className="hint">No matching units are ready for placement.</p>
      )}
      {visible.length > limit && (
        <button className="secondary" onClick={() => setLimit(limit + 30)}>
          Show more ({visible.length - limit} remaining)
        </button>
      )}
    </section>
  );
}
