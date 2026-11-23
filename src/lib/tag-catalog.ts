import type { Snapshot, Tag } from "./types";
export function tagCatalog(
  data: Snapshot,
  query: string,
  status: string,
  limit: number,
) {
  const q = query.trim().toLowerCase(),
    units = new Map(data.units.map((u) => [u.id, u])),
    products = new Map(data.master.products.map((p) => [p.id, p]));
  const physicalIds = new Set(data.tags.map((t) => t.id));
  const rows: Tag[] = [];
  let count = 0;
  const add = (tag: Tag) => {
    count++;
    if (rows.length < limit) rows.push(tag);
  };
  for (const t of data.tags) {
    const u = units.get(t.unit_id ?? ""),
      p = products.get(u?.product_id ?? "");
    if (
      (!status || t.status === status) &&
      [t.id, t.unit_id, p?.id, p?.name, u?.destination_id]
        .join(" ")
        .toLowerCase()
        .includes(q)
    )
      add(t);
  }
  const openReserve = data.tags.filter((t) =>
    t.id.startsWith("TAG-RESERVE-"),
  ).length;
  const free = data.reserveCount - openReserve;
  if (!status || status === "Available") {
    const all = !q || "tag-reserve-".includes(q);
    for (
      let i = 1;
      i <= data.reserveCount && (!all || rows.length < limit);
      i++
    ) {
      const id = "TAG-RESERVE-" + String(i).padStart(6, "0");
      if (!physicalIds.has(id) && (all || id.toLowerCase().includes(q))) {
        if (all)
          rows.push({ id, status: "Available", unit_id: null, version: 1 });
        else add({ id, status: "Available", unit_id: null, version: 1 });
      }
    }
    if (all) count += free;
  }
  if (!status || status === "Assigned") {
    for (const lot of data.stock.byProduct.values()) {
      const p = products.get(lot.product_id);
      const all =
        !q ||
        [lot.product_id, p?.name, lot.location_id]
          .join(" ")
          .toLowerCase()
          .includes(q);
      if (all) count += lot.remaining;
      else if (!/^[unitagr0-9-]+$/.test(q)) continue;
      if (all && rows.length >= limit) continue;
      for (let i = 1; i <= lot.quantity; i++) {
        const suffix = lot.product_id + "-" + i,
          id = "TAG-" + suffix,
          unit_id = "UNIT-" + suffix;
        if (units.has(unit_id)) continue;
        const t = { id, unit_id, status: "Assigned" as const, version: 1 };
        if (all) {
          rows.push(t);
          if (rows.length >= limit) break;
        } else if ((id + " " + unit_id).toLowerCase().includes(q)) add(t);
      }
    }
  }
  return { rows, count, free };
}
