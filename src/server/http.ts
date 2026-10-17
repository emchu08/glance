import "server-only";

import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { HttpError } from "./supabase";
import { UrlError } from "./url";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) return json({ error: e.message, code: e.code ?? null }, e.status);
  if (e instanceof UrlError) return json({ error: e.message, code: "bad_url" }, 400);
  if (e instanceof z.ZodError) return json({ error: "Invalid request", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  const msg = (e as Error)?.message ?? "Unexpected error";
  console.error("[api]", msg);
  return json({ error: msg }, 500);
}

const MAX_BODY = 8_000_000;

export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, "Body too large");
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, "Body must be JSON"); }
  return schema.parse(raw);
}

/** Same-origin check for browser mutations (CSRF). Native clients send no Origin and pass. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { if (new URL(origin).host !== host) throw new HttpError(403, "Cross-origin request rejected"); } catch (e) { if (e instanceof HttpError) throw e; throw new HttpError(403, "Bad origin"); }
}

export const imageSchema = z.string().regex(/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/, "image must be a base64 data URL").max(MAX_BODY);

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
