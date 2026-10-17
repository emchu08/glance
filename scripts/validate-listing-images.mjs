// Validates that listing image URLs resolve through the public-HTTPS thumb route (no private hosts, no credentials).
import { baseUrl } from "./_env.mjs";
const urls = process.argv.slice(2);
if (!urls.length) { console.log("usage: node scripts/validate-listing-images.mjs <product-page-url>…"); process.exit(0); }
for (const u of urls) {
  const r = await fetch(`${baseUrl}/api/glance/thumb?url=${encodeURIComponent(u)}`, { redirect: "manual" });
  console.log(r.status, u, r.headers.get("location") ?? "");
}
