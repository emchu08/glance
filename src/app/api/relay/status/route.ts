import { json } from "@/server/http";
import { pairingStatus } from "@/server/relay";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^[A-Z2-9]{6}$/.test(code)) return json({ error: "Bad code" }, 400);
  // The phone app's status checks carry no role (older builds); everything else names itself.
  const role = new URL(req.url).searchParams.get("role");
  const s = await pairingStatus(code, role === "lens" ? "lens" : role === null || role === "phone" ? "phone" : null);
  if (!s) return json({ error: "Unknown code" }, 404);
  return json(s);
}
