// Local image test for scene vision. Offline by default (sample fixtures via the API);
// pass GLANCE_LIVE=1 and an image path to call the configured model (paid).
//   node scripts/test-vision.mjs [image.jpg]
import { readFileSync } from "node:fs";
import { baseUrl, live } from "./_env.mjs";

const file = process.argv[2];
const body = live && file
  ? { image: `data:image/${file.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(file).toString("base64")}` }
  : { sample: 0 };
if (live && !file) { console.error("GLANCE_LIVE=1 requires an image path"); process.exit(1); }
const t0 = Date.now();
const res = await fetch(`${baseUrl}/api/glance/glimpse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const data = await res.json();
console.log(JSON.stringify({ mode: live ? "live (paid)" : "offline sample", status: res.status, ms: Date.now() - t0, model: data.perception?.model, candidates: data.candidates?.map((c) => ({ label: c.label, confidence: c.confidence, interest: Number(c.interest?.toFixed(2)), box: c.box })) }, null, 2));
process.exit(res.ok ? 0 : 1);
