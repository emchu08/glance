import "server-only";

import { relayBackend } from "./relay";

/**
 * Short-lived answer cache on the relay backend (Upstash in production, memory in development).
 * Only model answers that depend on the product, not the shopper, belong here.
 */
export const CACHE_TTL = { insightMs: 24 * 60 * 60_000, listingsMs: 6 * 60 * 60_000 } as const;

const keyFor = (scope: string, parts: (string | null | undefined)[]) =>
  `glance:cache:${scope}:${parts.map((p) => (p ?? "").trim().toLowerCase().replace(/\s+/g, " ")).join("|")}`.slice(0, 300);

export async function readCache<T>(scope: string, parts: (string | null | undefined)[]): Promise<T | null> {
  try { return await relayBackend().get<T>(keyFor(scope, parts)); } catch { return null; }
}

export async function writeCache<T>(scope: string, parts: (string | null | undefined)[], value: T, ttlMs: number): Promise<void> {
  try { await relayBackend().set(keyFor(scope, parts), value, ttlMs); } catch { /* a cache miss is never an error */ }
}
