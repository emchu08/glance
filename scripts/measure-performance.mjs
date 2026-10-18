// Frame-timing benchmark for the lens and the 3D site. Uses Chrome via Playwright when available
// (installed with npm i -D playwright), otherwise prints manual instructions. Results are written to measurements/.
import { mkdirSync, writeFileSync } from "node:fs";
import { baseUrl } from "./_env.mjs";

const pages = [
  { name: "lens-sample-glimpse", url: `${baseUrl}/lens?screen=offers-photo&source=sample`, ms: 6000 },
  { name: "glasses-picker", url: `${baseUrl}/glasses`, ms: 6000 },
];
let chromium;
try { ({ chromium } = await import("playwright")); } catch { /* none */ }
if (!chromium) {
  console.log("Playwright not found. Install it (npm i -D playwright) or run with Chrome DevTools → Performance. Record median, p95/p99 frame intervals, dropped frames.");
  process.exit(0);
}
let browser;
try { browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined }); }
catch (e) {
  console.log("Could not launch a browser:", String(e.message).split("\n")[0]);
  console.log("Run `npx playwright install chromium` (downloads a browser), or set CHROME_PATH to an installed Chrome, then re-run.");
  process.exit(0);
}
const results = [];
for (const p of pages) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(p.url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1500); // warm-up
    const stats = await page.evaluate((ms) => new Promise((resolve) => {
      const frames = []; let last = performance.now(); const t0 = last;
      const tick = (now) => { frames.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else resolve(frames); };
      requestAnimationFrame(tick);
    }), p.ms);
    const sorted = [...stats].sort((a, b) => a - b);
    const q = (x) => sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))];
    const avgFps = 1000 / (stats.reduce((a, b) => a + b, 0) / stats.length);
    results.push({ page: p.name, url: p.url, frames: stats.length, medianMs: +q(0.5).toFixed(2), p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2), avgFps: +avgFps.toFixed(1), longFrames: stats.filter((f) => f > 33.4).length, note: "demand-rendered idle screens rest; low frame counts on static screens are expected" });
  } catch (e) { results.push({ page: p.name, url: p.url, error: e.message }); }
  await page.close();
}
await browser.close();
mkdirSync("measurements", { recursive: true });
const out = { recordedAt: new Date().toISOString(), device: process.env.MEASURE_DEVICE ?? "unspecified (set MEASURE_DEVICE)", results };
writeFileSync("measurements/performance.local.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
