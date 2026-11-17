import { useState } from "react";
import { MapPin, ScanLine, PackagePlus, ArrowRight } from "lucide-react";
import { useWorkspace, isManager } from "../lib/context";
import { command } from "../lib/api";
import { money, qrPayload, dateTime } from "../lib/domain";
import type { UnitStatus } from "../lib/types";
import { Modal, Status, field } from "./ui";
import { QRLabel } from "./QRLabel";
const transitions: Record<UnitStatus, UnitStatus[]> = {
  Offered: ["In-Transit"],
  "In-Transit": ["Received in Store"],
  "Received in Store": ["Pending Restock", "Stocked Out"],
  "Pending Restock": ["Restocked", "Stocked Out"],
  Restocked: ["Pending Restock", "Scanned at Register", "Stocked Out"],
  "Scanned at Register": ["Sold", "Pending Restock"],
  Sold: ["Returned"],
  Returned: ["Inspected"],
  Inspected: ["Pending Restock", "Stocked Out"],
  "Stocked Out": [],
};
export function ProductDrawer({
  productId,
  initialUnitId,
  onClose,
}: {
  productId: string;
  initialUnitId?: string;
  onClose: () => void;
}) {
  const { data, run, busy } = useWorkspace(),
    [unitId, setUnitId] = useState(initialUnitId ?? ""),
    [qrMode, setQrMode] = useState("stable"),
    [reason, setReason] = useState("");
  const p = data.master.products.find((p) => p.id === productId)!,
    units = data.units.filter((u) => u.product_id === p.id),
    u = units.find((u) => u.id === unitId);
  const timeline = data.events.filter((e) => e.entity_id === unitId);
  const smartTag = u ? data.tags.find((t) => t.unit_id === u.id) : undefined;
  if (!p) return null;
  return (
    <Modal title="Item details" onClose={onClose} wide>
      <div className="product-detail-head">
        <div className="product-monogram large">
          {p.name
            .split(" ")
            .map((s) => s[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div>
          <span className="eyebrow">
            {p.categoryId} / {p.subcategory}
          </span>
          <h2>{p.name}</h2>
          <span className="mono muted">
            {p.id} · SKU {p.sku}
          </span>
        </div>
        <strong className="detail-price">{money(p.price)}</strong>
      </div>
      <div className="destination">
        <MapPin />
        <div>
          <small>VERIFIED DESTINATION · MASTER v{data.revision.revision}</small>
          <strong>{u?.destination_id ?? p.locationId}</strong>
          {u?.current_location_id && (
            <span>Last confirmed placement: {u.current_location_id}</span>
          )}
        </div>
      </div>
      <div className="detail-columns">
        <section>
          <div className="facts">
            {Object.entries({
              Size: p.size,
              Color: p.color,
              Classification: p.classification,
              Supplier: p.supplierId,
              Department: p.departmentCode,
              Taxable: p.taxable ? "Yes" : "No",
            }).map(([k, v]) => (
              <div key={k}>
                <small>{k}</small>
                <strong>{v || "—"}</strong>
              </div>
            ))}
          </div>
          <label>
            Physical unit
            <select
              aria-label="Physical unit"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Select a unit ({units.length})</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id} · {u.status}
                </option>
              ))}
            </select>
          </label>
          {u ? (
            <>
              <div className="unit-state">
                <Status value={u.status} />
                <span className="muted">Record version {u.version}</span>
              </div>
              <p className="hint">
                Smart tag:{" "}
                <strong>
                  {smartTag?.id ??
                    "Not assigned; auto sort will assign a tag when space is allocated."}
                </strong>
              </p>
              {transitions[u.status].includes("Stocked Out") && (
                <label>
                  Reason for stock-out
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Required when removing a unit"
                  />
                </label>
              )}
              <div className="transition-actions">
                {transitions[u.status].map((status) => (
                  <button
                    key={status}
                    className={status === "Restocked" ? "primary" : "secondary"}
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          command("transition", {
                            id: u.id,
                            version: u.version,
                            status,
                            reason,
                          }),
                        ["Received in Store", "Inspected"].includes(status)
                          ? "Unit updated. Automatic sorting checked its destination."
                          : `Unit marked ${status}.`,
                      )
                    }
                  >
                    {status === "Restocked"
                      ? "Confirm restocked"
                      : `Mark ${status}`}
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
              {isManager(data.profile.role) && (
                <details className="disclosure">
                  <summary>Assign an overflow destination</summary>
                  <form
                    className="stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(
                        () =>
                          command("destination", {
                            id: u.id,
                            version: u.version,
                            locationId: field(f, "locationId"),
                            reason: field(f, "reason"),
                          }),
                        "Destination updated.",
                      );
                    }}
                  >
                    <label>
                      Destination
                      <select name="locationId" defaultValue={u.destination_id}>
                        {data.master.locations.map((l) => (
                          <option key={l.id}>{l.id}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Reason
                      <input name="reason" minLength={3} required />
                    </label>
                    <button className="secondary" disabled={busy}>
                      Assign destination
                    </button>
                  </form>
                </details>
              )}
              <h3 className="subheading">Unit history</h3>
              <div className="timeline compact">
                {timeline.map((e) => (
                  <div key={e.id}>
                    <span className="timeline-dot" />
                    <section>
                      <strong>{e.action.replaceAll("_", " ")}</strong>
                      <time>{dateTime(e.created_at)}</time>
                    </section>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="notice">
              <ScanLine size={18} />
              Select a physical unit to update its lifecycle or restock it.
            </div>
          )}
          <details className="disclosure">
            <summary>
              <PackagePlus size={16} /> Receive additional stock
            </summary>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void run(
                  () =>
                    command("receive", {
                      productId: p.id,
                      quantity: Number(f.get("quantity")),
                    }),
                  "Stock received with permanent unit IDs.",
                );
              }}
            >
              <label>
                Units
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={1}
                  required
                />
              </label>
              <button className="primary" disabled={busy}>
                Receive stock
              </button>
            </form>
          </details>
        </section>
        <aside className="label-sidebar">
          <label>
            QR label format
            <select
              aria-label="QR label format"
              value={qrMode}
              onChange={(e) => setQrMode(e.target.value)}
            >
              <option value="stable">Stable identifier</option>
              <option value="snapshot">Product data snapshot</option>
              <option value="tag" disabled={!smartTag}>
                Smart tag identifier
              </option>
            </select>
          </label>
          <QRLabel
            value={
              qrMode === "tag" && smartTag
                ? `rerun:tag:${smartTag.id}`
                : qrMode === "snapshot"
                  ? qrPayload(p, u?.id)
                  : u
                    ? `rerun:unit:${u.id}`
                    : p.id
            }
            label={qrMode === "tag" && smartTag ? smartTag.id : (u?.id ?? p.id)}
          />
          <p className="hint">
            Stable labels always look up current information. Snapshot labels
            also detect differences from the master.
          </p>
        </aside>
      </div>
    </Modal>
  );
}
