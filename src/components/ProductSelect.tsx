import { useState } from "react";
import { Input } from "./ui/input";
import { NativeSelect, NativeSelectOption } from "./ui/native-select";
import type { Product } from "../lib/types";
export function ProductSelect({
  products,
  initial,
}: {
  products: Product[];
  initial?: string;
}) {
  const [query, setQuery] = useState("");
  const matches = products
    .filter((p) =>
      (p.name + " " + p.id + " " + p.sku)
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    )
    .slice(0, 80);
  const initialProduct = products.find((p) => p.id === initial);
  if (!query && initialProduct && !matches.some((p) => p.id === initial))
    matches.unshift(initialProduct);
  return (
    <div className="stack">
      <Input
        aria-label="Find product"
        placeholder="Find by name, SKU or ID"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <NativeSelect
        aria-label="Product"
        name="productId"
        key={query}
        defaultValue={query ? undefined : initial}
        required
      >
        {!matches.length && (
          <NativeSelectOption value="">No matching products</NativeSelectOption>
        )}
        {matches.map((p) => (
          <NativeSelectOption key={p.id} value={p.id}>
            {p.name} · {p.id}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
