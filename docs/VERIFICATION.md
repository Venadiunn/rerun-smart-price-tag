# Verification record

## Expanded visual store — November 16, 2026

Master revision 13 has 1,000 unique product IDs, names, and SKUs, with all 792 new variants linked to valid locations. Total configured capacity is exactly 500 across 16 fixtures. All 127 existing unit records were preserved; 91 eligible pending units were marked as placed through the normal command API, yielding 100 recorded placements, 25 reservations, and 375 available slots. No location exceeds its capacity. All 11 requested staff/admin accounts remain active.

The floor plan includes receiving/inspection, six aisles, clickable racks/shelves, unit-capacity markers, customer walkways, entrance/exit, and checkout. Both floor-plan and capacity-grid views use the live Supabase snapshot. Catalog pagination renders 50 products per page while search/export use the entire catalog.

Validation: 25 Vitest tests, production build, and ESLint passed. Updated hosted authorization and sorting transactions passed and rolled back. Targeted Chrome checks passed for staff login, exact store totals, all 500 capacity markers, 100 placed and 25 reserved markers, fixture selection, floor/grid toggle, department filtering, keyboard selection, 20-page inventory navigation, PROD-1000 lookup, route CSV, and a 390-pixel mobile layout. Database checks verified uniqueness, valid location references, and no capacity oversubscription. Supabase readiness and remaining plan boundaries are documented in `SUPABASE.md`.

## Automatic sorting update — November 16, 2026

Added 100 fictional physical unit records across 100 of the expanded catalog's product IDs. At completion of the data update, the workspace contained 208 products, 117 units, 20 reusable tags, and 16 designed locations under master revision 12. Another unit was received through the app during implementation and was preserved. Eight additional labeled racks/shelves extend the demonstration layout; their capacities are prototype configuration, not measurements of a real store.

New receipts automatically reserve their product-ID destination and enter Pending Restock. Arrival from In-Transit and completed inspections use the same path. Inspection and discrepancy holds remain blocked, manager overflow is preserved, and placement requires staff confirmation. Reservation counts include units still occupying their old location during relocation. Manual transitions, overflow assignment, and prospective master publication all respect capacity commitments.

Validation: 20 Vitest tests passed, TypeScript/Vite build and ESLint passed, and hosted `tests/auto-sort.sql` assertions passed with transaction rollback. Database assertions covered duplicate requests, one-slot capacity competition, automatic receive, manual-transition and destination overbooking rejection, inspection/discrepancy holds, preserved overflow, reserved-capacity checks during master publication, and anonymous denial. Targeted Chrome checks verified staff login, 117-unit inventory, 109-unit restock route, product-ID lookup, correct destination and unit details, placement-review controls, route CSV, map reservations, and a 390-pixel mobile viewport without page overflow. Physical merchandise and hardware were not moved by these tests.

Local verification completed on November 16, 2026:

- TypeScript and Vite production build passed.
- ESLint passed.
- 18 domain/workbook tests passed, including the six documented QR cases, dollar-based CSV round trips, strict taxable flags, and prefixed OpenXML imports.
- 9 Chrome browser tests passed locally and against the live deployment: login/denial, search/details, every screen, discrepancy persistence/acknowledgment, XLSX download/import, mobile layout, generated QR image decoding, simulated camera decoding, associate access boundaries, and private activation with password-confirmation correction.
- A hosted PostgreSQL test transaction verified idempotency, stale/missing versions, capacity, scan acknowledgment, return inspection, tag recovery, removal reasons, failed master publication, direct-write RLS, and profile isolation. Its fixtures and events rolled back.
- Authenticated HTTP verification approved a price request, published/read back the corresponding XLSX revision, preserved unit history, and restored the original product values through a new revision.
- Two simultaneous real restock requests competed for one free location slot. Exactly one succeeded and the other was rejected at capacity. The original pending statuses, destinations, and capacity were restored afterward.
- HTTP checks rejected associate master publication, anonymous inventory access, and public signup.
- Production dependency audit reported zero known vulnerabilities after the ExcelJS UUID override.

Production URL: https://rerun-smart-price-tag-psi.vercel.app. GitHub is connected to the Vercel production project for deployment from `main`. The live application passed deep-link and anonymous API rejection checks, and the runtime error-log scan found no error/fatal entries in the inspected release window. Initial account bootstrapping has been permanently closed. Administrator activation is delivered privately; no activation email was sent.

## Deliberate boundaries and follow-up checks

- The camera pipeline was tested with generated QR imagery and a simulated camera stream. Real phone cameras, damaged physical labels, USB scanners, and physical tag displays have not been tested here.
- The store map is a schematic. Locations represent assigned destinations and last-confirmed placement.
- Display update verification is simulated. No hardware acknowledgment, physical display check, live checkout integration, trained model, financial benefit, or production reliability is claimed.
- The application uses one store transaction lock. This favors correctness for the small MVP; a larger pilot should measure contention and add server-side pagination before increasing scale.
- Supabase's advisor identifies authenticated SECURITY DEFINER RPCs. These are deliberate, narrow API boundaries with explicit active-profile/role checks and restricted grants; direct table writes and anonymous execution are denied. `staff_invites` and command-idempotency rows intentionally have no browser read policies.
- Supabase leaked-password screening remains disabled in the hosted free-project configuration. See [password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) before a real employee pilot. The app requires 12-character passwords during activation/change.
- Development-only package advisories remain in the Vercel/Vite toolchain. The runtime dependency audit is clean; inspect the current full `npm audit` before expanding the deployment.
