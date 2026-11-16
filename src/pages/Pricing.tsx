import { useState } from "react";
import { BadgeDollarSign, Plus, ArrowRight } from "lucide-react";
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
  const manager = isManager(data.profile.role);
  return (
    <>
      <PageTitle
        eyebrow="CONTROLLED PRICE CHANGES"
        title="A thoughtful approach to pricing."
        description="Transparent suggestions, deliberate approvals, and a record of every change."
        actions={
          <button
            className="primary"
            onClick={() =>
              setRequest({
                productId: data.master.products[0].id,
                price: data.master.products[0].price,
                reason: "",
              })
            }
          >
            <Plus size={17} />
            Request price change
          </button>
        }
      />
      <div className="notice">
        <BadgeDollarSign size={21} />
        <span>
          Recommendations use explicit rules and fictional demonstration
          inventory. An approved change publishes a new master workbook. Tag
          previews and simulated writes are separate from physical displays and
          checkout systems.
        </span>
      </div>
      <section className="panel">
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
        <div className="suggestion-grid">
          {data.master.products.map((p) => {
            const s = markdownSuggestion(p, data.units, data.settings);
            return (
              <article key={p.id} className="suggestion">
                <span className="eyebrow">{p.id}</span>
                <h3>{p.name}</h3>
                <div className="price-pair">
                  <strong>{money(p.price)}</strong>
                  {s.eligible && (
                    <>
                      <ArrowRight size={16} />
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
                <button
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
                </button>
              </article>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Price change requests</h2>
        </div>
        {data.prices.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Proposed price</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {data.prices.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>
                        {
                          data.master.products.find(
                            (p) => p.id === r.product_id,
                          )?.name
                        }
                      </strong>
                      <small>{dateTime(r.created_at)}</small>
                    </td>
                    <td className="mono">{money(r.price)}</td>
                    <td className="reason-cell">{r.reason}</td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>
                      {manager && r.status === "Pending" && (
                        <div className="actions">
                          <button
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
                          </button>
                          <button
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
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="calm-empty">
            <h3>No price requests yet.</h3>
            <p>
              Suggestions become requests only when a staff member submits one.
            </p>
          </div>
        )}
      </section>
      {manager && (
        <section className="panel">
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
              <input
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
              <input
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
              <input
                name="discount"
                type="number"
                min={1}
                max={90}
                defaultValue={data.settings.discount}
                required
              />
            </label>
            <button className="secondary" disabled={busy}>
              Save rules
            </button>
          </form>
        </section>
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
              <select name="productId" defaultValue={request.productId}>
                {data.master.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Proposed price (USD)
              <input
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
              <textarea
                name="reason"
                minLength={3}
                maxLength={1000}
                defaultValue={request.reason}
                required
                rows={3}
              />
            </label>
            <button className="primary" disabled={busy}>
              Submit for approval
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
