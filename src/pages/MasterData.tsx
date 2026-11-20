import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Download,
  Upload,
  Plus,
  FileSpreadsheet,
  History,
  Check,
  PenLine,
} from "lucide-react";
import { useWorkspace, isManager } from "../lib/context";
import {
  publishMaster,
  downloadMaster,
  masterRequest,
  exportCSV,
} from "../lib/api";
import { productCsvRows } from "../lib/csv";
import { supabase } from "../lib/supabase";
import { dateTime, validateMaster, money } from "../lib/domain";
import type { Master, Product, Location, Category } from "../lib/types";
import { PageTitle, Modal, Empty, field } from "../components/ui";
type Kind = keyof Master;
type Edit = { kind: Kind; index: number; value: Record<string, unknown> };
export function MasterData() {
  const { data, run, busy } = useWorkspace(),
    [draft, setDraft] = useState<{
      master: Master;
      base: Master;
      revision: string;
    } | null>(null),
    [edit, setEdit] = useState<Edit | null>(null),
    [tab, setTab] = useState<Kind>("products"),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1);
  const manager = isManager(data.profile.role),
    master = draft?.master ?? data.master;
  const records = master[tab]
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      JSON.stringify(row).toLowerCase().includes(query.toLowerCase()),
    );
  const pages = Math.max(1, Math.ceil(records.length / 50));
  const currentPage = Math.min(page, pages);
  function stage(next: Master) {
    setDraft(
      draft
        ? { ...draft, master: next }
        : {
            master: next,
            base: structuredClone(data.master),
            revision: data.revision.id,
          },
    );
  }
  function editor(kind: Kind, index = -1) {
    const defaults =
      kind === "products"
        ? {
            id: "",
            sku: "",
            barcode: "",
            name: "",
            price: 0,
            cost: null,
            categoryId: master.categories[0]?.id ?? "",
            subcategory: "",
            classification: "",
            supplierId: "",
            departmentCode: "",
            taxable: true,
            size: "",
            color: "",
            locationId: master.locations[0]?.id ?? "",
            introducedAt: new Date().toISOString().slice(0, 10),
          }
        : kind === "locations"
          ? {
              id: "",
              department: "",
              aisle: "",
              rack: "",
              shelf: "",
              capacity: null,
            }
          : { id: "", name: "" };
    setEdit({
      kind,
      index,
      value: (index >= 0 ? { ...master[kind][index] } : defaults) as Record<
        string,
        unknown
      >,
    });
  }
  const changes = draft
    ? (["products", "locations", "categories"] as Kind[]).flatMap((kind) =>
        draft.master[kind]
          .flatMap((row) => {
            const old = draft.base[kind].find((p) => p.id === row.id);
            if (!old) return [`Added ${kind.slice(0, -1)} ${row.id}`];
            return Object.entries(row)
              .filter(
                ([key, value]) =>
                  JSON.stringify(
                    (old as unknown as Record<string, unknown>)[key],
                  ) !== JSON.stringify(value),
              )
              .map(
                ([key, value]) =>
                  `${row.id} · ${key}: ${String((old as unknown as Record<string, unknown>)[key] ?? "blank")} → ${String(value ?? "blank")}`,
              );
          })
          .concat(
            draft.base[kind]
              .filter((row) => !draft.master[kind].some((n) => n.id === row.id))
              .map((row) => `Removed ${kind.slice(0, -1)} ${row.id}`),
          ),
      )
    : [];
  return (
    <>
      <PageTitle
        eyebrow="AUTHORITATIVE MASTER"
        title="Master data"
        description="Review, stage, and publish approved product and location definitions."
        actions={
          <>
            <Button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                run(() => downloadMaster(data.revision.storage_path))
              }
            >
              <Download size={17} />
              Download master XLSX
            </Button>
            <Button
              type="button"
              className="secondary"
              onClick={() =>
                exportCSV(
                  productCsvRows(data.master.products),
                  "ReRun Master Products.csv",
                )
              }
            >
              <Download size={17} />
              Products CSV
            </Button>
            {manager && (
              <label className="primary upload-button">
                <Upload size={17} />
                Import CSV / XLSX
                <Input
                  type="file"
                  accept=".xlsx,.csv"
                  disabled={busy}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    await run(async () => {
                      if (file.size > 2097152)
                        throw new Error("Upload must be 2 MB or smaller.");
                      const bytes = new Uint8Array(await file.arrayBuffer());
                      let binary = "";
                      for (const b of bytes) binary += String.fromCharCode(b);
                      const result = await masterRequest({
                        action: "import",
                        filename: file.name,
                        base64: btoa(binary),
                      });
                      setDraft({
                        master: result.master,
                        base: structuredClone(data.master),
                        revision: result.expectedRevision,
                      });
                    }, "Upload validated. Review the candidate before publishing.");
                  }}
                />
              </label>
            )}
          </>
        }
      />
      <div className="master-status">
        <div className="master-file-icon">
          <FileSpreadsheet size={28} />
        </div>
        <div>
          <strong>ReRun Master Inventory.xlsx</strong>
          <span>
            Active revision {data.revision.revision} ·{" "}
            {dateTime(data.revision.created_at)}
          </span>
        </div>
        <span className="small-chip">
          <Check size={13} />
          PUBLISHED
        </span>
      </div>
      {draft && (
        <Card className="panel draft-review gap-0 py-0 ring-0">
          <div className="section-heading">
            <div>
              <span className="eyebrow">UNPUBLISHED CANDIDATE</span>
              <h2>
                Review {changes.length} change{changes.length === 1 ? "" : "s"}
              </h2>
            </div>
            <div className="actions">
              <Button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => setDraft(null)}
              >
                Discard draft
              </Button>
              <Button
                type="button"
                className="primary"
                disabled={busy || !changes.length}
                onClick={async () => {
                  const done = await run(
                    () => publishMaster(draft.master, draft.revision),
                    "Master revision published.",
                  );
                  if (done) setDraft(null);
                }}
              >
                Publish new revision
              </Button>
            </div>
          </div>
          <ul className="change-list">
            {changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {draft.revision !== data.revision.id && (
            <div className="inline-error">
              Another revision was published. Discard this candidate and reapply
              your edits to the latest master.
            </div>
          )}
          <p className="hint">
            Publication updates the workbook and searchable records together.
            Operational histories remain intact.
          </p>
        </Card>
      )}
      <Card className="panel gap-0 py-0 ring-0">
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as Kind);
            setPage(1);
            setQuery("");
          }}
        >
          <div className="master-tabs">
            <TabsList aria-label="Master records">
              {(["products", "locations", "categories"] as Kind[]).map((t) => (
                <TabsTrigger key={t} value={t}>
                  {t}
                  <span>{master[t].length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {manager && (
              <Button
                type="button"
                className="secondary"
                onClick={() => editor(tab)}
              >
                <Plus size={16} />
                Add {tab === "categories" ? "category" : tab.slice(0, -1)}
              </Button>
            )}
          </div>
          <TabsContent value={tab}>
            <div className="table-toolbar">
              <label className="search-box">
                <Input
                  aria-label="Search master records"
                  placeholder="Search identifiers, names, or destinations…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <span className="text-sm text-muted-foreground">
                {records.length.toLocaleString()} matching records
              </span>
            </div>
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Identifier</TableHead>
                    <TableHead>
                      {tab === "products"
                        ? "Product"
                        : tab === "locations"
                          ? "Destination"
                          : "Name"}
                    </TableHead>
                    <TableHead>
                      {tab === "products"
                        ? "Price / category"
                        : tab === "locations"
                          ? "Capacity"
                          : " "}
                    </TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records
                    .slice((currentPage - 1) * 50, currentPage * 50)
                    .map(({ row, index }) => (
                      <TableRow key={row.id}>
                        <TableCell className="mono">{row.id}</TableCell>
                        <TableCell>
                          {tab === "products"
                            ? (row as Product).name
                            : tab === "locations"
                              ? [
                                  (row as Location).department,
                                  (row as Location).aisle,
                                  (row as Location).rack,
                                  (row as Location).shelf,
                                ]
                                  .filter(Boolean)
                                  .join(" → ")
                              : (row as Category).name}
                        </TableCell>
                        <TableCell>
                          {tab === "products"
                            ? `${money((row as Product).price)} · ${(row as Product).categoryId}`
                            : tab === "locations"
                              ? ((row as Location).capacity ?? "Unlimited")
                              : ""}
                        </TableCell>
                        <TableCell>
                          {manager && (
                            <Button
                              type="button"
                              className="text-button"
                              onClick={() => editor(tab, index)}
                            >
                              <PenLine size={14} />
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
            {!records.length && (
              <Empty title="No matching records">
                Try another identifier, name, or destination.
              </Empty>
            )}
            {pages > 1 && (
              <Pagination
                className="master-pagination"
                aria-label="Master record pages"
              >
                <PaginationContent className="w-full justify-between gap-3 flex-wrap">
                  <PaginationItem>
                    <Button
                      variant="outline"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous page
                    </Button>
                  </PaginationItem>
                  <PaginationItem>
                    <span className="text-xs text-muted-foreground">
                      Page {currentPage} of {pages} · 50 records per page
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <Button
                      variant="outline"
                      disabled={currentPage === pages}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next page
                    </Button>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </TabsContent>
        </Tabs>
      </Card>
      <Card className="panel gap-0 py-0 ring-0">
        <div className="section-heading">
          <h2>
            <History size={19} />
            Revision history
          </h2>
        </div>
        {data.revisions.map((r) => (
          <div className="revision-row" key={r.id}>
            <div>
              <strong>Revision {r.revision}</strong>
              <small>{dateTime(r.created_at)}</small>
            </div>
            <span className="mono muted">{r.id.slice(0, 8)}</span>
            <div className="actions">
              <Button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    downloadMaster(
                      r.storage_path,
                      `ReRun Master v${r.revision}.xlsx`,
                    ),
                  )
                }
              >
                Download
              </Button>
              {manager && r.id !== data.revision.id && (
                <Button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const { data: old, error } = await supabase
                        .from("master_revisions")
                        .select("payload")
                        .eq("id", r.id)
                        .single();
                      if (error) throw error;
                      stage(old.payload as Master);
                    }, "Previous revision staged for review.")
                  }
                >
                  Stage as new revision
                </Button>
              )}
            </div>
          </div>
        ))}
      </Card>
      {edit && (
        <Modal
          title={`${edit.index < 0 ? "Add" : "Edit"} ${edit.kind === "categories" ? "category" : edit.kind.slice(0, -1)}`}
          onClose={() => setEdit(null)}
          wide
        >
          <form
            className="record-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget),
                value = { ...edit.value };
              for (const key of Object.keys(value)) {
                if (key === "taxable") value[key] = form.get(key) === "on";
                else if (["price", "cost"].includes(key))
                  value[key] =
                    field(form, key) === ""
                      ? null
                      : Math.round(Number(form.get(key)) * 100);
                else if (key === "capacity")
                  value[key] =
                    field(form, key) === "" ? null : Number(form.get(key));
                else if (!(key === "id" && edit.index >= 0))
                  value[key] = field(form, key);
              }
              const next = structuredClone(master);
              if (edit.index < 0) (next[edit.kind] as unknown[]).push(value);
              else (next[edit.kind] as unknown[])[edit.index] = value;
              void run(async () => {
                validateMaster(next);
                stage(next);
                setEdit(null);
              }, "Edit staged. Review and publish the candidate.");
            }}
          >
            {Object.entries(edit.value).map(([key, value]) => (
              <label key={key}>
                {key
                  .replace(/([A-Z])/g, " $1")
                  .replace(/^./, (s) => s.toUpperCase())}
                {["price", "cost"].includes(key) ? (
                  <Input
                    name={key}
                    type="number"
                    step="0.01"
                    min={0}
                    required={key === "price"}
                    defaultValue={value === null ? "" : Number(value) / 100}
                  />
                ) : key === "taxable" ? (
                  <Checkbox
                    name={key}
                    aria-label="Taxable"
                    defaultChecked={!!value}
                  />
                ) : key === "categoryId" || key === "locationId" ? (
                  <NativeSelect name={key} defaultValue={String(value)}>
                    {(key === "categoryId"
                      ? master.categories
                      : master.locations
                    ).map((c) => (
                      <NativeSelectOption key={c.id} value={c.id}>
                        {c.id}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    name={key}
                    disabled={key === "id" && edit.index >= 0}
                    type={
                      key === "introducedAt"
                        ? "date"
                        : key === "capacity"
                          ? "number"
                          : "text"
                    }
                    min={key === "capacity" ? 1 : undefined}
                    required={[
                      "id",
                      "sku",
                      "name",
                      "department",
                      "aisle",
                      "introducedAt",
                    ].includes(key)}
                    maxLength={120}
                    defaultValue={value == null ? "" : String(value)}
                  />
                )}
              </label>
            ))}
            <div className="form-footer">
              <p className="hint">
                Prices and costs use USD. Empty capacity means unlimited.
                Changes require publication.
              </p>
              <Button type="submit" className="primary" disabled={busy}>
                Stage changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
