import { NextResponse } from "next/server";
import { supabaseServer } from "@/server/supabase";

/** PKCE/OTP callback for Supabase Auth links; exchanges the code and returns to the wallet setup. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/wallet/setup";
  if (code) {
    const sb = await supabaseServer();
    await sb.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/wallet/setup", url.origin));
}
