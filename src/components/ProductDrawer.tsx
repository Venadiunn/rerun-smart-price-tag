import { DisclosureTrigger } from "./ui";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useState } from "react";

import { useWorkspace, isManager } from "../lib/context";
import { command } from "../lib/api";
import { openingUnits } from "../lib/opening-stock";
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
  const opening = openingUnits(data, p.id);
  const timeline = data.events.filter((e) => e.entity_id === unitId);
  const smartTag = u ? data.tags.find((t) => t.unit_id === u.id) : undefined;
  if (!p) return null;
  return (
    <Modal title="Item details" onClose={onClose} wide>
      <div className="product-detail-head">
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
            <NativeSelect
              aria-label="Physical unit"
              value={unitId}
              onChange={async (e) => {
                const id = e.target.value;
                if (
                  opening.includes(id) &&
                  !(await run(() => command("open_unit", { id })))
                )
                  return;
                setUnitId(id);
              }}
            >
              <NativeSelectOption value="">
                Select a unit ({units.length + opening.length})
              </NativeSelectOption>
              {opening.map((id) => (
                <NativeSelectOption key={id} value={id}>
                  {id} · Restocked
                </NativeSelectOption>
              ))}
              {units.map((u) => (
                <NativeSelectOption key={u.id} value={u.id}>
                  {u.id} · {u.status}
                </NativeSelectOption>
              ))}
            </NativeSelect>
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
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Required when removing a unit"
                  />
                </label>
              )}
              <div className="transition-actions">
                {transitions[u.status].map((status) => (
                  <Button
                    type="button"
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
                  </Button>
                ))}
              </div>
              {isManager(data.profile.role) && (
                <details className="disclosure">
                  <DisclosureTrigger>
                    Assign an overflow destination
                  </DisclosureTrigger>
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
                      <NativeSelect
                        name="locationId"
                        defaultValue={u.destination_id}
                      >
                        {data.master.locations.map((l) => (
                          <NativeSelectOption key={l.id}>
                            {l.id}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </label>
                    <label>
                      Reason
                      <Input name="reason" minLength={3} required />
                    </label>
                    <Button type="submit" className="secondary" disabled={busy}>
                      Assign destination
                    </Button>
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
            <Alert className="notice" role="note">
              Select a physical unit to update its lifecycle or restock it.
            </Alert>
          )}
          <details className="disclosure">
            <DisclosureTrigger>Receive additional stock</DisclosureTrigger>
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
                <Input
                  name="quantity"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={1}
                  required
                />
              </label>
              <Button type="submit" className="primary" disabled={busy}>
                Receive stock
              </Button>
            </form>
          </details>
        </section>
        <aside className="label-sidebar">
          <label>
            QR label format
            <NativeSelect
              aria-label="QR label format"
              value={qrMode}
              onChange={(e) => setQrMode(e.target.value)}
            >
              <NativeSelectOption value="stable">
                Stable identifier
              </NativeSelectOption>
              <NativeSelectOption value="snapshot">
                Product data snapshot
              </NativeSelectOption>
              <NativeSelectOption value="tag" disabled={!smartTag}>
                Smart tag identifier
              </NativeSelectOption>
            </NativeSelect>
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
