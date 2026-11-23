import { ProductSelect } from "@/components/ProductSelect";
import {
  Empty as EmptyState,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";

import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";

import { useWorkspace, isManager } from "../lib/context";
import { command, publishMaster } from "../lib/api";
import { money, markdownSuggestion, dateTime } from "../lib/domain";
import { PageTitle, Status, Modal, field } from "../components/ui";
export function Pricing() {
  const { data, run, busy } = useWorkspace(),
    [request, setRequest] = useState<{
      productId: string;
      price: number;
      reason: string;
    } | null>(null);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(24);
  const matches = data.master.products.filter((p) =>
    (p.id + " " + p.name).toLowerCase().includes(search.toLowerCase()),
  );
  const manager = isManager(data.profile.role);
  return (
    <>
      <PageTitle
        eyebrow="CONTROLLED PRICE CHANGES"
        title="Pricing"
        description="Review suggestions and manage controlled price changes."
        actions={
          <Button
            type="button"
            className="primary"
            onClick={() =>
              setRequest({
                productId: data.master.products[0].id,
                price: data.master.products[0].price,
                reason: "",
              })
            }
          >
            Request price change
          </Button>
        }
      />
      <Alert className="notice" role="note">
        <span>
          Recommendations use explicit rules and fictional demonstration
          inventory. An approved change publishes a new master workbook. Tag
          previews and simulated writes are separate from physical displays and
          checkout systems.
        </span>
      </Alert>
      <Card className="panel gap-0 py-0 ring-0">
        <div className="section-heading">
          <div>
            <span className="eyebrow">RULE-BASED RECOMMENDATIONS</span>
            <h2>Products worth a closer look</h2>
          </div>
          <span className="small-chip">MANAGER APPROVAL REQUIRED</span>
        </div>
        <p className="section-copy">
          After {data.settings.ageDays} days, review products with sell-through
          below {data.settings.sellThrough}%. Suggest a {data.settings.discount}
          % markdown. Sell-through = currently sold units ÷ all received units
          for that product (including returns and stock-outs).
        </p>
        <Input
          aria-label="Search pricing"
          placeholder="Search products or IDs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(24);
          }}
        />
        <div className="suggestion-grid">
          {matches.slice(0, limit).map((p) => {
            const s = markdownSuggestion(
              p,
              data.units,
              data.settings,
              new Date(),
              data.stock.byProduct.get(p.id)?.remaining,
            );
            return (
              <article key={p.id} className="suggestion">
                <span className="eyebrow">{p.id}</span>
                <h3>{p.name}</h3>
                <div className="price-pair">
                  <strong>{money(p.price)}</strong>
                  {s.eligible && (
                    <>
                      <strong className="indigo-text">{money(s.price)}</strong>
                    </>
                  )}
                </div>
                <p>
                  {s.age} days ·{" "}
                  {s.rate === null
                    ? "No cohort"
                    : `${s.rate.toFixed(1)}% sell-through`}
                </p>
                <small>{s.message}</small>
                {p.cost === null && (
                  <small className="amber-text">
                    Cost not supplied; no margin floor available.
                  </small>
                )}
                <Button
                  type="button"
                  className="secondary"
                  disabled={!s.eligible}
                  onClick={() =>
                    setRequest({
                      productId: p.id,
                      price: s.price,
                      reason: `Rule-based review: ${s.age} days; ${s.rate?.toFixed(1)}% sell-through; ${data.settings.discount}% proposed markdown.`,
                    })
                  }
                >
                  Request review
                </Button>
              </article>
            );
          })}
        </div>
        {matches.length > limit && (
          <Button variant="outline" onClick={() => setLimit(limit + 24)}>
            Show more products
          </Button>
        )}
      </Card>
      <Card className="panel gap-0 py-0 ring-0">
        <div className="section-heading">
          <h2>Price change requests</h2>
        </div>
        {data.prices.length ? (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Proposed price</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.prices.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <strong>
                        {
                          data.master.products.find(
                            (p) => p.id === r.product_id,
                          )?.name
                        }
                      </strong>
                      <small>{dateTime(r.created_at)}</small>
                    </TableCell>
                    <TableCell className="mono">{money(r.price)}</TableCell>
                    <TableCell className="reason-cell">{r.reason}</TableCell>
                    <TableCell>
                      <Status value={r.status} />
                    </TableCell>
                    <TableCell>
                      {manager && r.status === "Pending" && (
                        <div className="actions">
                          <Button
                            type="button"
                            className="primary small"
                            disabled={busy}
                            onClick={() => {
                              const next = structuredClone(data.master);
                              next.products = next.products.map((p) =>
                                p.id === r.product_id
                                  ? { ...p, price: r.price }
                                  : p,
                              );
                              void run(
                                () =>
                                  publishMaster(next, data.revision.id, r.id),
                                "Price approved and new master revision published.",
                              );
                            }}
                          >
                            Approve & publish
                          </Button>
                          <Button
                            type="button"
                            className="secondary small"
                            disabled={busy}
                            onClick={() =>
                              run(
                                () =>
                                  command("price_reject", {
                                    id: r.id,
                                    version: r.version,
                                  }),
                                "Request rejected.",
                              )
                            }
                          >
                            Reject
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState className="calm-empty">
            <EmptyHeader>
              <EmptyTitle>No price requests yet.</EmptyTitle>
              <EmptyDescription>
                Suggestions become requests only when a staff member submits
                one.
              </EmptyDescription>
            </EmptyHeader>
          </EmptyState>
        )}
      </Card>
      {manager && (
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2>Markdown rules</h2>
          </div>
          <form
            className="rules-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(
                () =>
                  command("settings", {
                    ageDays: Number(f.get("ageDays")),
                    sellThrough: Number(f.get("sellThrough")),
                    discount: Number(f.get("discount")),
                  }),
                "Markdown rules updated.",
              );
            }}
          >
            <label>
              Minimum history (days)
              <Input
                name="ageDays"
                type="number"
                min={1}
                max={3650}
                defaultValue={data.settings.ageDays}
                required
              />
            </label>
            <label>
              Sell-through below (%)
              <Input
                name="sellThrough"
                type="number"
                min={0}
                max={100}
                defaultValue={data.settings.sellThrough}
                required
              />
            </label>
            <label>
              Suggested discount (%)
              <Input
                name="discount"
                type="number"
                min={1}
                max={90}
                defaultValue={data.settings.discount}
                required
              />
            </label>
            <Button type="submit" className="secondary" disabled={busy}>
              Save rules
            </Button>
          </form>
        </Card>
      )}
      {request && (
        <Modal title="Request a price change" onClose={() => setRequest(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  () =>
                    command("price_request", {
                      productId: field(f, "productId"),
                      price: Math.round(Number(f.get("price")) * 100),
                      reason: field(f, "reason"),
                    }),
                  "Price request submitted.",
                )
              )
                setRequest(null);
            }}
          >
            <label>
              Product
              <ProductSelect
                products={data.master.products}
                initial={request.productId}
              />
            </label>
            <label>
              Proposed price (USD)
              <Input
                name="price"
                type="number"
                min={0}
                step="0.01"
                defaultValue={request.price / 100}
                required
              />
            </label>
            <label>
              Reason
              <Textarea
                name="reason"
                minLength={3}
                maxLength={1000}
                defaultValue={request.reason}
                required
                rows={3}
              />
            </label>
            <Button type="submit" className="primary" disabled={busy}>
              Submit for approval
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
