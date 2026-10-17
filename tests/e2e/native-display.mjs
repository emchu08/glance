import { test } from "node:test";
import assert from "node:assert/strict";
const base = process.env.BASE_URL ?? "http://localhost:3100";
test("lens page declares the 600×600 viewport, manifest and icons for the native display host", async () => {
  const html = await (await fetch(`${base}/lens`)).text();
  assert.ok(html.includes("width=600"));
  assert.ok(html.includes("/manifest.webmanifest"));
  const m = await (await fetch(`${base}/manifest.webmanifest`)).json();
  assert.equal(m.start_url, "/lens"); assert.equal(m.background_color, "#000000");
  for (const s of [96, 192, 512]) { const r = await fetch(`${base}/icons/icon-${s}.png`); assert.equal(r.status, 200); assert.equal(r.headers.get("content-type"), "image/png"); }
  assert.equal((await fetch(`${base}/icons/evil.svg`)).status, 404);
});
