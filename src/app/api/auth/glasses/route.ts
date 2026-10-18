import { z } from "zod";
import { assertSameOrigin, clientKey, errorResponse, json, readJson } from "@/server/http";
import { offerGlassesSignIn, rateLimit, takeGlassesSignIn, verifyLens } from "@/server/relay";
import { HttpError, requireUser, supabaseAdmin, supabaseServer } from "@/server/supabase";

export const dynamic = "force-dynamic";

const Offer = z.object({ code: z.string().regex(/^[A-Z2-9]{6}$/) });
const Take = z.object({ code: z.string().regex(/^[A-Z2-9]{6}$/), token: z.string().min(10) });

/**
 * The signed-in phone offers its account to the glasses web app paired with it.
 * The offer is single-use and expires in two minutes; nothing is sent to the glasses yet.
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    if (!(await rateLimit(`glasses-auth:${clientKey(req)}`, 10, 60_000))) throw new HttpError(429, "Too many attempts");
    const user = await requireUser();
    if (!user.email) throw new HttpError(400, "This account has no email address");
    const { code } = await readJson(req, Offer);
    await offerGlassesSignIn(code, { id: user.id, email: user.email });
    return json({ ok: true });
  } catch (e) { return errorResponse(e); }
}

/**
 * The glasses lens collects an offer with its pairing credential. On success this response
 * carries the session cookies for the glasses browser.
 */
export async function PUT(req: Request) {
  try {
    if (!(await rateLimit(`glasses-take:${clientKey(req)}`, 40, 60_000))) throw new HttpError(429, "Too many attempts");
    const { code, token } = await readJson(req, Take);
    if (!(await verifyLens(code, token))) throw new HttpError(403, "Not the paired glasses");
    const offer = await takeGlassesSignIn(code);
    if (!offer) return json({ signedIn: false });
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email: offer.email });
    if (error || !data.properties?.hashed_token) throw new HttpError(502, "Could not start the glasses session");
    const sb = await supabaseServer();
    const verified = await sb.auth.verifyOtp({ type: "magiclink", token_hash: data.properties.hashed_token });
    if (verified.error || verified.data.user?.id !== offer.id) throw new HttpError(502, "Could not start the glasses session");
    return json({ signedIn: true, email: offer.email });
  } catch (e) { return errorResponse(e); }
}
