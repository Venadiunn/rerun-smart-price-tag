import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ReceiveStockDialog } from "../components/ReceiveStockDialog";
import {
  ArrowRight,
  Boxes,
  PackageCheck,
  Clock3,
  ShieldAlert,
  ScanLine,
  MapPin,
  MoveUpRight,
} from "lucide-react";
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
      label: "PRODUCT VARIANTS",
      value: data.master.products.length,
      sub: `${data.units.filter((u) => !["Sold", "Stocked Out", "Offered", "In-Transit"].includes(u.status)).length} units on hand`,
      icon: Boxes,
      tone: "indigo",
    },
    {
      label: "PENDING RESTOCK",
      value: pending.length,
      sub: "Ready for their next destination",
      icon: Clock3,
      tone: "amber",
    },
    {
      label: "CURRENTLY RESTOCKED",
      value: restocked.length,
      sub: "Units confirmed at a destination",
      icon: PackageCheck,
      tone: "emerald",
    },
    {
      label: "OPEN SCAN ALERTS",
      value: alerts.length,
      sub: "Discrepancies awaiting acknowledgment",
      icon: ShieldAlert,
      tone: "rose",
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
              <ScanLine size={18} />
              Scan an item
            </Link>
          </>
        }
      />
      <div className="stats">
        {stats.map((s) => (
          <article className="stat" key={s.label}>
            <div className={`stat-icon ${s.tone}`}>
              <s.icon size={21} />
            </div>
            <span>{s.label}</span>
            <strong>{s.value.toString().padStart(2, "0")}</strong>
            <small>{s.sub}</small>
          </article>
        ))}
      </div>
      <AutoSortPanel compact />
      <div className="dashboard-grid">
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">UP NEXT</span>
              <h2>
                Restocking queue <span className="count">{pending.length}</span>
              </h2>
            </div>
            <Link to="/inventory">
              View inventory <MoveUpRight size={16} />
            </Link>
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
                    <span className="product-monogram">
                      {p.name
                        .split(" ")
                        .map((s) => s[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>{u.id}</small>
                    </span>
                    <span className="queue-dest">
                      <MapPin size={14} />
                      {u.destination_id}
                      <ArrowRight size={16} />
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <div className="calm-empty">
              <PackageCheck size={30} />
              <h3>The queue is clear.</h3>
              <p>Received items appear here when marked pending restock.</p>
            </div>
          )}
        </Card>
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">WORKSPACE PULSE</span>
              <h2>Recent activity</h2>
            </div>
            <Link to="/history" aria-label="View all history">
              <MoveUpRight size={18} />
            </Link>
          </div>
          <div className="timeline">
            {data.events.slice(0, 5).map((e) => (
              <div key={e.id}>
                <span className="timeline-dot" />
                <section>
                  <strong>{e.action.replaceAll("_", " ")}</strong>
                  <small>
                    {e.entity_id.length > 35
                      ? e.entity_id.slice(0, 32) + "…"
                      : e.entity_id}
                  </small>
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
            <span className="eyebrow">ON THE FLOOR</span>
            <h2>Location capacity</h2>
          </div>
          <Link to="/locations">
            Explore store map <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mini-locations">
          {data.master.locations.slice(0, 4).map((l) => {
            const load = locationLoad(data.units, l.id);
            return (
              <div key={l.id}>
                <MapPin size={17} />
                <strong>
                  {l.aisle} · {l.rack || l.shelf}
                </strong>
                <small>
                  {load.confirmed} placed · {load.reserved} reserved /{" "}
                  {l.capacity ?? "∞"}
                </small>
                <div className="capacity-bar">
                  <i
                    style={{
                      width: `${l.capacity ? Math.min(100, (load.committed / l.capacity) * 100) : 0}%`,
                    }}
                  />
                </div>
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
