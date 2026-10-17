// Loads .env.local / .env into process.env for scripts (never prints values).
import { existsSync, readFileSync } from "node:fs";
for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
export const baseUrl = process.env.BASE_URL ?? "http://localhost:3100";
export const live = process.env.GLANCE_LIVE === "1";
