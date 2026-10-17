// Applies supabase/migrations/*.sql in order using SUPABASE_DB_URL (direct Postgres), or prints
// instructions for the Supabase SQL editor / MCP when no connection string is configured.
import { readdirSync, readFileSync } from "node:fs";
import "./_env.mjs";
const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.log("SUPABASE_DB_URL not set. Apply these files in order via the Supabase SQL editor or the Supabase MCP apply_migration tool:");
  for (const f of files) console.log(" -", f);
  process.exit(0);
}
let pg;
try { pg = await import("pg"); } catch { console.error("Install pg (npm i -D pg) to run migrations directly."); process.exit(1); }
const client = new pg.default.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("create table if not exists public._glance_migrations (name text primary key, applied_at timestamptz default now())");
for (const f of files) {
  const { rowCount } = await client.query("select 1 from public._glance_migrations where name = $1", [f]);
  if (rowCount) { console.log("skip", f); continue; }
  await client.query("begin"); await client.query(readFileSync(`supabase/migrations/${f}`, "utf8")); await client.query("insert into public._glance_migrations(name) values ($1)", [f]); await client.query("commit");
  console.log("applied", f);
}
await client.end();
