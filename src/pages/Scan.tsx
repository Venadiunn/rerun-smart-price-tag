import { DisclosureTrigger } from "../components/ui";
import {
  Empty as EmptyState,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import type QrScanner from "qr-scanner";
import { useWorkspace } from "../lib/context";
import { command } from "../lib/api";
import { openingUnits } from "../lib/opening-stock";
import { parseScan, qrPayload, money } from "../lib/domain";
import type { Scan as ScanRecord } from "../lib/types";
import { PageTitle, Status } from "../components/ui";
export function Scan() {
  const { data, run, busy, openProduct } = useWorkspace(),
    [raw, setRaw] = useState(
      () => new URLSearchParams(location.search).get("code") ?? "",
    ),
    [result, setResult] = useState<ScanRecord | null>(null),
    [unitId, setUnitId] = useState(""),
    [active, setActive] = useState(false),
    [cameras, setCameras] = useState<{ id: string; label: string }[]>([]),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    scanner = useRef<QrScanner | null>(null),
    locked = useRef(false);
  useEffect(
    () => () => {
      scanner.current?.destroy();
    },
    [],
  );
  async function lookup(value: string) {
    if (locked.current) return;
    locked.current = true;
    scanner.current?.stop();
    setActive(false);
    setError("");
    try {
      parseScan(value, data.master, data.units, data.tags, location.origin);
      let normalized = value;
      if (/^https?:/i.test(value))
        normalized = new URL(value).searchParams.get("code")!;
      const found = await run(() =>
        command<ScanRecord>("scan", { raw: normalized }),
      );
      if (found) {
        setResult(found);
        setUnitId(found.unit_id ?? "");
        setRaw(value);
      } else locked.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      locked.current = false;
    }
  }
  async function start() {
    setError("");
    locked.current = false;
    setResult(null);
    try {
      const { default: Scanner } = await import("qr-scanner");
      scanner.current?.destroy();
      scanner.current = new Scanner(
        video.current!,
        (r) => void lookup(r.data),
        {
          preferredCamera: "environment",
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        },
      );
      await scanner.current.start();
      setActive(true);
      setCameras(await Scanner.listCameras());
    } catch (e) {
      setError(
        `Camera unavailable: ${e instanceof Error ? e.message : String(e)}. Use an image upload or manual entry.`,
      );
    }
  }
  const product = data.master.products.find((p) => p.id === result?.product_id),
    units = data.units.filter((u) => u.product_id === product?.id);
  const opening = product ? openingUnits(data, product.id) : [];
  return (
    <>
      <PageTitle
        eyebrow="IDENTIFY & VERIFY"
        title="Scan & verify"
        description="Identify a product, unit, or tag against the approved master."
      />
      <div className="scan-grid">
        <Card className="panel gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2>QR scanner</h2>
            <span className="live-label">
              {active ? "CAMERA ACTIVE" : "READY TO SCAN"}
            </span>
          </div>
          <div className={`camera-box ${active ? "active" : ""}`}>
            <video
              ref={video}
              playsInline
              muted
              aria-label="QR scanning camera"
            />
            {!active && (
              <div className="camera-placeholder">
                <h3>Bring an item into focus.</h3>
                <p>Camera access begins when you choose Start camera.</p>
              </div>
            )}
          </div>
          <div className="scanner-controls">
            <Button
              type="button"
              className="primary"
              disabled={busy}
              onClick={
                active
                  ? () => {
                      scanner.current?.stop();
                      setActive(false);
                    }
                  : start
              }
            >
              {active ? "Stop camera" : "Start camera"}
            </Button>
            <label className="secondary upload-button">
              Upload QR image
              <Input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  e.target.value = "";
                  if (file.size > 10485760) {
                    setError("Image must be smaller than 10 MB.");
                    return;
                  }
                  try {
                    const { default: Scanner } = await import("qr-scanner");
                    const image = await Scanner.scanImage(file, {
                      returnDetailedScanResult: true,
                    });
                    locked.current = false;
                    await lookup(image.data);
                  } catch {
                    setError("No readable QR code found. Try a clearer image.");
                  }
                }}
              />
            </label>
          </div>
          {active && cameras.length > 1 && (
            <label>
              Camera
              <NativeSelect
                onChange={(e) =>
                  scanner.current
                    ?.setCamera(e.target.value)
                    .catch((e) => setError(String(e)))
                }
              >
                {cameras.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          )}
          <div className="manual-entry">
            <h3>Manual or external scanner input</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                locked.current = false;
                void lookup(raw);
              }}
            >
              <Textarea
                aria-label="Item code or QR JSON"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"PROD-001, UNIT-…, TAG-…, or product JSON"}
                rows={3}
              />
              <Button
                type="submit"
                className="secondary"
                disabled={busy || !raw.trim()}
              >
                Look up item
              </Button>
            </form>
          </div>
          {error && (
            <Alert role="alert" className="inline-error">
              {error}
            </Alert>
          )}
        </Card>
        <Card className="panel scan-result gap-0 py-0 ring-0">
          <div className="section-heading">
            <h2>Verification result</h2>
            {result && (
              <Button
                type="button"
                className="text-button"
                onClick={() => {
                  locked.current = false;
                  setResult(null);
                  setRaw("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
          {result ? (
            <>
              <div className="scan-alerts">
                {result.findings.map((f) => (
                  <Status value={f} key={f} />
                ))}
              </div>
              {product ? (
                <>
                  <span className="eyebrow">REGISTERED PRODUCT</span>
                  <h2>{product.name}</h2>
                  <p className="mono muted">
                    {product.id} · {money(product.price)}
                  </p>
                  <div className="destination">
                    <div>
                      <small>VERIFIED MASTER DESTINATION</small>
                      <strong>
                        {units.find((u) => u.id === unitId)?.destination_id ??
                          product.locationId}
                      </strong>
                    </div>
                  </div>
                  <div className="scan-comparison">
                    <div>
                      <small>Scanned payload</small>
                      <pre>{JSON.stringify(result.raw, null, 2)}</pre>
                    </div>
                    <div>
                      <small>
                        Master v
                        {data.revisions.find(
                          (r) => r.id === result.master_revision,
                        )?.revision ?? "—"}{" "}
                        values
                      </small>
                      <pre>{qrPayload(product)}</pre>
                    </div>
                  </div>
                  {result.findings[0] !== "VALID ITEM" && (
                    <Alert className="notice warning" role="note">
                      <p>
                        These values differ from the master. Acknowledge the
                        alert to continue using the verified destination. Master
                        values remain unchanged.
                      </p>
                      <Button
                        type="button"
                        className="secondary"
                        disabled={busy || !!result.acknowledged_at}
                        onClick={async () => {
                          const done = await run(
                            () => command("acknowledge", { id: result.id }),
                            "Discrepancy acknowledged.",
                          );
                          if (done)
                            setResult({
                              ...result,
                              acknowledged_at: new Date().toISOString(),
                            });
                        }}
                      >
                        {result.acknowledged_at
                          ? "Acknowledged"
                          : "Acknowledge discrepancy"}
                      </Button>
                    </Alert>
                  )}
                  <label>
                    Choose the physical unit
                    <NativeSelect
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
                        Select a unit
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
                  <Button
                    type="button"
                    className="primary full"
                    disabled={
                      !unitId ||
                      busy ||
                      (result.findings[0] !== "VALID ITEM" &&
                        !result.acknowledged_at)
                    }
                    onClick={() => openProduct(product.id, unitId)}
                  >
                    Continue with this unit
                  </Button>
                </>
              ) : (
                <Alert className="notice danger" role="note">
                  {result.findings[0] === "UNASSIGNED TAG"
                    ? "This tag is not assigned to an item. Assign it from Tags first."
                    : "This item is not registered in the master. Ask a manager to review it; it cannot be treated as verified inventory."}
                </Alert>
              )}
              <p className="hint">
                Compared against an immutable master revision. Scan and
                acknowledgment are saved in History.
              </p>
            </>
          ) : (
            <EmptyState className="calm-empty">
              <EmptyHeader>
                <EmptyTitle>Ready when you are.</EmptyTitle>
                <EmptyDescription>
                  A scan brings up the verified product, destination, and any
                  discrepancies.
                </EmptyDescription>
                <span className="small-chip">
                  MASTER v{data.revision.revision} CONNECTED
                </span>
              </EmptyHeader>
            </EmptyState>
          )}
        </Card>
      </div>
      <details className="panel demo-scenarios">
        <DisclosureTrigger>
          Try a documented QR scenario <span>Fictional demonstration data</span>
        </DisclosureTrigger>
        <p>
          Choose a payload, then scan the generated label from Item details or
          use manual lookup. These examples never change master records.
        </p>
        <div className="actions">
          {[
            "Valid item",
            "Altered price",
            "Missing location",
            "Unknown item",
            "Altered name",
            "Wrong location",
          ].map((label, i) => (
            <Button
              type="button"
              className="secondary"
              key={label}
              onClick={() => {
                const p =
                    data.master.products[
                      i === 3 ? 0 : Math.min(i, data.master.products.length - 1)
                    ],
                  v = JSON.parse(qrPayload(p));
                if (i === 1) v.Price = 0.01;
                if (i === 2) v.Intended_Location = null;
                if (i === 3) v.Item_ID = "PROD-999";
                if (i === 4) v.Item_Name = "Altered Item Name";
                if (i === 5) v.Intended_Location = "Aisle-99-Shelf-Z";
                locked.current = false;
                setResult(null);
                setRaw(JSON.stringify(v));
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </details>
    </>
  );
}
