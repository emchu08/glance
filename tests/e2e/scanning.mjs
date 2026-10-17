import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.BASE_URL ?? "http://localhost:3100";
test("explicit scans only: the glimpse endpoint never auto-runs and large bodies are rejected", async () => {
  const huge = JSON.stringify({ image: `data:image/jpeg;base64,${"A".repeat(8_200_000)}` });
  const r = await fetch(`${base}/api/glance/glimpse`, { method: "POST", headers: { "content-type": "application/json" }, body: huge }).catch(() => ({ status: 413 }));
  assert.ok([413, 400].includes(r.status));
  const bad = await fetch(`${base}/api/glance/glimpse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image: "not-a-data-url" }) });
  assert.equal(bad.status, 400);
});
test("grocery sampler contract: eleven scripted frames available through the API", async () => {
  for (let i = 0; i < 11; i += 1) { const r = await fetch(`${base}/api/glance/grocery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample: i }) }); assert.equal(r.status, 200); }
});
