const productionOrigin = "https://rerun-smart-price-tag-psi.vercel.app";
const productionAlias =
  "https://rerun-smart-price-tag-venadiunns-projects.vercel.app";
const maxCodeLength = 32768;

export function scanCodeFromUrl(search: string, hash: string) {
  const fragment = new URLSearchParams(hash.slice(1));
  return (
    fragment.get("item") ??
    fragment.get("code") ??
    new URLSearchParams(search).get("code") ??
    ""
  );
}

export function scanLink(code: string, origin: string) {
  const url = new URL(
    "/scan",
    origin === productionAlias ? productionOrigin : origin,
  );
  // Scan data stays in the browser during the request for the sign-in page.
  url.hash = new URLSearchParams({ item: code }).toString();
  return url.href;
}

export function normalizeScanCode(raw: string, origin = "") {
  let code = raw.trim();
  if (/^https?:/i.test(code)) {
    const url = new URL(code);
    const trustedOrigin = [origin, productionOrigin, productionAlias].includes(
      url.origin,
    );
    if (
      !trustedOrigin ||
      url.username ||
      url.password ||
      !/^\/scan\/?$/.test(url.pathname)
    ) {
      throw new Error(
        "This link does not open ReRun’s scanner. Enter an item, unit, or tag code.",
      );
    }
    code = scanCodeFromUrl(url.search, url.hash).trim();
  }
  if (!code || code.length > maxCodeLength) {
    throw new Error(
      "Enter a supported identifier or QR payload (maximum 32 KB).",
    );
  }
  return code.replace(/^rerun:(unit|tag):/, "");
}
