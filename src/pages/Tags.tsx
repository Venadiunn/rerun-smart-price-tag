import { Alert } from "@/components/ui/alert";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

import { useWorkspace, isManager } from "../lib/context";
import { command } from "../lib/api";
import { money, dateTime } from "../lib/domain";
import { PageTitle, Status, Modal, field } from "../components/ui";
import { QRLabel } from "../components/QRLabel";
export function Tags() {
  const { data, run, busy } = useWorkspace(),
    [selected, setSelected] = useState(""),
    [register, setRegister] = useState(false),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [limit, setLimit] = useState(40);
  const tag = data.tags.find((t) => t.id === selected),
    unit = data.units.find((u) => u.id === tag?.unit_id),
    product = data.master.products.find((p) => p.id === unit?.product_id);
  const updates = data.updates.filter((u) => u.tag_id === tag?.id);
  const capacity = data.master.locations.reduce(
    (sum, l) => sum + (l.capacity ?? 0),
    0,
  );
  const unitsById = new Map(data.units.map((u) => [u.id, u])),
    productsById = new Map(data.master.products.map((p) => [p.id, p]));
  const filtered = data.tags.filter((t) => {
    const u = t.unit_id ? unitsById.get(t.unit_id) : undefined,
      p = u ? productsById.get(u.product_id) : undefined;
    return (
      (!statusFilter || t.status === statusFilter) &&
      [t.id, t.unit_id, p?.id, p?.name, u?.destination_id]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  });
  return (
    <>
      <PageTitle
        eyebrow="ASSIGN · RECOVER · REUSE"
        title="Reusable tags"
        description="Manage the tag pool, assignments, recovery, and simulated displays."
        actions={
          isManager(data.profile.role) && (
            <Button
              type="button"
              className="primary"
              onClick={() => setRegister(true)}
            >
              Register tag
            </Button>
          )
        }
      />
      <div className="summary-line">
        <span>
          <strong>{data.tags.length}</strong> total tags
        </span>
        <span>
          <strong>{capacity}</strong> capacity slots
        </span>
        <span>
          <strong>
            {data.tags.filter((t) => t.status === "Assigned").length}
          </strong>{" "}
          assigned
        </span>
        <span>
          <strong>
            {data.tags.filter((t) => t.status === "Available").length}
          </strong>{" "}
          available
        </span>
        <span>
          <strong>
            {data.tags.filter((t) => t.status === "Inspection").length}
          </strong>{" "}
          awaiting inspection
        </span>
      </div>
      <div className="panel table-toolbar">
        <label className="search-box">
          <Input
            aria-label="Search smart tags"
            placeholder="Search tag, unit, product or location…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(40);
            }}
          />
        </label>
        <NativeSelect
          aria-label="Tag status filter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setLimit(40);
          }}
        >
          <NativeSelectOption value="">All tag statuses</NativeSelectOption>
          {["Assigned", "Available", "Inspection", "Retired"].map((s) => (
            <NativeSelectOption key={s}>{s}</NativeSelectOption>
          ))}
        </NativeSelect>
        <span>{filtered.length} matching tags</span>
      </div>
      <div className="tag-grid">
        {filtered.slice(0, limit).map((t) => (
          <Button
            type="button"
            className="panel tag-card h-auto w-full whitespace-normal justify-start text-left"
            key={t.id}
            onClick={() => setSelected(t.id)}
          >
            <div className="tag-card-top">
              <Status value={t.status} />
            </div>
            <strong>{t.id}</strong>
            <p>
              {t.unit_id
                ? productsById.get(unitsById.get(t.unit_id)?.product_id ?? "")
                    ?.name
                : "Ready for a future assignment"}
            </p>
            <small className="mono">{t.unit_id ?? "No active unit"}</small>
            <span className="tag-manage">Manage tag</span>
          </Button>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="notice">No smart tags match this search.</p>
      )}
      {filtered.length > limit && (
        <Button
          type="button"
          className="secondary"
          onClick={() => setLimit(limit + 40)}
        >
          Show more tags ({filtered.length - limit} remaining)
        </Button>
      )}
      {tag && (
        <Modal title={`Manage ${tag.id}`} onClose={() => setSelected("")} wide>
          <div className="detail-columns">
            <section>
              <Status value={tag.status} />
              {product && unit ? (
                <>
                  <div className="digital-tag">
                    <small>RERUN / DIGITAL TAG SIMULATOR</small>
                    <h2>{product.name}</h2>
                    <strong>{money(product.price)}</strong>
                    <span>
                      Size {product.size} · {product.color}
                    </span>
                    <p>{unit.destination_id}</p>
                    <small>
                      {tag.id} · {unit.id}
                    </small>
                  </div>
                  <p className="hint">
                    Preview of the approved record. Physical hardware is not
                    connected.
                  </p>
                  <div className="actions">
                    <Button
                      type="button"
                      className="primary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => command("display_create", { id: tag.id }),
                          "Simulated update prepared.",
                        )
                      }
                    >
                      Prepare simulated update
                    </Button>
                    <Button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            command("tag_action", {
                              id: tag.id,
                              version: tag.version,
                              action: "recover",
                            }),
                          "Tag recovered for inspection.",
                        )
                      }
                    >
                      Recover tag
                    </Button>
                  </div>
                </>
              ) : tag.status === "Available" ? (
                <form
                  className="stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void run(
                      () =>
                        command("tag_action", {
                          id: tag.id,
                          version: tag.version,
                          action: "assign",
                          unitId: field(f, "unitId"),
                        }),
                      "Tag assigned.",
                    );
                  }}
                >
                  <label>
                    Assign to an eligible unit
                    <NativeSelect name="unitId" required>
                      <NativeSelectOption value="">
                        Select a physical unit
                      </NativeSelectOption>
                      {data.units
                        .filter(
                          (u) =>
                            !["Sold", "Stocked Out", "Returned"].includes(
                              u.status,
                            ) && !data.tags.some((t) => t.unit_id === u.id),
                        )
                        .map((u) => (
                          <NativeSelectOption key={u.id} value={u.id}>
                            {u.id} ·{" "}
                            {
                              data.master.products.find(
                                (p) => p.id === u.product_id,
                              )?.name
                            }
                          </NativeSelectOption>
                        ))}
                    </NativeSelect>
                  </label>
                  <Button type="submit" className="primary" disabled={busy}>
                    Confirm assignment
                  </Button>
                </form>
              ) : tag.status === "Inspection" ? (
                <div className="stack">
                  <Alert className="notice" role="note">
                    Inspect the recovered tag for readability and damage before
                    making it available again.
                  </Alert>
                  <Button
                    type="button"
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          command("tag_action", {
                            id: tag.id,
                            version: tag.version,
                            action: "inspect",
                          }),
                        "Inspection confirmed. Tag is available.",
                      )
                    }
                  >
                    Confirm tag passed inspection
                  </Button>
                </div>
              ) : (
                <p className="hint">This tag has been retired.</p>
              )}
              {isManager(data.profile.role) &&
                ["Available", "Inspection"].includes(tag.status) && (
                  <Button
                    type="button"
                    className="text-button danger-text"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () =>
                          command("tag_action", {
                            id: tag.id,
                            version: tag.version,
                            action: "retire",
                          }),
                        "Tag retired.",
                      )
                    }
                  >
                    Retire damaged tag
                  </Button>
                )}
              <h3 className="subheading">Simulated display updates</h3>
              {updates.length ? (
                updates.map((d) => (
                  <article className="display-attempt" key={d.id}>
                    <div>
                      <Status value={d.status} />
                      <small>
                        Attempt {d.attempt} · {dateTime(d.created_at)}
                      </small>
                    </div>
                    <p>
                      {String(d.requested.name)} ·{" "}
                      {money(Number(d.requested.price))} ·{" "}
                      {String(d.requested.locationId)}
                    </p>
                    {d.requested.masterRevision !== data.revision.id && (
                      <span className="danger-text">
                        Master changed; prepare a new update.
                      </span>
                    )}
                    <div className="actions">
                      {(d.status === "Pending"
                        ? ["Written", "Failed"]
                        : d.status === "Written"
                          ? ["Verified", "Failed"]
                          : d.status === "Failed"
                            ? ["Pending"]
                            : []
                      ).map((status) => (
                        <Button
                          type="button"
                          className="secondary"
                          key={status}
                          disabled={busy}
                          onClick={() =>
                            run(
                              () =>
                                command("display_action", {
                                  id: d.id,
                                  version: d.version,
                                  status,
                                }),
                              `Simulated update marked ${status}.`,
                            )
                          }
                        >
                          {status === "Verified"
                            ? "Confirm visual check (simulated)"
                            : status === "Pending"
                              ? "Retry"
                              : `Simulate ${status.toLowerCase()}`}
                        </Button>
                      ))}
                    </div>
                  </article>
                ))
              ) : (
                <p className="hint">No update attempts yet.</p>
              )}
              <details className="disclosure">
                <summary>Assignment and recovery history</summary>
                {data.events
                  .filter((e) => e.entity_id === tag.id)
                  .map((e) => (
                    <p key={e.id}>
                      <strong>{e.action}</strong> · {dateTime(e.created_at)}
                      <br />
                      <small>{JSON.stringify(e.details)}</small>
                    </p>
                  ))}
              </details>
            </section>
            <aside className="label-sidebar">
              <QRLabel value={`rerun:tag:${tag.id}`} label={tag.id} />
              <p className="hint">
                This label identifies the reusable tag. Scanning resolves its
                current unit assignment.
              </p>
            </aside>
          </div>
        </Modal>
      )}
      {register && (
        <Modal
          title="Register a reusable tag"
          onClose={() => setRegister(false)}
        >
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (
                await run(
                  () => command("tag_register", { id: field(f, "id") }),
                  "Tag registered.",
                )
              )
                setRegister(false);
            }}
          >
            <label>
              Tag identifier
              <Input
                name="id"
                pattern="TAG-[A-Za-z0-9-]+"
                placeholder="TAG-0021"
                required
              />
            </label>
            <p className="hint">
              Use a unique TAG- identifier. Registration does not assign a
              product.
            </p>
            <Button type="submit" className="primary" disabled={busy}>
              Register tag
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}
