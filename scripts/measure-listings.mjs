// Listing latency/usage measurement. Requires GLANCE_LIVE=1 (paid searches) — otherwise explains and exits.
import { baseUrl, live } from "./_env.mjs";
const queries = process.argv.slice(2).length ? process.argv.slice(2) : ["gray crew neck sweater", "black backpack"];
if (!live) { console.log("Offline: set GLANCE_LIVE=1 to run paid listing searches. Queries:", queries); process.exit(0); }
for (const q of queries) {
  const t0 = Date.now();
  let first = null; let count = 0; let priced = 0; let photos = 0;
  const res = await fetch(`${baseUrl}/api/glance/listings`, { method: "POST", headers: { "content-type": "application/json", accept: "application/x-ndjson" }, body: JSON.stringify({ query: q }) });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let nl;
    while ((nl = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue; const m = JSON.parse(line); if (m.offer) { count += 1; if (first === null) first = Date.now() - t0; if (m.offer.priceCents !== null) priced += 1; if (m.offer.imageUrl) photos += 1; } }
  }
  console.log(JSON.stringify({ query: q, firstCardMs: first, totalMs: Date.now() - t0, count, priced, photos }));
}
