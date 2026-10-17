import { json } from "@/server/http";

export const dynamic = "force-dynamic";
/** Minimal public readiness. No credentials, no configuration detail. */
export async function GET() {
  return json({ ok: true, service: "glance", time: new Date().toISOString() });
}
