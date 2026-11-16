# Requirement coverage

| Requirement | Implemented behavior | Evidence |
| --- | --- | --- |
| Dashboard and summary cards | Product variants, on-hand units, pending/restocked units and open alerts with explicit definitions | Browser overview and mobile tests |
| Product lookup | Product name/ID, SKU, barcode alias, unit ID and assigned tag ID | Browser search/details test; domain identity tests |
| Inventory table | Sorting, category/status/location filters, size/color and destination | Browser screen review |
| Correct destination | Large destination panel, schematic map, last-confirmed placement | Browser details and map review |
| Stock-in and stock-out | New permanent unit IDs; removal requires a reason | Hosted transaction tests |
| Full lifecycle | Offered, In-Transit, Received, Scanned at Register, Sold, Returned, Inspected, Pending Restock and Restocked | Transactional command validation |
| Returned merchandise | Inspection required before pending restock | Hosted transaction tests |
| Restock completion | Version check, discrepancy acknowledgment, capacity and placement committed together | Hosted transaction tests |
| Location changes and overflow | Master home changes queue relocation; managers assign overflow with a reason | Transactional database implementation |
| More stock than code capacity | Product IDs do not encode quantity; each unit has a permanent generated ID | Receiving implementation and database tests |
| Categories and product editing | Manager-reviewed master candidates; editable product, category and location forms | Browser master screen and backend validation |
| Employee accounts and roles | Invitation-only email/password Auth; associate, manager, administrator; current active role checked on every write | Password-login browser test, HTTP denial tests and RLS tests |
| QR generation | Nimiq qr-creator; stable unit/tag identifiers and documented JSON snapshots; print/download labels | Browser generation-to-decoding test |
| QR scanning | Nimiq qr-scanner; camera, camera selection, uploaded image, manual/external-scanner entry | Image and simulated-camera browser tests |
| All six documented discrepancy cases | Valid item, price/name/location mismatch, missing location, unknown item; multiple findings retained | Six exact domain fixtures and server comparison tests |
| Master spreadsheet source of truth | Immutable private XLSX, reviewed imports, searchable projection and atomic revision activation | Workbook tests, browser import test and authenticated HTTP publication |
| Hierarchical classification | Main category, subcategory, classification, supplier, department and taxable fields | Seed master and typed workbook round trip |
| Lifecycle timestamps/history | Server timestamps in UTC; display in America/Chicago; actor and previous/new values in audit events | Hosted tests and History screen |
| JSON export | Inventory, units, events, discrepancies, price requests and tag update records | Implemented authenticated export controls |
| Reusable tag workflows | Registration, unique active assignment, recovery, inspection, retirement and reassignment history | Hosted tag tests and Tags screen |
| Approved price updates | Staff requests, manager approval, workbook publication, cost-floor checks | Authenticated HTTP approval test |
| Display write failure handling | Labeled simulator with Pending/Written/Verified/Failed and retry history; stale assignments/master revisions cannot verify | Backend transaction validation |
| Explainable markdowns | Configurable age/sell-through/discount rules, missing-input and cost-floor handling | Domain rule tests; Pricing screen |
| Responsive interface | Desktop navigation/tables, mobile navigation/cards, accessible labels and dialogs | Desktop/mobile browser tests and screenshot review |
| Vercel and GitHub delivery | Source repository and hosted deployment | Final release evidence in VERIFICATION.md |

Hardware writing, live checkout integration, RFID/NFC, native applications, trained forecasting, and prior warehouse-specific features remain outside this software MVP, as agreed during planning.
