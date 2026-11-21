import { DisclosureTrigger } from "../components/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Search } from "lucide-react";
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
        title="Activity history"
        description="Search operational events, scan findings, and recorded decisions."
        actions={
          <Button
            type="button"
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
            Export all JSON
          </Button>
        }
      />
      <Card className="panel gap-0 py-0 ring-0">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(String(value));
            setLimit(50);
          }}
        >
          <div className="table-toolbar history-toolbar">
            <TabsList aria-label="History records">
              <TabsTrigger value="events">
                <span className="tab-label">Activity</span>{" "}
                <span className="tab-count">{data.events.length}</span>
              </TabsTrigger>
              <TabsTrigger value="scans">
                <span className="tab-label">Scan records</span>{" "}
                <span className="tab-count">{data.scans.length}</span>
              </TabsTrigger>
            </TabsList>
            <label className="search-box">
              <Search size={17} />
              <Input
                aria-label="Search history"
                placeholder="Search codes, actions or alerts…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(50);
                }}
              />
            </label>
            <Button
              type="button"
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
            </Button>
          </div>
          <TabsContent value={tab}>
            {tab === "events" ? (
              <div className="table-scroll">
                <Table className="history-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time · Central</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Item / record</TableHead>
                      <TableHead>Responsible staff</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.slice(0, limit).map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{dateTime(e.created_at)}</TableCell>
                        <TableCell>
                          <span className="event-name">
                            {e.action.replaceAll("_", " ")}
                          </span>
                        </TableCell>
                        <TableCell className={e.entity_id ? "mono" : "muted"}>
                          {e.entity_id || "Store-wide operation"}
                        </TableCell>
                        <TableCell>
                          {e.actor === data.profile.id
                            ? "You"
                            : (data.profiles.find((p) => p.id === e.actor)
                                ?.email ??
                              (e.actor
                                ? `Staff ${e.actor.slice(0, 8)}`
                                : "Fictional seed"))}
                        </TableCell>
                        <TableCell>
                          <details>
                            <DisclosureTrigger>View details</DisclosureTrigger>
                            <pre className="event-details">
                              {JSON.stringify(e.details, null, 2)}
                            </pre>
                          </details>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
                      <DisclosureTrigger>Scanned values</DisclosureTrigger>
                      <pre>{JSON.stringify(s.raw, null, 2)}</pre>
                    </details>
                    {s.product_id && s.findings[0] !== "VALID ITEM" && (
                      <Button
                        type="button"
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
                      </Button>
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
              <Button
                type="button"
                className="load-more secondary"
                onClick={() => setLimit(limit + 50)}
              >
                Show more
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </>
  );
}
