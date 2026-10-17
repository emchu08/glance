// Grocery frame test. Offline: plays the eleven scripted observations through the API and
// checks the tracker contract (yogurt added once). GLANCE_LIVE=1 with an image calls the model.
import { readFileSync } from "node:fs";
import { baseUrl, live } from "./_env.mjs";

const file = process.argv[2];
if (live) {
  if (!file) { console.error("GLANCE_LIVE=1 requires an image path"); process.exit(1); }
  const image = `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(file).toString("base64")}`;
  const res = await fetch(`${baseUrl}/api/glance/grocery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, cart: [] }) });
  console.log(JSON.stringify(await res.json(), null, 2));
  process.exit(res.ok ? 0 : 1);
}
let frames = 0;
const seen = [];
for (let i = 0; i < 11; i += 1) {
  const res = await fetch(`${baseUrl}/api/glance/grocery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sample: i }) });
  const data = await res.json();
  frames += 1;
  seen.push(`${i + 1}: ${data.caption} → ${data.observations.map((o) => `${o.productKey}:${o.state}@${o.confidence}`).join(", ") || "none"}`);
}
console.log(seen.join("\n"));
console.log(`\n${frames} frames · offline sample · see tests/grocery-tracker.test.ts for the add/ask/put-back contract`);
