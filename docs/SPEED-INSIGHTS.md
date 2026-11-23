# Vercel Speed Insights

The app uses `@vercel/speed-insights/react` alongside the existing Vercel Web Analytics integration. These are separate products: Web Analytics records visits, while Speed Insights records browser performance measurements.

`WorkspaceShell.tsx` mounts Speed Insights once the signed-in workspace loads. The existing TanStack Router pathname is passed through the SDK's `route` property, so client-side navigation updates the route rather than leaving every measurement grouped under the initial page. The SDK deduplicates its script during React Strict Mode rendering.

The `beforeSend` callback removes URL query strings and fragments from performance events. It does not add user emails, product contents, credentials, or activation tokens to telemetry. Sign-in and activation pages do not initialize Speed Insights.

After deployment, verify the actual script response is JavaScript, that a single Speed Insights script is present in the signed-in browser, that its route changes during navigation, and that Vercel accepts a real `vitals` request. Metrics are commonly sent when a page becomes hidden, unloads, or changes routes; a successful build alone does not prove collection works.

Dashboard aggregation can lag behind accepted requests and requires real visits. Do not generate fabricated measurements to populate the dashboard. Content blockers may prevent collection in an individual browser.

Official references: [React installation](https://vercel.com/docs/speed-insights/quickstart), [SDK configuration](https://vercel.com/docs/speed-insights/package), and [collection troubleshooting](https://vercel.com/docs/speed-insights/troubleshooting).
