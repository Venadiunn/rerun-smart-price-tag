import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "@/components/ui/item";
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
import { isOnHand } from "../lib/opening-stock";
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
      label: "Items on hand",
      value: data.stock.total + data.units.filter(isOnHand).length,
      sub: `${data.master.products.length.toLocaleString()} product variants`,
    },
    {
      label: "Pending restock",
      value: pending.length,
      sub: "Ready for their next destination",
    },
    {
      label: "Restocked",
      value: restocked.length + data.stock.total,
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
            <Button
              variant="default"
              nativeButton={false}
              role="link"
              render={<Link to="/scan" />}
            >
              Scan an item
            </Button>
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              role="link"
              render={<Link to="/inventory" />}
            >
              View inventory
            </Button>
          </div>
          {pending.length ? (
            <ItemGroup className="queue gap-0">
              {pending.slice(0, 5).map((u) => {
                const p = data.master.products.find(
                  (p) => p.id === u.product_id,
                )!;
                return (
                  <Item className="queue-item" role="listitem" key={u.id}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="line-clamp-none block break-words">
                        {p.name}
                      </ItemTitle>
                      <ItemDescription className="line-clamp-none text-xs mono break-all">
                        {u.id}
                      </ItemDescription>
                      <ItemDescription className="line-clamp-none text-xs">
                        {u.destination_id}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={"Review & place: " + u.id}
                        onClick={() => openProduct(p.id, u.id)}
                      >
                        Review &amp; place
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              role="link"
              render={<Link to="/history" />}
            >
              View history
            </Button>
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
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            role="link"
            render={<Link to="/locations" />}
          >
            Explore store map
          </Button>
        </div>
        <div className="mini-locations">
          {data.master.locations
            .toSorted((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
            .filter(
              (l, i, list) =>
                list.findIndex((x) => x.department === l.department) === i,
            )
            .slice(0, 4)
            .map((l) => {
              const load = locationLoad(
                data.units,
                l.id,
                data.stock.byLocation,
              );
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
