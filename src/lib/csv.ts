import type { Product } from "./types";
// Same headers and dollar units as the editable Products sheet.
export function productCsvRows(products: Product[]) {
  return products.map((p) => ({
    Item_ID: p.id,
    SKU: p.sku,
    Barcode: p.barcode,
    Item_Name: p.name,
    Price: p.price / 100,
    Cost: p.cost === null ? "" : p.cost / 100,
    Category: p.categoryId,
    Subcategory: p.subcategory,
    Classification: p.classification,
    Supplier_ID: p.supplierId,
    Department_Code: p.departmentCode,
    Taxable: p.taxable,
    Size: p.size,
    Color: p.color,
    Intended_Location: p.locationId,
    Introduced_At: p.introducedAt,
  }));
}

