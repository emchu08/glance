import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "./env";

let admin: SupabaseClient | null = null;

/** Privileged client (secret key) — bypasses RLS. Every use must authorize the initiating owner/device/order explicitly. */
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    if (!env.supabaseUrl || !env.supabaseSecretKey) throw new Error("Supabase is not configured");
    admin = createClient(env.supabaseUrl, env.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

/** Cookie-backed SSR client for the current request (publishable key, RLS applies). */
export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { for (const c of list) store.set(c.name, c.value, c.options); } catch { /* read-only context (server component) */ }
      },
    },
  });
}

export interface AuthedUser { id: string; email: string | null }

export async function currentUser(): Promise<AuthedUser | null> {
  if (!env.supabaseUrl) return null;
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code; }
}

export async function requireUser(): Promise<AuthedUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Sign in required", "unauthenticated");
  return u;
}

export function makeReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "GL-";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}
