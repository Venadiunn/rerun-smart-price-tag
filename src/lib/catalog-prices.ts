import type { Master } from "./types.js";

export interface RevisionAssets {
  baseId: string;
  path: string;
  prices: Record<string, number>;
  previous: string | null;
}

export function applyCatalogPrices(
  master: Master,
  prices: Record<string, number>,
): Master {
  if (!Object.keys(prices).length) return master;
  return {
    ...master,
    products: master.products.map((product) =>
      Object.hasOwn(prices, product.id) && prices[product.id] !== product.price
        ? { ...product, price: prices[product.id] }
        : product,
    ),
  };
}
