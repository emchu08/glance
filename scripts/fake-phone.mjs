// Fake phone relay client: completes the pairing exchange with a code, uploads a downscaled
// frame (≤768px, demand-aware), and prints any handoff links it picks up.
//   node scripts/fake-phone.mjs <CODE> <image.jpg> [baseUrl]
import { readFileSync } from "node:fs";
import { baseUrl as defaultBase } from "./_env.mjs";

const [code, imagePath, baseArg] = process.argv.slice(2);
const baseUrl = baseArg ?? defaultBase;
if (!code || !imagePath) { console.error("usage: node scripts/fake-phone.mjs <CODE> <image> [baseUrl]"); process.exit(1); }

const pair = await fetch(`${baseUrl}/api/relay/pair`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "phone", code }) });
if (!pair.ok) { console.error("pairing failed", pair.status, await pair.text()); process.exit(1); }
const { token } = await pair.json();
console.log(`paired as phone for ${code} (scoped credential received)`);

const bytes = readFileSync(imagePath);
const image = `data:image/${imagePath.endsWith(".png") ? "png" : "jpeg"};base64,${bytes.toString("base64")}`;
// Demand-aware loop: upload every 1.5 s while the lens demands frames, otherwise heartbeat every 5 s.
let interval = 5000;
for (let i = 0; i < 20; i += 1) {
  const res = await fetch(`${baseUrl}/api/relay/frame`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, token, image, width: 768, height: 576, capturedAt: Date.now() }) });
  const data = await res.json();
  if (!res.ok) { console.error("upload failed", data); process.exit(1); }
  interval = data.demand ? 1500 : 5000;
  for (const h of data.handoffs ?? []) console.log(`received link [${h.kind}] ${h.title} → ${h.url}`);
  console.log(`frame ${i + 1} uploaded · demand=${data.demand} · next in ${interval}ms`);
  await new Promise((r) => setTimeout(r, interval));
}
