// HTTP-level end-to-end checks against a running server (BASE_URL, default http://localhost:3100).
// Offline by default: exercises sample recognition, offers, fixtures, health, and security gates.
// GLANCE_LIVE_E2E=1 additionally performs one paid live listing search.
import { test } from "node:test";
import assert from "node:assert/strict";

const base = process.env.BASE_URL ?? "http://localhost:3100";
const live = process.env.GLANCE_LIVE_E2E === "1";
const json = async (path, body) => { const r = await fetch(`${base}${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined); return { status: r.status, data: await r.json().catch(() => null), headers: r.headers }; };

test("health and status expose readiness without credentials", async () => {
  const h = await json("/api/health"); assert.equal(h.status, 200); assert.equal(h.data.ok, true);
  const s = await json("/api/glance/status"); assert.equal(s.status, 200);
  assert.ok(!JSON.stringify(s.data).includes("sk_")); assert.ok(!JSON.stringify(s.data).includes("sk-ant"));
});

test("sample glimpse → offers → thumb validation", async () => {
  const g = await json("/api/glance/glimpse", { sample: 0 });
  assert.equal(g.status, 200); assert.equal(g.data.candidates[0].id, "gray-sweater"); assert.equal(g.data.perception.model, "sample");
  const o = await json("/api/glance/offers", { candidate: { id: "gray-sweater", label: "Gray crewneck sweater" }, sample: true });
  assert.equal(o.status, 200); assert.ok(o.data.offers.length >= 4);
  assert.ok(o.data.offers.some((x) => x.kind === "connect_merchant"), "eligible demo-merchant offer present");
  const bad = await fetch(`${base}/api/glance/thumb?url=http://localhost/x`); assert.equal(bad.status, 400);
  const priv = await fetch(`${base}/api/glance/thumb?url=https://10.0.0.1/`); assert.equal(priv.status, 400);
});

test("grocery exit math and dish/recipes sample paths", async () => {
  const e = await json("/api/glance/grocery/exit", { cart: [{ productKey: "x", label: "X", packageSize: null, quantity: 1, unitPriceCents: 500, currency: "USD", priceSource: "catalog", confirmed: true, events: ["1"] }], orders: [{ priceCents: 449 }] });
  assert.equal(e.data.summary.thisTripCents, 949);
  const d = await json("/api/glance/gourmet", { sample: true }); assert.equal(d.data.hypotheses[0].name, "Fettuccine Alfredo");
  const r = await json("/api/glance/recipes", { dish: "Fettuccine Alfredo", sample: true }); assert.equal(r.data.recipes.length, 3);
});

test("wallet and orders require authentication; purchase rejects client amounts by construction", async () => {
  assert.equal((await json("/api/wallet")).status, 401);
  assert.equal((await json("/api/orders")).status, 401);
  assert.equal((await json("/api/orders/quote", { merchantId: "glance-demo-market", lines: [{ sku: "demo-gray-tote", quantity: 1 }] })).status, 401);
  const bad = await json("/api/payments/purchase", { orderId: "not-a-uuid", attemptKey: "k" }); assert.ok([400, 401].includes(bad.status));
});

test("fixture lens pages render in development and the relay pairs", async () => {
  const r = await fetch(`${base}/lens?screen=offers-photo&source=sample`); assert.equal(r.status, 200);
  const html = await r.text(); assert.ok(html.includes("mrbd-web-app-capable"));
  const pair = await json("/api/relay/pair", { role: "lens" }); assert.equal(pair.status, 200); assert.match(pair.data.code, /^[A-Z2-9]{6}$/);
  const status = await json(`/api/relay/status?code=${pair.data.code}`); assert.equal(status.data.phone, false);
  const frame = await fetch(`${base}/api/relay/frame?code=${pair.data.code}`); assert.equal(frame.status, 204);
  const badUpload = await json("/api/relay/frame", { code: pair.data.code, token: "nope-nope-nope", image: "data:image/jpeg;base64,AAAA", width: 10, height: 10, capturedAt: Date.now() }); assert.equal(badUpload.status, 403);
});

test("handoff rejects non-https and private destinations", async () => {
  const r = await json("/api/relay/handoff", { code: "ABCDEF", kind: "view", title: "x", url: "http://example.com" }); assert.ok([400, 409].includes(r.status));
  const p = await json("/api/relay/handoff", { code: "ABCDEF", kind: "view", title: "x", url: "https://127.0.0.1/" }); assert.ok([400, 409].includes(p.status));
});

test(live ? "live listing search streams grounded offers" : "live listing search skipped (set GLANCE_LIVE_E2E=1)", { skip: !live }, async () => {
  const r = await fetch(`${base}/api/glance/listings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "black backpack" }) });
  const data = await r.json(); assert.equal(r.status, 200); assert.ok(Array.isArray(data.offers));
  for (const o of data.offers) assert.match(o.url, /^https:\/\//);
});
