const base =
  process.env.BASE_URL ?? "https://rerun-smart-price-tag-psi.vercel.app";
const response = await fetch(base),
  html = await response.text();
const source = html.match(/src="([^"]+\.js)"/);
console.log("Production root:", response.status, "script:", source?.[1]);
if (response.status !== 200 || !source)
  throw new Error("Production HTML unavailable");
const js = await (await fetch(new URL(source[1], base))).text();
if (!js.includes("ikuvbteklxjbsixwhril"))
  throw new Error("Backend not configured in client bundle");
for (const route of ["/inventory", "/scan", "/master", "/activate"]) {
  const page = await fetch(new URL(route, base));
  if (page.status !== 200) throw new Error(`Deep link failed: ${route}`);
}
const api = await fetch(new URL("/api/master", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}",
});
if (api.status !== 401)
  throw new Error("Anonymous master API did not reject the request");
console.log(
  "Passed: production HTML, backend configuration, deep links and unauthenticated API rejection.",
);

