# ReRun performance audit

Measured on November 23, 2026. The production baseline was `4085ab4`; the frontend and database changes were measured on the production release built from `96893e8`.

## Browser results

Three samples per condition and workflow. Times are medians in seconds. Chrome 157 ran headless on the same Windows host. Desktop used a 1440 × 900 viewport. Mobile used Playwright's Pixel 7 profile. The throttled profile added 150 ms latency, 1.6 Mbps download, 750 kbps upload, and 4× CPU slowdown via Chromium DevTools Protocol.

| Workflow                                   | Desktop before → after | Mobile before → after | Throttled mobile before → after |
| ------------------------------------------ | ---------------------: | --------------------: | ------------------------------: |
| Cold Overview heading                      |            4.51 → 1.50 |           4.07 → 1.46 |                    12.20 → 7.32 |
| Warm Overview reload                       |            1.44 → 0.38 |           0.94 → 0.34 |                     3.42 → 3.20 |
| First Inventory click after Overview       |            0.24 → 2.95 |           0.26 → 2.71 |                     3.67 → 6.37 |
| Cold start through first Inventory heading |            4.75 → 4.48 |           4.62 → 4.16 |                   15.86 → 14.40 |
| Inventory → Pricing                        |            0.10 → 0.16 |           0.38 → 0.37 |                     1.20 → 1.87 |
| Pricing → Overview                         |            0.09 → 0.07 |           0.36 → 0.33 |                     0.72 → 1.34 |

Cold runs use new browser contexts with existing staff authentication. Warm runs reload in the same context after visiting Inventory and Pricing. The clock stops when the route's main heading is visible. Navigation timers start at link selection after opening the mobile menu. The cold-to-Inventory row uses the median of each sample's cold plus first-navigation time, excluding the separate menu-opening action. After the release, Overview can display before the full catalog arrives. Receiving waits for the full product list. Clicking Inventory immediately therefore exposes a wait that was previously part of Overview startup.

## Price approval

One live approval for each condition in each version. These are end-to-end observations with the request already pending. Before testing approved the generated SKU at its existing price. The two after tests moved `GR-700999` from $10.79 to $10.80 and back to $10.79. Each after test verified the approved status and then looked up the amount in the Inventory UI.

| Condition        | Browser click to write response | Browser click to refreshed approval |
| ---------------- | ------------------------------: | ----------------------------------: |
| Desktop          |                35.32 s → 1.22 s |                    39.42 s → 2.18 s |
| Throttled mobile |                46.32 s → 1.38 s |                    53.47 s → 2.94 s |

The request body dropped from about 789 KB to 170 bytes. Over the two live calls per implementation, PostgreSQL averaged 16,084 ms for the full master publication and 777 ms for the price-specific publication. The old browser path cloned and compressed the full master, waited for Vercel to build and upload workbook/catalog files, then passed the complete catalog to PostgreSQL for validation and upsert. The new RPC checks staff role, expected revision, request state and cost floor inside the transaction. It updates one product, records the approval, creates the versioned master revision, and writes an audit event. The RPC's request receipt protects identical retries.

## Where the startup time went

- **Document and assets.** Cold document TTFB was roughly 22–25 ms unthrottled and 153–154 ms under throttling. Desktop JavaScript transferred before Overview fell from about 306 KB to 289 KB with route splitting. Static hashed assets now return `Cache-Control: public, max-age=31536000, immutable` and were verified as CDN hits. HTML remains revalidated.
- **Authenticated data.** The old startup transferred about 72 KB for the workspace snapshot, 593 KB for the catalog and 100 KB for the opening-stock manifest before rendering the dashboard. The new preview snapshot transferred about 17 KB on the observed unthrottled cold startup. It contains live counts, queue products and recent activity. The full load continues in parallel with normal UI use so routes can retain their existing functionality.
- **Database and client work.** A paired SQL probe measured roughly 25 ms for the Overview payload and 47 ms for the full snapshot on the warm database. Before the change, the full snapshot RPC averaged about 141 ms in the initial PostgreSQL statistics sample with intermittent multi-second runs. The representative scan lookup changed from a sequential scan of 33,248 products to a bitmap plan using the ID, SKU, and barcode indexes. In the two captured plans, execution was 795 ms and 4.6 ms. Those are individual probes, sensitive to database load. Summed long-task duration before cold Overview on the 4× CPU profile was 4.25 s before and 3.72 s after. Long tasks can overlap network time.
- **Vercel.** Speed Insights still loads in production, and its signed-in SPA and signed-out checks passed. The Observability query for field LCP returned HTTP 402 on this project, and the authenticated CLI could not access the project scope. Page timing comparisons use controlled browser traces. Production routing showed the existing function running in `iad1`; Supabase reports `us-east-1`. Moving regions or replacing the existing Supabase Data API with a SQL driver and separate pool would leave the measured download, workbook generation, and master rewrite costs in place. The approval now bypasses the Vercel function entirely, while downloads and general workbook edits keep the existing deployment.

## Freshness and access

The authenticated workspace checks the current staff session and account before displaying data. The browser keeps the decoded catalog and opening-stock manifest in memory for that account and clears its workspace cache on sign-out or account changes. An immutable base catalog is keyed by its revision. Price-only revisions supply authoritative overrides for that exact revision, and a new full master revision changes the base key. Workspace polling remains every 20 seconds in the active tab, with a 15-second freshness window for focus refetches. Successful writes invalidate and await workspace refresh. Historic price-revision workbooks are generated on request from the revision's base and overrides and served with `Cache-Control: no-store`.

## Reproduce

1. Supply an authorized Playwright storage state via `RUN_SESSION_STATE`. Keep it outside version control. Use `BASE_URL` to target the deployment being measured.
2. Run `node scripts/benchmark-workspace.mjs`. It records timings, request TTFB and bytes, and browser long tasks. Set `BENCH_OUTPUT` to save JSON, `BENCH_REPEATS` to adjust the sample count, or `BENCH_PROFILE` to run one condition.
3. Run the approval benchmark only in an authorized QA environment or with permission to record a test request and revision. Set `BENCH_WRITE=1`, choose a generated SKU with `BENCH_PRICE_PRODUCT`, and run `node --env-file=.env.local scripts/benchmark-price.mjs`. It uses the current price by default. Set `BENCH_PRICE_MOBILE=1` for the throttled mobile condition. The benchmark records the response and refreshed UI separately.
4. Run `tests/workspace-latency.sql` on an initialized database with active test roles. It checks approval authorization, idempotence, current price, price revision payload, and audit history inside a rolled-back transaction.

The largest remaining bottleneck is loading and decoding the full catalog on the first detailed inventory view, especially on a throttled phone. Deferring the download keeps Overview usable earlier, while a server-paged Inventory would be needed to remove that first-navigation dependency. Revision exports also incur Excel generation on demand. The two production export requests reported about 9.8–10.8 seconds of server time.
