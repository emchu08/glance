import { json } from "@/server/http";
import { pairingStatus } from "@/server/relay";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code") ?? "";
  if (!/^[A-Z2-9]{6}$/.test(code)) return json({ error: "Bad code" }, 400);
  const s = await pairingStatus(code);
  if (!s) return json({ error: "Unknown code" }, 404);
  return json(s);
}
