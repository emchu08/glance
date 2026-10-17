import { z } from "zod";
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from "@/server/http";
import { rateLimit } from "@/server/relay";
import { HttpError, supabaseAdmin, supabaseServer } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["sign-up", "sign-in", "sign-out"]), email: z.string().email().optional(), password: z.string().min(8).max(128).optional() });

/**
 * Email + password accounts for the Glance wallet. Sign-up is created server-side with the
 * admin API so the demo does not depend on confirmation email delivery; the session itself is
 * established with the publishable key through Supabase SSR cookies.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!(await rateLimit(`auth:${clientKey(req)}`, 20, 10 * 60_000))) throw new HttpError(429, "Too many attempts");
    const body = await readJson(req, Body);
    const sb = await supabaseServer();
    if (body.action === "sign-out") { await sb.auth.signOut(); return json({ ok: true }); }
    if (!body.email || !body.password) throw new HttpError(400, "Email and password required");
    if (body.action === "sign-up") {
      const admin = supabaseAdmin();
      const { data, error } = await admin.auth.admin.createUser({ email: body.email, password: body.password, email_confirm: true });
      if (error && !/already/i.test(error.message)) throw new HttpError(400, error.message);
      if (data?.user) await admin.from("profiles").upsert({ id: data.user.id, email: body.email }, { onConflict: "id" });
    }
    const { data, error } = await sb.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error || !data.user) throw new HttpError(401, error?.message ?? "Sign in failed");
    await supabaseAdmin().from("profiles").upsert({ id: data.user.id, email: data.user.email }, { onConflict: "id" });
    return json({ ok: true, email: data.user.email });
  } catch (e) { return errorResponse(e); }
}
