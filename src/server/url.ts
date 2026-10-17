import "server-only";

import { isIP } from "node:net";
import dns from "node:dns/promises";

/**
 * Public-HTTPS URL validation for outgoing links, thumbnails, and redirects.
 * Rejects credentials in URLs, non-HTTPS schemes, private/loopback/link-local hosts,
 * and resolves DNS to confirm the target is not an internal address.
 */
export class UrlError extends Error {}

const PRIVATE_V4 = [
  /^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\./, /^2[3-5]\d\./,
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return PRIVATE_V4.some((r) => r.test(ip));
  const v6 = ip.toLowerCase();
  if (v6 === "::1" || v6 === "::") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return false;
}

export function parsePublicHttpsUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(raw); } catch { throw new UrlError("Invalid URL"); }
  if (u.protocol !== "https:") throw new UrlError("Only https:// links are allowed");
  if (u.username || u.password) throw new UrlError("Credentials in URLs are not allowed");
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new UrlError("Host not allowed");
  if (isIP(host) && isPrivateAddress(host)) throw new UrlError("Private address not allowed");
  if (raw.length > 2048) throw new UrlError("URL too long");
  return u;
}

export async function assertPublicResolvable(u: URL): Promise<void> {
  if (isIP(u.hostname)) return;
  let addrs: { address: string }[];
  try { addrs = await dns.lookup(u.hostname, { all: true }); } catch { throw new UrlError("Host does not resolve"); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new UrlError("Host resolves to a private address");
}

/** Validate a URL that may be relative to the app (handoffs/recovery) or an absolute public https link. */
export function validateHandoffUrl(raw: string, appUrl: string): string {
  if (raw.startsWith("/")) return new URL(raw, appUrl).toString();
  return parsePublicHttpsUrl(raw).toString();
}

/** Fetch with redirect validation: each hop must remain public https. */
export async function fetchPublic(raw: string, init: RequestInit & { maxBytes?: number; timeoutMs?: number } = {}): Promise<Response> {
  let url = parsePublicHttpsUrl(raw);
  const maxBytes = init.maxBytes ?? 2_000_000;
  for (let hop = 0; hop < 5; hop += 1) {
    await assertPublicResolvable(url);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 8000);
    try {
      const res = await fetch(url, { ...init, redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "GlanceBot/0.1 (+https://github.com/emchu08/glance)", accept: init.headers ? (init.headers as Record<string, string>).accept ?? "*/*" : "*/*" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) throw new UrlError("Redirect without location");
        url = parsePublicHttpsUrl(new URL(loc, url).toString());
        continue;
      }
      const len = Number(res.headers.get("content-length") ?? 0);
      if (len > maxBytes) throw new UrlError("Response too large");
      return res;
    } finally {
      clearTimeout(t);
    }
  }
  throw new UrlError("Too many redirects");
}

/** Normalize retailer display name from a host without replacing the real host. */
export function retailerNameFromHost(host: string): string {
  const h = host.replace(/^www\./, "").toLowerCase();
  const known: Record<string, string> = {
    "amazon.com": "Amazon", "target.com": "Target", "walmart.com": "Walmart", "uniqlo.com": "Uniqlo", "gap.com": "Gap", "temu.com": "Temu",
    "herschel.com": "Herschel", "nike.com": "Nike", "zappos.com": "Zappos", "nordstrom.com": "Nordstrom", "rei.com": "REI", "everlane.com": "Everlane",
    "stockx.com": "StockX", "goat.com": "GOAT", "footlocker.com": "Foot Locker", "ebay.com": "eBay", "etsy.com": "Etsy", "bestbuy.com": "Best Buy",
  };
  for (const [k, v] of Object.entries(known)) if (h === k || h.endsWith(`.${k}`)) return v;
  const base = h.split(".").slice(-2, -1)[0] ?? h;
  return base.charAt(0).toUpperCase() + base.slice(1);
}
