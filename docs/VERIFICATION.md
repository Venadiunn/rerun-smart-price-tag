# Verification record

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
