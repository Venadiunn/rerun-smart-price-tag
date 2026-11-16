export type Role = "associate" | "manager" | "administrator";
export interface Profile {
  id: string;
  email: string;
  role: Role;
  active: boolean;
}
export interface Category {
  id: string;
  name: string;
}
export interface Location {
  id: string;
  department: string;
  aisle: string;
  rack: string;
  shelf: string;
  capacity: number | null;
}
export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  price: number;
  cost: number | null;
  categoryId: string;
  subcategory: string;
  classification: string;
  supplierId: string;
  departmentCode: string;
  taxable: boolean;
  size: string;
  color: string;
  locationId: string;
  introducedAt: string;
}
export interface Master {
  products: Product[];
  locations: Location[];
  categories: Category[];
}
export type UnitStatus =
  | "Offered"
  | "In-Transit"
  | "Received in Store"
  | "Scanned at Register"
  | "Sold"
  | "Returned"
  | "Inspected"
  | "Pending Restock"
  | "Restocked"
  | "Stocked Out";
export interface Unit {
  id: string;
  product_id: string;
  status: UnitStatus;
  current_location_id: string | null;
  destination_id: string;
  inspected: boolean;
  version: number;
  created_at: string;
}
export interface Tag {
  id: string;
  unit_id: string | null;
  status: "Available" | "Assigned" | "Inspection" | "Retired";
  version: number;
}
export interface Revision {
  id: string;
  revision: number;
  payload: Master;
  storage_path: string;
  created_at: string;
  created_by: string | null;
}
export interface Scan {
  id: string;
  raw: unknown;
  findings: string[];
  product_id: string | null;
  unit_id: string | null;
  master_revision: string;
  acknowledged_at: string | null;
  created_at: string;
}
export interface EventRecord {
  id: string;
  action: string;
  entity_id: string;
  details: Record<string, unknown>;
  actor: string | null;
  created_at: string;
}
export interface PriceRequest {
  id: string;
  product_id: string;
  price: number;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  version: number;
  created_at: string;
}
export interface DisplayUpdate {
  id: string;
  tag_id: string;
  unit_id: string;
  requested: Record<string, unknown>;
  status: "Pending" | "Written" | "Verified" | "Failed";
  version: number;
  attempt: number;
  created_at: string;
}
export interface Snapshot {
  profile: Profile;
  profiles: Profile[];
  master: Master;
  revision: Revision;
  revisions: Revision[];
  units: Unit[];
  tags: Tag[];
  scans: Scan[];
  events: EventRecord[];
  prices: PriceRequest[];
  updates: DisplayUpdate[];
  settings: { ageDays: number; sellThrough: number; discount: number };
}
export interface ScanResult {
  productId: string | null;
  unitId: string | null;
  findings: string[];
  payload: unknown;
}
