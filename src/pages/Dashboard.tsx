import {
  Empty as EmptyState,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ReceiveStockDialog } from "../components/ReceiveStockDialog";

import { Link } from "@tanstack/react-router";
import { useWorkspace } from "../lib/context";
import { dateTime } from "../lib/domain";
import { PageTitle, Status } from "../components/ui";
import { AutoSortPanel } from "../components/AutoSortPanel";
import { locationLoad, restockRoute } from "../lib/sorting";
export function Dashboard() {
  const [receive, setReceive] = useState(false);
  const { data, openProduct } = useWorkspace(),
    pending = restockRoute(data.units),
    restocked = data.units.filter((u) => u.status === "Restocked");
  const alerts = data.scans.filter(
    (s) => s.findings[0] !== "VALID ITEM" && !s.acknowledged_at,
  );
  const stats = [
    {
      label: "Products",
      value: data.master.products.length,
      sub: `${data.units.filter((u) => !["Sold", "Stocked Out", "Offered", "In-Transit"].includes(u.status)).length} units on hand`,
    },
    {
      label: "Pending restock",
      value: pending.length,
      sub: "Ready for their next destination",
    },
    {
      label: "Restocked",
      value: restocked.length,
      sub: "Units confirmed at a destination",
    },
    {
      label: "Open scan alerts",
      value: alerts.length,
      sub: "Discrepancies awaiting acknowledgment",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="STORE OVERVIEW"
        title="Overview"
        description="Scan merchandise, resolve alerts, and keep restocking moving."
        actions={
          <>
            <Button
              type="button"
              className="secondary"
              onClick={() => setReceive(true)}
            >
              Receive stock
            </Button>
            <Link to="/scan" className="primary">
              Scan an item
            </Link>
          </>
        }
      />
      <div className="stats">
        {stats.map((s) => (
          <Card className="stat gap-0" key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value.toLocaleString()}</strong>
            <small>{s.sub}</small>
          </Card>
        ))}
      </div>
      <AutoSortPanel compact />
      <div className="dashboard-grid">
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <div>
              <h2>
                Restocking queue <span className="count">{pending.length}</span>
              </h2>
            </div>
            <Link to="/inventory">View inventory</Link>
          </div>
          {pending.length ? (
            <div className="queue">
              {pending.slice(0, 5).map((u) => {
                const p = data.master.products.find(
                  (p) => p.id === u.product_id,
                )!;
                return (
                  <Button
                    type="button"
                    className="queue-item h-auto w-full whitespace-normal justify-start text-left"
                    key={u.id}
                    onClick={() => openProduct(p.id, u.id)}
                  >
                    <span>
                      <strong>{p.name}</strong>
                      <small>{u.id}</small>
                    </span>
                    <span className="queue-dest">{u.destination_id}</span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <EmptyState className="calm-empty">
              <EmptyHeader>
                <EmptyTitle>The queue is clear.</EmptyTitle>
                <EmptyDescription>
                  Received items appear here when marked pending restock.
                </EmptyDescription>
              </EmptyHeader>
            </EmptyState>
          )}
        </Card>
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <div>
              <h2>Recent activity</h2>
            </div>
            <Link to="/history">View history</Link>
          </div>
          <div className="timeline">
            {data.events.slice(0, 5).map((e) => (
              <div key={e.id}>
                <span className="timeline-dot" />
                <section>
                  <strong>{e.action.replaceAll("_", " ")}</strong>
                  <small>{e.entity_id}</small>
                  <time>{dateTime(e.created_at)}</time>
                </section>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card className="panel locations-strip gap-0 py-0 ring-0">
        <div className="section-heading">
          <div>
            <h2>Location capacity</h2>
          </div>
          <Link to="/locations">Explore store map</Link>
        </div>
        <div className="mini-locations">
          {data.master.locations.slice(0, 4).map((l) => {
            const load = locationLoad(data.units, l.id);
            return (
              <div key={l.id}>
                <strong>
                  {l.aisle} · {l.rack || l.shelf}
                </strong>
                <small>
                  {load.confirmed} placed · {load.reserved} reserved /{" "}
                  {l.capacity ?? "∞"}
                </small>
                <Progress
                  className="capacity-bar"
                  aria-label={`${l.id} capacity used`}
                  value={
                    l.capacity
                      ? Math.min(100, (load.committed / l.capacity) * 100)
                      : 0
                  }
                />
                <Status
                  value={
                    l.capacity && load.committed >= l.capacity
                      ? "Full"
                      : "Space available"
                  }
                />
              </div>
            );
          })}
        </div>
      </Card>
      {receive && <ReceiveStockDialog onClose={() => setReceive(false)} />}
    </>
  );
}
