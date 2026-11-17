# Verification record

## One tag per capacity slot — November 17, 2026

The store's 500-slot capacity is now covered by exactly 500 reusable tag records. The 131 existing assigned tags were preserved, and 369 available tags were registered for future stock. No unit records or location capacities were changed. The maintenance operation uses the existing administrator-checked command API in one serialized transaction and asserts that every previous assignment is intact. A second run verified idempotence: total 500, assigned 131, available 369.

Smart Tags now displays the total pool and capacity-slot count together. The summary wraps on small screens. The tag-pool browser regression checks the 500/500 totals, available-tag filtering, a spare tag's QR label/assignment dialog, and a 320px mobile layout.

## Centered, responsive popups — November 16, 2026

The Review & place dialog reproduced at x=0/y=0 on a 1440×1000 viewport because the shared dialog's margins were reset to zero. The shared Modal now explicitly centers itself within the visible viewport, constrains its width/height, and scrolls content beneath a persistent title/close header. The same component serves item details, receiving, pricing, tag management/registration, employee dialogs, master editors, and private activation.

Dialog fields use at least 16px text and 44px control/close targets; metadata, status badges, and hints are larger and have stronger contrast. Long identifiers wrap, wide detail panels become one column on phones, and the price/title header adapts to narrow widths. The page behind an open modal is scroll-locked. Dialog titles are explicitly labeled, Tab/Shift+Tab cycle inside the popup, Escape closes it, and focus returns to the opening control. Visible-viewport resize/scroll handling keeps popups within the available mobile screen when keyboard or zoom changes the visible region.

`tests/modals.spec.ts` covers all shared dialog forms at 1440×1000, 390×844, 320×640, and 844×390, plus persistent close controls during scrolling, keyboard focus/return, a reduced-height mobile form, and a visual-viewport-only keyboard simulation. Private activation layout is checked using a mocked placeholder response, with no real activation tokens generated. These layout tests open and close forms without submitting inventory or employee changes. The existing unit/build/lint checks and operational browser tests remain part of release verification.

## Smart-tag coverage and functional audit — November 16, 2026

Overview now exposes Auto sort & assign tags. The two remaining received units were sorted using the authenticated UI, yielding 100 placed and 27 pending units. Every one of the 127 units has exactly one assigned reusable smart tag. The operation preserved 16 existing assignments, reused four available tags, and registered 107 tags. No additional stock was created. Available capacity is 373 of 500 slots; the 1,000-product master is unchanged at revision 13.

Tag allocation is transactional, uses only eligible capacity-allocated units, skips existing assignments and unavailable tags, and remains automatic for later receipts, sorting, lifecycle changes, and destination edits. Tags are searchable by product, unit, destination, and tag ID, with a status filter and bounded loading. Unit details identify the assigned smart tag and can generate its QR label using the existing Nimiq creator. Overview capacity indicators now include reservations, correcting the earlier placed-only calculation.

The extended unit-label check found that the unit selector's implicit accessible name included its option text. Explicit accessible labels were added to the unit and QR-format selectors; the smart-tag label test passed after the correction. Database audit extensions also passed for duplicate tag rejection, assigned-tag retirement protection, unassigned-tag retirement, uninspected return rejection, required display states, and failed display retry/attempt counting.

The fresh-project seed now registers its reusable tag pool before receiving stock, allowing automatic allocation to reuse the intended pool instead of creating a second set. The initialized live store is protected by the seed's existing no-overwrite guard.

All 25 unit tests, TypeScript/Vite build, and ESLint passed. Ten browser tests passed locally: login/denial; inventory, unit details, and generated QR; all screens; discrepancy persistence/acknowledgment; authoritative XLSX download/import with zero changes; mobile navigation; Nimiq image decoding and simulated camera; Overview sorting/tag search; associate access restrictions; and private activation validation. A temporary example.com test account was returned to its original disabled state after the run. All 11 requested accounts remained active.

Three hosted SQL test transactions passed and rolled back: `database.sql`, `auto-sort.sql`, and `functional-audit.sql`. They cover RLS/private helpers, role boundaries, idempotent receive, one-tag-per-unit allocation, held capacity without new tags, smart-tag scan resolution, simulated display Pending → Written → Verified, stale versions, placement, register/sale, tag recovery/inspection, return inspection and rerouting, manager overflow, reasoned stock-out, price rejection, markdown settings, stale master publication, and missing workbook rejection. Separate browser checks verified smart-tag QR image lookup, exact floor-plan counts, pagination, PROD-1000 lookup, full 1,000-product CSV export, route export, and mobile layout. Physical display hardware remains simulated.

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
