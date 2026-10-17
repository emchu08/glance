// Opt-in cache warming for the listing search (paid). Requires GLANCE_LIVE=1 and WARM_QUERIES="a;b;c".
import { baseUrl, live } from "./_env.mjs";
const queries = (process.env.WARM_QUERIES ?? "").split(";").map((s) => s.trim()).filter(Boolean);
if (!live || !queries.length) { console.log("Nothing warmed. Set GLANCE_LIVE=1 and WARM_QUERIES=\"q1;q2\" to warm paid searches deliberately."); process.exit(0); }
for (const q of queries) { const r = await fetch(`${baseUrl}/api/glance/listings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) }); console.log(q, r.status); }
