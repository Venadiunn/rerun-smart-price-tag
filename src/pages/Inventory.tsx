import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReceiveStockDialog } from "../components/ReceiveStockDialog";
import { useState, useDeferredValue } from "react";
import { Search } from "lucide-react";
import { useWorkspace } from "../lib/context";
import { download, exportCSV } from "../lib/api";
import { money } from "../lib/domain";
import { productCsvRows } from "../lib/csv";
import { PageTitle, Status, Empty } from "../components/ui";
import { AutoSortPanel } from "../components/AutoSortPanel";
export function Inventory() {
  const { data, openProduct } = useWorkspace(),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [location, setLocation] = useState(""),
    [sort, setSort] = useState("name"),
    [receive, setReceive] = useState(false),
    [page, setPage] = useState(1);
  const q = useDeferredValue(search.toLowerCase());
  const products = data.master.products
    .filter((p) => {
      const units = data.units.filter((u) => u.product_id === p.id);
      const text = [
        p.id,
        p.name,
        p.sku,
        p.barcode,
        ...units.map((u) => u.id),
        ...data.tags
          .filter((t) => units.some((u) => u.id === t.unit_id))
          .map((t) => t.id),
      ]
        .join(" ")
        .toLowerCase();
      return (
        text.includes(q) &&
        (!category || p.categoryId === category) &&
        (!location ||
          p.locationId === location ||
          units.some((u) => u.destination_id === location)) &&
        (!status || units.some((u) => u.status === status))
      );
    })
    .toSorted((a, b) =>
      sort === "price"
        ? a.price - b.price
        : sort === "id"
          ? a.id.localeCompare(b.id, "en", { numeric: true })
          : a.name.localeCompare(b.name),
    );
  const pageSize = 50,
    totalPages = Math.max(1, Math.ceil(products.length / pageSize)),
    currentPage = Math.min(page, totalPages);
  return (
    <>
      <PageTitle
        eyebrow="PRODUCTS & PHYSICAL UNITS"
        title="Inventory"
        description="Find products and units, receive stock, and review designated locations."
        actions={
          <>
            <Button
              type="button"
              className="secondary"
              onClick={() =>
                download(
                  JSON.stringify(
                    {
                      masterRevision: data.revision.id,
                      master: data.master,
                      units: data.units,
                    },
                    null,
                    2,
                  ),
                  "rerun-inventory.json",
                )
              }
            >
              Export JSON
            </Button>
            <Button
              type="button"
              className="primary"
              onClick={() => setReceive(true)}
            >
              Receive stock
            </Button>
          </>
        }
      />
      <AutoSortPanel />
      <Card className="panel gap-0 py-0 ring-0">
        <div className="table-toolbar">
          <label className="search-box">
            <Search size={18} />
            <Input
              aria-label="Search inventory"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search products, SKU, unit or tag ID…"
            />
          </label>
          <div className="filter-row">
            <NativeSelect
              aria-label="Category filter"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">All categories</NativeSelectOption>
              {data.master.categories.map((c) => (
                <NativeSelectOption value={c.id} key={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Status filter"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">All statuses</NativeSelectOption>
              {[...new Set(data.units.map((u) => u.status))].map((s) => (
                <NativeSelectOption key={s}>{s}</NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Location filter"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">All locations</NativeSelectOption>
              {data.master.locations.map((l) => (
                <NativeSelectOption key={l.id}>{l.id}</NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="table-caption">
          <span>
            {products.length} product variants · {data.units.length} physical
            units
          </span>
          <div className="actions">
            <NativeSelect
              aria-label="Sort inventory"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="name">Product name</NativeSelectOption>
              <NativeSelectOption value="price">
                Price, low to high
              </NativeSelectOption>
              <NativeSelectOption value="id">Product ID</NativeSelectOption>
            </NativeSelect>
            <Button
              type="button"
              className="text-button"
              onClick={() =>
                exportCSV(productCsvRows(products), "rerun-products.csv")
              }
            >
              CSV
            </Button>
          </div>
        </div>
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product / identification</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Assigned destination</TableHead>
                <TableHead>Units</TableHead>
                <TableHead>
                  <span className="sr-only">Details</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products
                .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                .map((p) => {
                  const units = data.units.filter((u) => u.product_id === p.id),
                    pending = units.filter(
                      (u) => u.status === "Pending Restock",
                    ).length;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="product-cell">
                          <span>
                            <strong>{p.name}</strong>
                            <small className="mono">{p.id}</small>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {p.categoryId}
                        <small>{p.subcategory}</small>
                      </TableCell>
                      <TableCell>
                        {p.size}
                        <small>{p.color}</small>
                      </TableCell>
                      <TableCell className="mono">{money(p.price)}</TableCell>
                      <TableCell>
                        <span className="location-pill">{p.locationId}</span>
                      </TableCell>
                      <TableCell>
                        <strong>{units.length}</strong>
                        {pending > 0 && (
                          <small className="amber-text">
                            {pending} pending
                          </small>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          aria-label={`Open ${p.name}`}
                          onClick={() => openProduct(p.id)}
                        >
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
        {!products.length && (
          <Empty title="No matching products">
            Try another name, code, or filter.
          </Empty>
        )}
      </Card>
      <Pagination className="inventory-pagination" aria-label="Inventory pages">
        <PaginationContent className="w-full justify-between flex-wrap gap-3">
          <PaginationItem>
            <Button
              type="button"
              className="secondary"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous page
            </Button>
          </PaginationItem>
          <PaginationItem>
            <span>
              Page {currentPage} of {totalPages} · up to {pageSize} products per
              page
            </span>
          </PaginationItem>
          <PaginationItem>
            <Button
              type="button"
              className="secondary"
              disabled={currentPage === totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next page
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <Card className="panel unit-list gap-0 py-0 ring-0">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE NEXT ACTION</span>
            <h2>Units in progress</h2>
          </div>
        </div>
        <div className="unit-grid">
          {data.units
            .filter(
              (u) => !["Restocked", "Sold", "Stocked Out"].includes(u.status),
            )
            .filter((u) => products.some((p) => p.id === u.product_id))
            .toSorted(
              (a, b) =>
                a.destination_id.localeCompare(b.destination_id) ||
                a.product_id.localeCompare(b.product_id),
            )
            .map((u) => (
              <Card key={u.id} className="unit-card gap-0 py-0 ring-0">
                <Status value={u.status} />
                <strong>
                  {
                    data.master.products.find((p) => p.id === u.product_id)
                      ?.name
                  }
                </strong>
                <small className="mono">{u.id}</small>
                <span>{u.destination_id}</span>
                <Button
                  variant="outline"
                  className="mt-2"
                  aria-label={`Review unit ${u.id}`}
                  onClick={() => openProduct(u.product_id, u.id)}
                >
                  Review unit
                </Button>
              </Card>
            ))}
        </div>
      </Card>
      {receive && <ReceiveStockDialog onClose={() => setReceive(false)} />}
    </>
  );
}
