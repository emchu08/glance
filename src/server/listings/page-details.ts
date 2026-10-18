import "server-only";

import { getCache, waitUntil } from "@vercel/functions";
import { assertPublicResolvable } from "@/server/url";
import { publicHttpsUrl } from "./urls";

/**
 * A product page's photo and advertised price, for web listings (search results carry
 * neither reliably). SERVER ONLY.
 *
 * Amazon and Best Buy photos come straight from their image CDNs (their pages have no
 * photo tags or hang on server fetches). Every other page is read once: first with a
 * browser User-Agent. Blocked pages use the camera crop. Only public https pages and photos, short timeouts and a size cap. Results are
 * cached for a day across instances (Vercel Runtime Cache; in memory in dev and tests)
 * and shared by concurrent callers.
 */

export interface PageDetails {
  /** A direct https photo URL, or null when the page has no usable photo. */
  image: string | null;
  /** The advertised USD price in integer cents, or null. */
  priceCents: number | null;
}

const NONE: PageDetails = { image: null, priceCents: null };
const PAGE_TIMEOUT_MS = 3_000;
const MAX_HTML_CHARS = 1_500_000;
/** Re-check for both details after this much more HTML (not on every chunk). */
const CHECK_EVERY_CHARS = 96_000;
/** A 200 page this small with no photo or price tags is a bot wall, not a product page. */
const TINY_PAGE_CHARS = 50_000;
const MAX_REDIRECTS = 4;
/** Unknown Amazon ASINs return a tiny placeholder instead of a 404. */
const MIN_IMAGE_BYTES = 1_500;
const READ_TTL_SECONDS = 24 * 60 * 60;
const FAILED_TTL_SECONDS = 60 * 60;

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const BROWSER_HEADERS: HeadersInit = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-US,en;q=0.9",
};
const inflight = new Map<string, Promise<PageDetails>>();

export function pageDetails(raw: string, { timeoutMs = PAGE_TIMEOUT_MS }: { timeoutMs?: number } = {}): Promise<PageDetails> {
  const url = publicHttpsUrl(raw);
  if (!url) return Promise.resolve(NONE);
  const key = `glance:page:v3:${url.href}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const hit = (await getCache().get(key)) as PageDetails | null | undefined;
        if (hit) return hit;
      } catch { /* cache unavailable: read the page */ }
      const { details, ttl } = await lookUp(url, timeoutMs);
      waitUntil(getCache().set(key, details, { ttl, name: "glance-page" }).catch(() => {}));
      return details;
    })().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

async function lookUp(url: URL, timeoutMs: number): Promise<{ details: PageDetails; ttl: number }> {
  const cdnImage = amazonImage(url) ?? bestBuyImage(url);
  if (cdnImage || isAmazon(url) || isBestBuy(url)) {
    // Never their pages: Amazon's have no photo tags, Best Buy's hang.
    const valid = cdnImage ? await imageLoads(cdnImage, timeoutMs) : false;
    return { details: { image: valid ? cdnImage : null, priceCents: null }, ttl: valid !== null ? READ_TTL_SECONDS : FAILED_TTL_SECONDS };
  }
  const page = await readPage(url, BROWSER_HEADERS, timeoutMs);
  return { details: page.details, ttl: page.ok && !page.blocked ? READ_TTL_SECONDS : FAILED_TTL_SECONDS };
}

/* ── Store image CDNs ────────────────────────────────────────────────────── */

const isAmazon = (url: URL) => /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|co\.jp|com\.au|com\.mx|in)$/i.test(url.hostname);
const isBestBuy = (url: URL) => /(^|\.)bestbuy\.com$/i.test(url.hostname);

function amazonImage(url: URL): string | null {
  const asin = isAmazon(url) ? /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?#]|$)/i.exec(url.pathname)?.[1] : undefined;
  return asin ? `https://m.media-amazon.com/images/P/${asin.toUpperCase()}.01._SCLZZZZZZZ_SX500_.jpg` : null;
}

function bestBuyImage(url: URL): string | null {
  if (!isBestBuy(url)) return null;
  const sku = url.searchParams.get("skuId")?.match(/^\d{6,8}$/)?.[0] ?? /\/(\d{6,8})\.p$/.exec(url.pathname)?.[1];
  return sku ? `https://pisces.bbystatic.com/image2/BestBuy_US/images/products/${sku.slice(0, 4)}/${sku}_sd.jpg` : null;
}

/** True: a real photo. False: missing or a placeholder. Null: couldn't tell (network). */
async function imageLoads(image: string, timeoutMs: number): Promise<boolean | null> {
  try {
    await assertPublicResolvable(new URL(image));
    const response = await fetch(image, { headers: { "User-Agent": USER_AGENT, Accept: "image/*" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok || !response.body || !(response.headers.get("content-type") ?? "").startsWith("image/")) {
      await response.body?.cancel().catch(() => {});
      return false;
    }
    const length = Number(response.headers.get("content-length"));
    if (length > 0) {
      await response.body.cancel().catch(() => {});
      return length > MIN_IMAGE_BYTES;
    }
    const reader = response.body.getReader();
    let size = 0;
    while (size <= MIN_IMAGE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
    }
    reader.cancel().catch(() => {});
    return size > MIN_IMAGE_BYTES;
  } catch {
    return null;
  }
}

/* ── Reading a page ──────────────────────────────────────────────────────── */

interface PageRead {
  details: PageDetails;
  /** The store answered with a page (even one without a photo). */
  ok: boolean;
  /** A short failure cache is appropriate for a blocked page. */
  blocked: boolean;
}

async function readPage(url: URL, headers: HeadersInit, timeoutMs: number): Promise<PageRead> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response | null = null;
  let base = url;
  try {
    // Redirects are followed by hand so that every hop is checked, not only the last one.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Every hop must resolve to a public address, not only look like one.
      await assertPublicResolvable(base);
      response = await fetch(base, { headers, redirect: "manual", signal });
      const location = response.status >= 300 && response.status < 400 ? response.headers.get("location") : null;
      if (!location) break;
      await response.body?.cancel().catch(() => {});
      response = null;
      const next = publicHttpsUrl(safeUrl(location, base));
      if (!next) break;
      base = next;
    }
  } catch {
    return { details: NONE, ok: false, blocked: false };
  }
  if (!response || !response.ok || !response.body) {
    await response?.body?.cancel().catch(() => {});
    return { details: NONE, ok: false, blocked: !!response && [202, 403, 429, 503].includes(response.status) };
  }
  if (!/html|xml/i.test(response.headers.get("content-type") ?? "html")) {
    await response.body.cancel().catch(() => {});
    return { details: NONE, ok: true, blocked: false };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  let checked = 0;
  let details = NONE;
  try {
    while (html.length < MAX_HTML_CHARS) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
      if (html.length - checked >= CHECK_EVERY_CHARS) {
        checked = html.length;
        details = extractDetails(html, base);
        if (details.image && details.priceCents !== null) break;
      }
    }
  } catch { /* timed out mid-page: use what arrived */ }
  reader.cancel().catch(() => {});
  if (checked !== html.length) details = extractDetails(html, base);
  const empty = !details.image && details.priceCents === null;
  return { details, ok: true, blocked: empty && html.length < TINY_PAGE_CHARS };
}

function safeUrl(raw: string, base: URL): string | null {
  try {
    return new URL(raw, base).href;
  } catch {
    return null;
  }
}

/* ── Extraction ──────────────────────────────────────────────────────────── */

/** The page's product photo and advertised USD price, from its meta tags and schema.org data. */
export function extractDetails(html: string, base: URL): PageDetails {
  const attributes = tags(html, "meta").concat(tags(html, "link"), itemprops(html));
  const products = productNodes(jsonLd(html));
  return { image: firstPhoto(imageCandidates(attributes, products), base), priceCents: pagePrice(attributes, products) };
}

type Attributes = Record<string, string>;

/** Every `<name …>` tag's attributes (names lowercased, values decoded), in document order. */
function tags(html: string, name: string): Attributes[] {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((match) => parseAttributes(match[1]));
}

/** Any element carrying microdata for a photo or price (`<span itemprop="price" content=…>`, `<img itemprop="image">`). */
function itemprops(html: string): Attributes[] {
  return [...html.matchAll(/<(?!meta\b|link\b)[a-z][a-z0-9]*\b([^>]*\bitemprop\s*=\s*["']?(?:image|price|pricecurrency)\b[^>]*)>/gi)].map((match) => parseAttributes(match[1]));
}

function parseAttributes(source: string): Attributes {
  const out: Attributes = {};
  for (const match of source.matchAll(/([^\s=/>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    const key = match[1].toLowerCase();
    if (!(key in out)) out[key] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeEntities(text: string) {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity: string) => {
      const e = entity.toLowerCase();
      if (!e.startsWith("#")) return ENTITIES[e];
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&amp;/gi, "&");
}

/** The value of each meta-like tag whose property / name / itemprop is one of `keys`. */
function valuesOf(attributes: Attributes[], ...keys: string[]): string[] {
  return attributes.flatMap((a) => {
    const key = (a.property ?? a.name ?? a.itemprop ?? "").toLowerCase();
    const value = a.content ?? a.href ?? a.src;
    return keys.includes(key) && value ? [value] : [];
  });
}

function imageCandidates(attributes: Attributes[], products: JsonObject[]): string[] {
  return [
    // Product schema is more specific than a site's generic social sharing image.
    ...products.flatMap((product) => jsonLdImages(product.image)),
    ...valuesOf(attributes, "og:image:secure_url"),
    ...valuesOf(attributes, "og:image", "og:image:url"),
    ...valuesOf(attributes, "twitter:image", "twitter:image:src"),
    ...attributes.flatMap((a) => (a.rel ?? "").toLowerCase().split(/\s+/).includes("image_src") && a.href ? [a.href] : []),
    ...attributes.flatMap((a) => a.itemprop?.toLowerCase() === "image" && (a.content ?? a.href ?? a.src) ? [a.content ?? a.href ?? a.src] : []),
  ];
}

/** Logos, placeholders, sprites and other images that aren't a photo of the product. */
const NOT_A_PHOTO = /(^|[/_.-])(logos?\d*|brand|placeholders?|sprites?|favicons?|spacer|no[-_]?image|image[-_]?not[-_]?available|coming[-_]?soon|default[-_]?(?:image|og|share)|og[-_]?default|global[-_]og[-_]image|social[-_]share[-_]image)([/_.-]|$)/i;

function firstPhoto(candidates: string[], base: URL): string | null {
  for (const candidate of candidates) {
    let value = candidate.replace(/\\\//g, "/").trim();
    if (!value || /^data:/i.test(value)) continue;
    if (value.startsWith("//")) value = `https:${value}`;
    let url: URL;
    try {
      url = new URL(value, base);
    } catch {
      continue;
    }
    // Shopify stores (and others) still publish http:// photo links; their CDNs serve https.
    if (url.protocol === "http:") url = new URL(`https:${url.href.slice("http:".length)}`);
    if (/\.svg$/i.test(url.pathname) || NOT_A_PHOTO.test(url.pathname)) continue;
    const photo = publicHttpsUrl(url.href);
    if (photo) return photo.href;
  }
  return null;
}

/* ── schema.org JSON-LD ──────────────────────────────────────────────────── */

type JsonObject = Record<string, unknown>;

function jsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1].trim().replace(/^(?:<!\[CDATA\[|<!--)|(?:\]\]>|-->)$/g, "").trim();
    for (const attempt of [body, body.replace(/[\u0000-\u001f]+/g, " ")]) {
      try {
        out.push(JSON.parse(attempt));
        break;
      } catch { /* malformed: try once without raw control characters */ }
    }
  }
  return out;
}

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** Product (and ProductGroup) nodes, including those inside @graph, mainEntity and variants. */
function productNodes(data: unknown[]): JsonObject[] {
  const out: JsonObject[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (!isObject(node)) return;
    const types = [node["@type"]].flat().map((t) => String(t).toLowerCase().replace(/^.*[/#]/, ""));
    if (types.some((t) => t === "product" || t === "productgroup" || t === "individualproduct" || t === "productmodel")) out.push(node);
    for (const key of ["@graph", "mainEntity", "hasVariant"]) visit(node[key], depth + 1);
  };
  for (const item of data) visit(item, 0);
  return out;
}

/** schema.org `image`: a URL, a list of URLs, or ImageObject(s) with `url` / `contentUrl`. */
function jsonLdImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(jsonLdImages);
  if (isObject(value)) return [value.url, value.contentUrl].flatMap((v) => typeof v === "string" ? [v] : []);
  return [];
}

/* ── Price ───────────────────────────────────────────────────────────────── */

/** Advertised price: Open Graph product meta, then schema.org offers, then microdata. USD only. */
function pagePrice(attributes: Attributes[], products: JsonObject[]): number | null {
  for (const [amount, currency] of [["product:price:amount", "product:price:currency"], ["og:price:amount", "og:price:currency"]]) {
    const code = valuesOf(attributes, currency)[0];
    if (code?.trim().toUpperCase() !== "USD") continue;
    for (const value of valuesOf(attributes, amount)) {
      const cents = toPriceCents(value);
      if (cents !== null) return cents;
    }
  }
  for (const product of products) {
    for (const offer of offersOf(product.offers)) {
      const spec = [offer.priceSpecification].flat().find(isObject);
      if (String(offer.priceCurrency ?? spec?.priceCurrency ?? "").toUpperCase() !== "USD") continue;
      for (const value of [offer.price, offer.lowPrice, spec?.price]) {
        const cents = toPriceCents(value);
        if (cents !== null) return cents;
      }
    }
  }
  const code = valuesOf(attributes, "pricecurrency")[0];
  if (code?.trim().toUpperCase() !== "USD") return null;
  for (const value of valuesOf(attributes, "price")) {
    const cents = toPriceCents(value);
    if (cents !== null) return cents;
  }
  return null;
}

/** Offer, AggregateOffer (and its nested offers), or a list of either. */
function offersOf(value: unknown, depth = 0): JsonObject[] {
  if (depth > 3) return [];
  if (Array.isArray(value)) return value.flatMap((v) => offersOf(v, depth + 1));
  if (!isObject(value)) return [];
  return [value, ...offersOf(value.offers, depth + 1)];
}

/** "29.90", "$1,299.00" or 29.9 → cents, within a sane range ($0.50–$100,000). */
export function toPriceCents(value: unknown): number | null {
  let amount: number;
  if (typeof value === "number") amount = value;
  else if (typeof value === "string") {
    const text = value.trim().replace(/^(?:US)?\$\s*|\s*USD$/gi, "");
    if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(text)) return null;
    amount = Number(text.replace(/,/g, ""));
  } else return null;
  return Number.isFinite(amount) && amount >= 0.5 && amount <= 100_000 ? Math.round(amount * 100) : null;
}
