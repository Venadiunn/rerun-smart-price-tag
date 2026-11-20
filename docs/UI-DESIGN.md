# ReRun workspace interface

The interface uses the shadcn Base UI Nova components, with a neutral zinc palette, charcoal actions, Geist typography, subtle borders, and generous control spacing. The shadcn/ui repository and official registry are the design source for the entire interface. Decorative icons and monogram tiles are omitted; icons remain for essential controls and the collapsed navigation rail. Record cards and rows use labeled Open, View, Review, Manage, and Select buttons. Navigation, tabs, menus, native select fields, and disclosures retain their appropriate control patterns. Content rows grow with wrapped names and identifiers. The standard body size is 16 pixels; supporting text starts at 14 pixels, using relative units to respect text enlargement. Components follow [shadcn/ui](https://github.com/shadcn-ui/ui); ReRun retains its own logo and operational workflows.

## Navigation and appearance

- Desktop navigation expands to 240 pixels or collapses to a 64-pixel icon rail. The choice persists on the device.
- Phones use a navigation sheet with a visible close button. Selecting a destination closes the sheet.
- One ReRun logo is visible at a time, including when the phone navigation is open.
- Appearance supports light, dark, and system settings. Device preferences persist locally and synchronize between tabs. An early page script applies the theme before React starts.
- The overview prioritizes scanning and restocking, with stock receiving and automatic sorting directly available.

## Shared components

The application uses the checked-in components under `src/components/ui`: buttons, inputs, textareas, native selects, checkboxes, badges, cards, tables, tabs, pagination, dialogs, a navigation sheet, dropdown menus, tooltips, skeletons, separators, and avatars. Item, Empty, Alert, Breadcrumb, and Progress components come from the same official registry. Native selects retain native keyboard and mobile picker behavior. Forms continue using their existing validation and FormData command payloads.

Semantic color variables live in `src/index.css`. Domain-specific layouts live in `src/domain-layout.css`; shared workspace and responsive rules live in `src/workspace.css`. QR paper and simulated digital labels retain a white background independently of appearance.

The shared dialog uses Base UI for focus trapping, Escape, background interaction blocking, scroll locking, and focus restoration. Its header stays visible while the body scrolls. Position and available height follow the visual viewport, including the reduced viewport when a mobile keyboard opens. Form fields use at least 16-pixel text in dialogs, and close controls measure at least 44 pixels.

Inventory and master data use pagination. Master search preserves the original record index when opening an editor, so filtering or paging cannot select a different product. Phone tables scroll within their own region instead of widening the page.

## Readability and dashboard context

- Titles are 28 pixels on desktop and 26 pixels on phones. Section headings are generally 18–20 pixels. Descriptions and table values are 15–16 pixels; codes, captions, timestamps, and secondary labels are at least 14 pixels at the default browser font setting.
- Default action buttons measure at least 44 pixels in normal use, compact desktop actions at least 40 pixels, and phone actions at least 44 pixels. Icon controls and dialog close buttons have 44-pixel targets. Form fields use 16-pixel text and at least 44-pixel height.
- Native tabs, headings, buttons, table cells, and metadata grow or wrap with content. The narrow floor plan becomes one column; capacity cards adapt to the available width and text scale. On phones and tablets, choosing a fixture moves focus and the view to destination details, with an explicit return to the schematic.
- Tables expose a keyboard-focusable scrolling region and column header semantics. Full product names and identifiers wrap rather than inheriting a table's no-wrap rule.
- Every workspace page has a footer timestamp for the last successful data fetch, including the local time zone, plus a Refresh data button. This is the fetch time, not a claim that physical stock or displays were verified at that moment. Automatic polling remains every 20 seconds while active; browser scheduling and connectivity can delay it.
- A failed background refresh caused by a connection or server error leaves the loaded workspace available and displays a warning. Authentication, permission, and staff-access errors still block the workspace. A failed initial load still shows the existing recovery screen. Routine successful refreshes do not produce repeated live announcements.

The accompanying `DASHBOARD-UX-AUDIT.md` records how the supplied dashboard reference was applied across all nine workspace screens and shared sign-in/dialog flows.

## Existing application boundaries

TanStack Router and Query, Supabase authentication and PostgreSQL commands, workbook versioning, staff roles, stock lifecycle transitions, sorting, pricing approvals, tag recovery, and simulated display updates retain their existing APIs. The receiving dialog is shared between Overview and Inventory. The existing Nimiq `qr-creator` and `qr-scanner` packages remain responsible for QR generation and scanning. Vercel Web Analytics is retained from the production branch.

This interface release requires no database migration or seed operation. Its design does not change store capacity, master data, tags, staff access, or the meaning of recorded placements. Physical tag updates remain explicitly simulated.

## Validation

Run `npm run lint`, `npm test`, and `npm run build`. Browser coverage is in `tests/app.spec.ts`, `tests/modals.spec.ts`, and `tests/design.spec.ts`. Browser checks need private staff sessions in `.private`; these files must never be committed. Authentication checks use dedicated `rerun-…@example.com` test accounts and require an active fixture; restore any temporarily enabled fixture to its original access state afterward.

The design suite checks all nine screens in light and dark appearance at desktop, 390-pixel, and 320-pixel widths, runs automated WCAG A/AA accessibility checks on both desktop themes, checks one-logo navigation, appearance persistence, system appearance changes, keyboard tab interaction, staged checkbox values, and the shared receiving command. Dialog checks include desktop, phone, narrow phone, landscape, focus management, and simulated mobile keyboard viewports. Automated accessibility checks complement visual inspection; they do not establish complete accessibility certification.
