# Supabase MVP handoff

The connected ReRun project is `ikuvbteklxjbsixwhril` in `us-east-1`, verified ACTIVE_HEALTHY on November 16, 2026 (Central time). The deployed app uses the project URL and publishable key; service credentials remain in the Edge Function environment.

## Catalog and store state

Master revision 13 contains 1,000 unique product IDs, names, and SKUs. It preserves the prior 208 products and adds 792 fictional variants. Barcode aliases are unique where supplied; legacy products can have no barcode because QR lookup uses product/unit IDs. The 16 locations provide exactly 500 configured slots: Clothing Rack D has 50, and the other 15 fixtures have 30 each.

The mock workspace contains 127 permanent unit records. It has 100 recorded placements, 27 restock reservations, and 373 uncommitted slots. All 127 allocated units have one assigned smart tag each. Existing unit/tag assignments, staff accounts, and history were preserved. Setup used the version-checked command API and retained ignored local verification records. These records describe a fictional store, not measured physical stock.

## Access and storage

- RLS is enabled on every public table. Active associates can read operational data and use checked operational commands. Managers can publish master changes; administrators additionally manage staff. Disabled accounts fail the active-profile check even with an unexpired JWT.
- Direct browser writes are denied. Authenticated SECURITY DEFINER RPCs intentionally provide narrow, role-checked transaction boundaries with empty search paths. The internal sorter has neither schema usage nor execution grants for browser roles.
- Staff invitation allowlists and command receipts have explicit deny policies and no direct browser table privileges. Associates cannot list staff profiles or read staff audit details.
- `master-workbooks` is private, limited to XLSX MIME type and 2 MB. Active staff can download; managers/admins upload only within their own user directory. Revisions remain immutable and publication checks both the active revision and uploaded workbook.
- The `staff` Edge Function requires JWT verification and an active administrator profile. Its SDK import is pinned to 2.119.0. Initial-account bootstrapping permanently returns HTTP 410; its tombstone source is checked in.
- Eleven requested accounts remain active. Passwords, sessions, activation links, journals, and exports are excluded from Git. No auth email delivery was added or triggered by this update; private administrator-generated activation remains the supported onboarding workflow.

## Schema and verification

The hosted migration `20261117015611_finalize_store_backend` is checked in with its server-generated version. It adds foreign-key and sorting indexes, optimizes profile/storage policies, explicitly denies private-table access, and aligns bucket size limits with the application. The local CLI binary was blocked by Device Guard; the authenticated Supabase connector applied the hosted migration successfully.

Migration `20261117031019_automatic_capacity_smart_tags` adds the internal capacity-aware smart-tag allocator. Its function and sequence have no browser grants. Existing active-profile command authorization and the shared transaction lock protect allocation; duplicate requests return stored results. Only eligible units with allocated space receive new assignments. Received/inspection holds and available/recovered/retired tag states remain distinct. The Overview sort command also reconciles missing assignments, so retrying does not create duplicates.

The performance advisor no longer reports missing foreign-key indexes or per-row auth evaluation warnings. Freshly created, unused indexes may appear as informational notices until their query patterns run. The security advisor's four authenticated SECURITY DEFINER warnings correspond to the intentional RPC boundaries described above; authorization tests verify their restrictions.

Run `npm test`, `npm run build`, and `npm run lint`. Run `tests/database.sql` and `tests/auto-sort.sql` through an administrator SQL connection; each uses a transaction and rolls back its fixtures. Checks cover role separation, private storage, RLS, anonymous denial, command idempotency, capacity reservations, manual moves, inspection/discrepancy holds, and master publication capacity. No service key is required by the app's catalog setup script.

To reproduce the expansion from the prior 16-location store, use `node --env-file=.env.local --import tsx scripts/expand-demo-store.ts` for a dry run and append `--apply` to publish. `SUPABASE_SESSION_FILE` must point to a private active administrator session. The script preserves source products, publishes through the app API, and uses a private retry journal. Keep that journal for repeat verification; do not delete it to rerun the initial setup.

## Free-plan limits

The connected demo remains on the existing free plan. Leaked-password screening remains disabled because Supabase requires Pro or above for that feature; the app enforces 12-character passwords on activation/change. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No paid upgrade was made.

Free-project inactivity pausing, recovery/backup options, and email-delivery limits still apply. This is a finalized MVP configuration, without a paid availability or recovery guarantee. Review [Supabase's deployment checklist](https://supabase.com/docs/guides/deployment/going-into-prod) before a real employee pilot with a defined uptime and recovery requirement.
