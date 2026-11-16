import { useState, useDeferredValue } from "react";
import {
  Search,
  Download,
  Plus,
  ArrowUpDown,
  ArrowRight,
  PackagePlus,
} from "lucide-react";
import { useWorkspace } from "../lib/context";
import { command, download, exportCSV } from "../lib/api";
import { money } from "../lib/domain";
import { productCsvRows } from "../lib/csv";
import { PageTitle, Status, Modal, Empty, field } from "../components/ui";
export function Inventory() {
  const { data, openProduct, run, busy } = useWorkspace(),
    [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [status, setStatus] = useState(""),
    [location, setLocation] = useState(""),
    [sort, setSort] = useState("name"),
    [receive, setReceive] = useState(false);
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
          ? a.id.localeCompare(b.id)
          : a.name.localeCompare(b.name),
    );
  return (
    <>
      <PageTitle
        eyebrow="PRODUCTS & PHYSICAL UNITS"
        title="Your inventory, in its place."
        description="Find a product, verify its destination, and keep every unit moving."
        actions={
          <>
            <button
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
              <Download size={17} />
              Export JSON
            </button>
            <button className="primary" onClick={() => setReceive(true)}>
              <Plus size={18} />
              Receive stock
            </button>
          </>
        }
      />
      <section className="panel">
        <div className="table-toolbar">
          <label className="search-box">
            <Search size={18} />
            <input
              aria-label="Search inventory"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products, SKU, unit or tag ID…"
            />
          </label>
          <div className="filter-row">
            <select
              aria-label="Category filter"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {data.master.categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {[...new Set(data.units.map((u) => u.status))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Location filter"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">All locations</option>
              {data.master.locations.map((l) => (
                <option key={l.id}>{l.id}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="table-caption">
          <span>
            {products.length} product variants · {data.units.length} physical
            units
          </span>
          <div className="actions">
            <ArrowUpDown size={14} />
            <select
              aria-label="Sort inventory"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="name">Product name</option>
              <option value="price">Price, low to high</option>
              <option value="id">Product ID</option>
            </select>
            <button
              className="text-button"
              onClick={() =>
                exportCSV(productCsvRows(products), "rerun-products.csv")
              }
            >
              CSV
            </button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product / identification</th>
                <th>Category</th>
                <th>Variant</th>
                <th>Price</th>
                <th>Assigned destination</th>
                <th>Units</th>
                <th>
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const units = data.units.filter((u) => u.product_id === p.id),
                  pending = units.filter(
                    (u) => u.status === "Pending Restock",
                  ).length;
                return (
                  <tr key={p.id}>
                    <td>
                      <button
                        className="product-cell"
                        onClick={() => openProduct(p.id)}
                      >
                        <span className="product-monogram">
                          {p.name
                            .split(" ")
                            .map((s) => s[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small className="mono">{p.id}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      {p.categoryId}
                      <small>{p.subcategory}</small>
                    </td>
                    <td>
                      {p.size}
                      <small>{p.color}</small>
                    </td>
                    <td className="mono">{money(p.price)}</td>
                    <td>
                      <span className="location-pill">{p.locationId}</span>
                    </td>
                    <td>
                      <strong>{units.length}</strong>
                      {pending > 0 && (
                        <small className="amber-text">{pending} pending</small>
                      )}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Open ${p.name}`}
                        onClick={() => openProduct(p.id)}
                      >
                        <ArrowRight size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!products.length && (
          <Empty title="No matching products">
            Try another name, code, or filter.
          </Empty>
        )}
      </section>
      <section className="panel unit-list">
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
            .map((u) => (
              <button
                key={u.id}
                className="unit-card"
                onClick={() => openProduct(u.product_id, u.id)}
              >
                <Status value={u.status} />
                <strong>
                  {
                    data.master.products.find((p) => p.id === u.product_id)
                      ?.name
                  }
                </strong>
                <small className="mono">{u.id}</small>
                <span>
                  {u.destination_id}
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
        </div>
      </section>
      {receive && (
        <Modal title="Receive stock" onClose={() => setReceive(false)}>
          <div className="notice">
            <PackagePlus size={20} />
            Every received unit gets a permanent identifier. Existing labels and
            histories stay intact.
          </div>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const done = await run(
                () =>
                  command("receive", {
                    productId: field(f, "productId"),
                    quantity: Number(f.get("quantity")),
                    status: field(f, "initialStatus"),
                  }),
                "Stock received.",
              );
              if (done) setReceive(false);
            }}
          >
            <label>
              Product
              <select name="productId">
                {data.master.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Initial lifecycle
              <select name="initialStatus">
                <option>Received in Store</option>
                <option>Offered</option>
                <option>In-Transit</option>
              </select>
            </label>
            <label>
              Quantity
              <input
                type="number"
                name="quantity"
                min={1}
                max={100}
                defaultValue={1}
                required
              />
            </label>
            <button className="primary" disabled={busy}>
              Receive units
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

