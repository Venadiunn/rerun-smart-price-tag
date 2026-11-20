import { Alert } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useState } from "react";

import { command, exportCSV } from "../lib/api";
import { useWorkspace } from "../lib/context";
import { restockRoute, type SortResult } from "../lib/sorting";
import { Link } from "@tanstack/react-router";

export function AutoSortPanel({ compact = false }: { compact?: boolean }) {
  const { data, run, busy, openProduct } = useWorkspace();
  const [result, setResult] = useState<SortResult | null>(null);
  const [limit, setLimit] = useState(15);
  const [query, setQuery] = useState("");
  const route = restockRoute(data.units);
  const eligible = data.units.filter((u) =>
    ["Received in Store", "Inspected"].includes(u.status),
  );
  const missingTags = data.units.filter(
    (u) =>
      ["Pending Restock", "Restocked"].includes(u.status) &&
      u.inspected &&
      !data.tags.some((t) => t.unit_id === u.id),
  ).length;
  const visible = route.filter((u) =>
    `${u.product_id} ${u.id} ${u.destination_id}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <Card className="panel sort-panel gap-0 py-0 ring-0">
      <div className="section-heading">
        <div>
          <h2>Automatic sorting</h2>
        </div>
        <Button
          type="button"
          className="primary"
          disabled={busy}
          aria-label="Auto sort and assign smart tags"
          onClick={async () => {
            const sorted = await run(
              () => command<SortResult>("auto_sort", {}),
              "Sorting and smart-tag assignment complete.",
            );
            if (sorted) setResult(sorted);
          }}
        >
          Auto sort & assign tags
        </Button>
      </div>
      <p>
        New arrivals automatically match their product ID to the master index.
        Available space and a reusable smart tag are assigned before units enter
        the restock route. Staff confirm placement at the rack or shelf.
      </p>
      <div className="sort-summary" aria-live="polite">
        <strong>{route.length} ready to place</strong>
        <span>{eligible.length} awaiting sorting or review</span>
        <span>{missingTags} allocated units need tags</span>
        {result && (
          <span>
            {result.sorted} newly routed · {result.waiting.length} held for
            review · {result.tagging?.assigned ?? 0} smart tags assigned
          </span>
        )}
      </div>
      {result && result.waiting.length > 0 && (
        <Alert className="notice" role="status">
          <div>
            <strong>Some units need attention</strong>
            {result.waiting.map((w) => (
              <p key={w.unitId}>
                <Button
                  type="button"
                  className="text-button"
                  onClick={() => openProduct(w.productId, w.unitId)}
                >
                  {w.productId} · {w.unitId}
                </Button>{" "}
                → {w.locationId}: {w.reason}
              </p>
            ))}
            <p>
              Resolve the hold or ask a manager to assign overflow, then retry
              sorting.
            </p>
          </div>
        </Alert>
      )}
      {result?.tagging && result.tagging.held.length > 0 && (
        <Alert className="notice" role="status">
          {result.tagging.held.length} tag assignments held for capacity review.
          Ask a manager to resolve location commitments.
        </Alert>
      )}
      {compact ? (
        <div className="overview-sort-links">
          <Link className="secondary" to="/inventory">
            Open restock route
          </Link>
          <Link className="secondary" to="/tags">
            View smart tags
          </Link>
        </div>
      ) : (
        <>
          <div className="table-toolbar">
            <label className="search-box">
              <Input
                aria-label="Search restock route"
                placeholder="Find a product ID, unit or destination…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(15);
                }}
              />
            </label>
            <Button
              type="button"
              className="secondary"
              disabled={!route.length}
              onClick={() =>
                exportCSV(
                  route.map((u, i) => ({
                    Stop: i + 1,
                    Location: u.destination_id,
                    Product_ID: u.product_id,
                    Product: data.master.products.find(
                      (p) => p.id === u.product_id,
                    )?.name,
                    Unit_ID: u.id,
                    Status: u.status,
                  })),
                  "rerun-restock-route.csv",
                )
              }
            >
              Export restock route
            </Button>
          </div>
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destination</TableHead>
                  <TableHead>Product ID</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Placement</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.slice(0, limit).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.destination_id}</TableCell>
                    <TableCell className="mono">{u.product_id}</TableCell>
                    <TableCell className="mono">{u.id}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        className="text-button"
                        onClick={() => openProduct(u.product_id, u.id)}
                      >
                        Review & place
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {!visible.length && (
            <p className="hint">No matching units are ready for placement.</p>
          )}
          {visible.length > limit && (
            <Button
              type="button"
              className="secondary"
              onClick={() => setLimit(limit + 30)}
            >
              Show more ({visible.length - limit} remaining)
            </Button>
          )}
        </>
      )}
    </Card>
  );
}
