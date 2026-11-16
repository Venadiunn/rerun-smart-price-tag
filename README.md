# ReRun Smart Price Tag

A staff-only retail inventory and restocking workspace for the WWT STEM Student Forum.

## Stack

React, TypeScript, Vite, Tailwind CSS, TanStack Router and Query, Supabase PostgreSQL/Auth/Storage/Edge Functions, and Vercel Node functions.

QR generation uses [nimiq/qr-creator](https://github.com/nimiq/qr-creator); camera and image scanning use [nimiq/qr-scanner](https://github.com/nimiq/qr-scanner). Both are MIT licensed. ReRun does not implement a QR decoder or computer-vision engine.

## Local development

1. Install Node.js 22 or later and run `npm ci`.
2. Copy `.env.example` to `.env.local` and configure a Supabase project URL and publishable key.
3. Apply the migrations in `supabase/migrations` in filename order and deploy the `staff` Edge Function with JWT verification enabled.
4. Provision the initial administrator through a trusted server-side setup process. The invitation guard requires a server-created `staff_invites` row before creating an Auth user. Insert a matching `profiles` row with the administrator role. Generate a recovery link privately; employees set their own passwords through `/activate`.
5. Run `npm run dev`. The local Vite server also serves `/api/master` for reviewed spreadsheet imports and publication.

`npm run build` checks TypeScript and builds the client. `npm test` runs QR/domain and workbook tests. `npm run lint` checks the source. `npm run test:e2e` runs the Playwright suite after private test sessions have been prepared.

## Workflows

- Product/SKU definitions and permanent physical unit IDs are separate. Receiving stock creates new unit IDs; stock-out never reuses them.
- Search or scan, verify against the active master revision, choose a unit, and confirm its lifecycle operation.
- Recognized scan discrepancies require acknowledgment before restocking. Unknown items remain unverified. Scanned values never overwrite master records.
- Returned units require inspection. Destination capacity is enforced in the same transaction as placement; managers can explicitly assign overflow destinations.
- Tags have independent IDs, one active unit assignment, recovery/inspection, and reusable association history.
- Price requests require manager approval. Rules-based suggestions expose their inputs; cost floors prevent below-cost markdown approval where a cost is supplied.
- Digital display updates are **simulated** and distinguish Pending, Written, Verified, and Failed attempts. There is no physical-tag or checkout integration.

## Master spreadsheet

The current immutable Excel workbook is the authoritative product/location dataset. Its Products, Locations, Categories, and Revision sheets are mirrored into searchable database records by a transactional publication operation.

Download the latest workbook before editing. Upload `.xlsx` or product `.csv` files, review the candidate, and publish. CSV uploads use the current category/location definitions. XLSX uploads require all four sheets. Prices and costs are dollars in Excel and integer cents in the database. Formulas and external links in master data are rejected. Maximum upload: 2 MB.

Publication checks the expected revision and storage object before switching the active pointer. Failed candidates leave the prior master active. Previous revisions remain available and can be staged as a new revision. Unit movements, lifecycle events, scans, tag associations, and audit records are stored separately and survive master replacement.

## Access and deployment

Associates use daily operations. Managers additionally publish master changes, approve prices, assign overflow destinations, and manage markdown rules. Administrators also create/disable employees and generate private account activation links. No activation emails are sent automatically.

All exposed tables use RLS; browser writes use checked transactional RPCs. Staff commands recheck the current active profile. Request IDs prevent duplicate commands, record versions reject stale edits, and a store transaction lock serializes inventory/master mutations. Service credentials stay inside Supabase Edge Functions; Vercel only needs the publishable configuration values.

Deploy the repository to Vercel using the Vite preset, `npm run build`, output `dist`, and the two variables in `.env.example` for both the client and `/api/master`. Configure production deployment access so staff reach the application login. Never commit `.private`, `.env.local`, test sessions, activation links, or local output workbooks.

## Demonstration boundaries

The initial master contains eight fictional products from the project specification, with fictional unit stock and tag assignments. Last-confirmed placement is not live tracking. The schematic is not a measured floor plan. Conventional keyboard barcode scanners can supply lookup aliases; camera decoding supports QR codes.

Hardware writing, NFC/RFID, native apps, checkout integration, trained forecasting, and prior warehouse-specific features are outside this MVP. Test evidence and remaining limitations are tracked in `docs/VERIFICATION.md`.
