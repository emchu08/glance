import { test } from "node:test";
import assert from "node:assert/strict";
import { searchStream } from "./helpers/anthropic-stream";

// The engine reads the key when it is first used; set it before the modules load.
process.env.ANTHROPIC_API_KEY ??= "test-key";
const { extractDetails } = await import("@/server/listings/page-details");
const { groundedListings, listingCacheKey, parseListingsText, listingKey } = await import("@/server/listings/search");
const { lensListingStream } = await import("@/server/listings");

const page = new URL("https://shop.example/products/sweater");

test("product details: Shopify http photos, reversed attributes, JSON-LD and USD-only prices", () => {
  assert.deepEqual(extractDetails('<meta content="http://cdn.shopify.com/a.jpg?a=1&amp;b=2" property="og:image"><meta property="product:price:amount" content="29.90"><meta property="product:price:currency" content="USD">', page), { image: "https://cdn.shopify.com/a.jpg?a=1&b=2", priceCents: 2990 });
  const product = { "@graph": [{ "@type": "Product", image: { "@type": "ImageObject", contentUrl: "//cdn.shopify.com/sweater.jpg" }, offers: { price: "1,299.00", priceCurrency: "USD" } }] };
  assert.deepEqual(extractDetails(`<script type="application/ld+json">${JSON.stringify(product)}</script>`, page), { image: "https://cdn.shopify.com/sweater.jpg", priceCents: 129900 });
  assert.deepEqual(extractDetails('<meta property="og:image" content="https://127.0.0.1/private.jpg"><meta itemprop="price" content="10"><meta itemprop="priceCurrency" content="EUR">', page), { image: null, priceCents: null });
  assert.equal(extractDetails('<meta itemprop="price" content="10">', page).priceCents, null, "missing currency never becomes USD");
  assert.equal(extractDetails('<meta property="og:image" content="/brand_logo2.png">', page).image, null);
});

test("parser and keys handle chunked JSON, old wrappers and accents without changing model numbers", () => {
  const item = { name: 'A "quoted" sweater', url: page.href, price_usd: 20 };
  assert.equal(parseListingsText(JSON.stringify(item).slice(0, -1)).length, 0);
  assert.deepEqual(parseListingsText(`\`\`\`json\n${JSON.stringify(item)}\n${JSON.stringify(item)}\n\`\`\``), [item, item]);
  assert.deepEqual(parseListingsText(JSON.stringify({ listings: [item] })), [item]);
  for (const q of ["Levi’s 501 jeans", "Buy a gray sweater online", "café ２０ jacket"]) assert.equal(listingKey(q), listingCacheKey(q));
  assert.notEqual(listingCacheKey("Pegasus 37"), listingCacheKey("Pegasus 38"));
});

test("category prices are never offered as a product's price; links stay grounded in the search", () => {
  const offers = groundedListings([{ name: "Sweater", url: page.href + "/", page: "product", price_usd: 20 }, { name: "Sweaters", url: "https://shop.example/collections/knits", page: "category", price_usd: 10 }], [{ title: "Sweater", url: page.href + "?color=gray" }, { title: "Sweaters", url: "https://shop.example/collections/knits" }]);
  assert.equal(offers[0].url, page.href + "?color=gray");
  assert.equal(offers[1].priceCents, null);
  const invented = groundedListings([{ name: "Made up", url: "https://elsewhere.example/p/1", page: "product", price_usd: 5 }], [{ title: "Sweater", url: page.href }]);
  assert.ok(invented.every((o) => o.url !== "https://elsewhere.example/p/1"), "a link the search never returned is never offered");
});

test("the lens stream puts lead offers first, streams grounded cards, then the ranked list", async (t) => {
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (!request.url.startsWith("https://api.anthropic.com/")) return new Response("", { status: 404 });
    const sources = [{ title: "Gray crew sweater", url: "https://knits.example/products/gray-crew" }, { title: "Wool crew", url: "https://wool.example/p/123456" }];
    const lines = [
      { name: "Gray crew sweater", url: "https://knits.example/products/gray-crew", price_usd: 48, match: "possible", page: "product", why: "Gray, crew neck" },
      { name: "Made-up listing", url: "https://invented.example/products/x", price_usd: 1, page: "product" },
    ].map((l) => JSON.stringify(l)).join("\n") + "\n";
    return searchStream(sources, lines);
  });
  const lead = { id: "demo-tote", name: "Gray canvas tote", retailer: "Glance Demo Market", url: "https://glance.example/tote", imageUrl: null, priceCents: 1200, match: "similar" as const, kind: "connect_merchant" as const, origin: "live" as const };
  const res = lensListingStream("gray crew neck sweater unique-test-query", { lead: [lead], signal: new AbortController().signal });
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(events[0].type, "offer");
  assert.equal(events[0].offer.id, "demo-tote", "the connected seller is shown before the web search answers");
  const streamed = events.filter((e) => e.type === "offer").map((e) => e.offer.url);
  assert.ok(streamed.includes("https://knits.example/products/gray-crew"));
  assert.ok(!streamed.includes("https://invented.example/products/x"), "invented links are dropped");
  const done = events.at(-1);
  assert.equal(done.type, "done");
  assert.equal(done.offers[0].id, "demo-tote", "lead offers stay first after ranking");
  const card = done.offers.find((o: { url: string }) => o.url === "https://knits.example/products/gray-crew");
  assert.equal(card.priceCents, 4800);
  assert.equal(card.kind, "external_link");
  assert.equal(card.origin, "live");
});
