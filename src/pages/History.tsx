import { useState } from "react";
import { Search, Download, ChevronDown } from "lucide-react";
import { useWorkspace } from "../lib/context";
import { download, exportCSV, command } from "../lib/api";
import { dateTime } from "../lib/domain";
import { PageTitle, Status, Empty } from "../components/ui";
export function History() {
  const { data, run, busy } = useWorkspace(),
    [tab, setTab] = useState("events"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(50);
  const events = data.events.filter((e) =>
      JSON.stringify(e).toLowerCase().includes(query.toLowerCase()),
    ),
    scans = data.scans.filter((s) =>
      JSON.stringify(s).toLowerCase().includes(query.toLowerCase()),
    );
  return (
    <>
      <PageTitle
        eyebrow="A RECORD OF EVERY STEP"
        title="Nothing gets lost in the process."
        description="Review lifecycle events, scan findings, tag recovery, and approved master changes."
        actions={
          <button
            className="secondary"
            onClick={() =>
              download(
                JSON.stringify(
                  {
                    exportedAt: new Date().toISOString(),
                    masterRevision: data.revision.id,
                    units: data.units,
                    tags: data.tags,
                    events: data.events,
                    scans: data.scans,
                    priceRequests: data.prices,
                    simulatedUpdates: data.updates,
                  },
                  null,
                  2,
                ),
                "rerun-history.json",
              )
            }
          >
            <Download size={17} />
            Export all JSON
          </button>
        }
      />
      <section className="panel">
        <div className="table-toolbar">
          <div className="tabs">
            <button
              className={tab === "events" ? "active" : ""}
              onClick={() => {
                setTab("events");
                setLimit(50);
              }}
            >
              Activity <span>{data.events.length}</span>
            </button>
            <button
              className={tab === "scans" ? "active" : ""}
              onClick={() => {
                setTab("scans");
                setLimit(50);
              }}
            >
              Scan records <span>{data.scans.length}</span>
            </button>
          </div>
          <label className="search-box">
            <Search size={17} />
            <input
              aria-label="Search history"
              placeholder="Search codes, actions or alerts…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(50);
              }}
            />
          </label>
          <button
            className="text-button"
            onClick={() =>
              exportCSV(
                (tab === "events" ? events : scans).map((e) =>
                  Object.fromEntries(
                    Object.entries(e).map(([k, v]) => [
                      k,
                      typeof v === "object" ? JSON.stringify(v) : v,
                    ]),
                  ),
                ),
                "rerun-history.csv",
              )
            }
          >
            Export CSV
          </button>
        </div>
        {tab === "events" ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time · Central</th>
                  <th>Event</th>
                  <th>Item / record</th>
                  <th>Responsible staff</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, limit).map((e) => (
                  <tr key={e.id}>
                    <td>{dateTime(e.created_at)}</td>
                    <td>
                      <span className="event-name">
                        {e.action.replaceAll("_", " ")}
                      </span>
                    </td>
                    <td className="mono">{e.entity_id}</td>
                    <td>
                      {e.actor === data.profile.id
                        ? "You"
                        : (data.profiles.find((p) => p.id === e.actor)?.email ??
                          (e.actor
                            ? `Staff ${e.actor.slice(0, 8)}`
                            : "Fictional seed"))}
                    </td>
                    <td>
                      <details>
                        <summary>View details</summary>
                        <pre className="event-details">
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="scan-history">
            {scans.slice(0, limit).map((s) => (
              <article key={s.id}>
                <div className="scan-history-top">
                  <div className="actions">
                    {s.findings.map((f) => (
                      <Status value={f} key={f} />
                    ))}
                  </div>
                  <time>{dateTime(s.created_at)}</time>
                </div>
                <p className="mono">
                  {s.product_id ?? "Unverified identifier"} · master{" "}
                  {s.master_revision.slice(0, 8)}
                </p>
                <details>
                  <summary>Scanned values</summary>
                  <pre>{JSON.stringify(s.raw, null, 2)}</pre>
                </details>
                {s.product_id && s.findings[0] !== "VALID ITEM" && (
                  <button
                    className="secondary small"
                    disabled={busy || !!s.acknowledged_at}
                    onClick={() =>
                      run(
                        () => command("acknowledge", { id: s.id }),
                        "Discrepancy acknowledged.",
                      )
                    }
                  >
                    {s.acknowledged_at
                      ? "Acknowledged"
                      : "Acknowledge discrepancy"}
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
        {(tab === "events" ? events : scans).length === 0 && (
          <Empty title="No matching history">
            Events will appear as staff use the workspace.
          </Empty>
        )}
        {(tab === "events" ? events : scans).length > limit && (
          <button
            className="load-more secondary"
            onClick={() => setLimit(limit + 50)}
          >
            Show more
            <ChevronDown size={16} />
          </button>
        )}
      </section>
    </>
  );
}
