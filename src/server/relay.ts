import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * Pairing + camera relay + handoff queue.
 * Backends: process memory (development), Upstash-compatible REST Redis (atomic), Vercel Runtime Cache (regional, non-atomic — documented limit).
 * Frames are transient (20 s TTL) and never written to durable storage.
 */
export const RELAY = { frameTtlMs: 20_000, demandTtlMs: 10_000, presenceTtlMs: 30_000, handoffTtlMs: 60 * 60_000, maxPending: 5, pairTtlMs: 30 * 60_000 } as const;
export const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface FrameRecord { image: string; width: number; height: number; capturedAt: number; uploadedAt: number }
export interface HandoffRecord { id: string; code: string; kind: string; title: string; url: string; createdAt: number; expiresAt: number; status: "queued" | "sent"; deliveredAt?: number }
export interface PairRecord { code: string; createdAt: number; lensSecret: string; phoneSecret: string | null; phoneSeenAt: number | null; demandUntil: number }

interface Backend {
  name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomically pop up to n items from a list key. */
  popAll<T>(key: string): Promise<T[]>;
  push<T>(key: string, value: T, ttlMs: number, max: number): Promise<number>;
  listLen(key: string): Promise<number>;
}

class MemoryBackend implements Backend {
  name = "memory";
  private kv = new Map<string, { v: unknown; exp: number }>();
  private lists = new Map<string, { items: unknown[]; exp: number }>();
  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.kv) if (e.exp < now) this.kv.delete(k);
    for (const [k, e] of this.lists) if (e.exp < now) this.lists.delete(k);
  }
  async get<T>(key: string) { this.sweep(); const e = this.kv.get(key); return e && e.exp >= Date.now() ? (e.v as T) : null; }
  async set<T>(key: string, value: T, ttlMs: number) { this.kv.set(key, { v: value, exp: Date.now() + ttlMs }); }
  async del(key: string) { this.kv.delete(key); this.lists.delete(key); }
  async popAll<T>(key: string) { this.sweep(); const l = this.lists.get(key); if (!l) return []; this.lists.delete(key); return l.items as T[]; }
  async push<T>(key: string, value: T, ttlMs: number, max: number) {
    this.sweep();
    const l = this.lists.get(key) ?? { items: [], exp: 0 };
    if (l.items.length >= max) return -1;
    l.items.push(value);
    l.exp = Date.now() + ttlMs;
    this.lists.set(key, l);
    return l.items.length;
  }
  async listLen(key: string) { this.sweep(); return this.lists.get(key)?.items.length ?? 0; }
}

class UpstashBackend implements Backend {
  name = "upstash";
  private url: string;
  private token: string;
  constructor(url: string, token: string) { this.url = url; this.token = token; }
  private async cmd<T = unknown>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify(args) });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const data = (await res.json()) as { result: T; error?: string };
    if (data.error) throw new Error(data.error);
    return data.result;
  }
  async get<T>(key: string) { const r = await this.cmd<string | null>("GET", key); return r ? (JSON.parse(r) as T) : null; }
  async set<T>(key: string, value: T, ttlMs: number) { await this.cmd("SET", key, JSON.stringify(value), "PX", ttlMs); }
  async del(key: string) { await this.cmd("DEL", key); }
  async popAll<T>(key: string) {
    // LRANGE + DEL inside MULTI for atomic pop-all.
    const res = await fetch(`${this.url}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" }, body: JSON.stringify([["MULTI"], ["LRANGE", key, 0, -1], ["DEL", key], ["EXEC"]]) });
    const data = (await res.json()) as { result: unknown }[];
    const exec = data[3]?.result as [string[], number] | undefined;
    return (exec?.[0] ?? []).map((s) => JSON.parse(s) as T);
  }
  async push<T>(key: string, value: T, ttlMs: number, max: number) {
    const len = await this.cmd<number>("LLEN", key);
    if (len >= max) return -1;
    const n = await this.cmd<number>("RPUSH", key, JSON.stringify(value));
    await this.cmd("PEXPIRE", key, ttlMs);
    return n;
  }
  async listLen(key: string) { return this.cmd<number>("LLEN", key); }
}

let backend: Backend | null = null;
export function relayBackend(): Backend {
  if (!backend) backend = env.upstashUrl && env.upstashToken ? new UpstashBackend(env.upstashUrl, env.upstashToken) : new MemoryBackend();
  return backend;
}

const sign = (s: string) => createHmac("sha256", env.relaySecret || "dev-relay").update(s).digest("base64url");
const secret = () => randomBytes(24).toString("base64url");

export function makeCode(): string {
  const bytes = randomBytes(6);
  let s = "";
  for (const b of bytes) s += PAIR_ALPHABET[b % PAIR_ALPHABET.length];
  return s;
}

const kPair = (c: string) => `glance:pair:${c}`;
const kFrame = (c: string) => `glance:frame:${c}`;
const kHandoffs = (c: string) => `glance:handoffs:${c}`;
const kHandoff = (id: string) => `glance:handoff:${id}`;

/** Lens creates (or refreshes) a pairing. Returns scoped lens credential. */
export async function createPairing(existing?: string): Promise<{ code: string; lensToken: string }> {
  const b = relayBackend();
  if (existing) {
    const p = await b.get<PairRecord>(kPair(existing));
    if (p) { await b.set(kPair(existing), p, RELAY.pairTtlMs); return { code: p.code, lensToken: sign(`lens:${p.code}:${p.lensSecret}`) }; }
  }
  const code = makeCode();
  const rec: PairRecord = { code, createdAt: Date.now(), lensSecret: secret(), phoneSecret: null, phoneSeenAt: null, demandUntil: 0 };
  await b.set(kPair(code), rec, RELAY.pairTtlMs);
  return { code, lensToken: sign(`lens:${code}:${rec.lensSecret}`) };
}

/** Phone joins a pairing by code; receives a scoped phone credential. Rate-limited by callers. */
export async function joinPairing(code: string): Promise<{ phoneToken: string } | null> {
  const b = relayBackend();
  const p = await b.get<PairRecord>(kPair(code));
  if (!p) return null;
  p.phoneSecret = p.phoneSecret ?? secret();
  p.phoneSeenAt = Date.now();
  await b.set(kPair(code), p, RELAY.pairTtlMs);
  return { phoneToken: sign(`phone:${code}:${p.phoneSecret}`) };
}

export async function verifyPhone(code: string, token: string | null): Promise<PairRecord | null> {
  const p = await relayBackend().get<PairRecord>(kPair(code));
  if (!p || !p.phoneSecret || !token) return null;
  return sign(`phone:${code}:${p.phoneSecret}`) === token ? p : null;
}

export async function touchPhone(code: string): Promise<void> {
  const b = relayBackend();
  const p = await b.get<PairRecord>(kPair(code));
  if (!p) return;
  p.phoneSeenAt = Date.now();
  await b.set(kPair(code), p, RELAY.pairTtlMs);
}

export async function setDemand(code: string): Promise<void> {
  const b = relayBackend();
  const p = await b.get<PairRecord>(kPair(code));
  if (!p) return;
  p.demandUntil = Date.now() + RELAY.demandTtlMs;
  await b.set(kPair(code), p, RELAY.pairTtlMs);
}

export async function putFrame(code: string, frame: Omit<FrameRecord, "uploadedAt">): Promise<void> {
  await relayBackend().set(kFrame(code), { ...frame, uploadedAt: Date.now() }, RELAY.frameTtlMs);
}

export async function getFrame(code: string): Promise<FrameRecord | null> {
  return relayBackend().get<FrameRecord>(kFrame(code));
}

export async function pairingStatus(code: string): Promise<{ phone: boolean; frameAgeMs: number | null; demand: boolean; backend: string } | null> {
  const b = relayBackend();
  const p = await b.get<PairRecord>(kPair(code));
  if (!p) return null;
  const f = await b.get<FrameRecord>(kFrame(code));
  return { phone: !!p.phoneSeenAt && Date.now() - p.phoneSeenAt < RELAY.presenceTtlMs, frameAgeMs: f ? Date.now() - f.uploadedAt : null, demand: p.demandUntil > Date.now(), backend: b.name };
}

/** Queue a handoff link (≤ 5 pending, 1 h TTL, duplicate URL/kind collapses to existing). */
export async function queueHandoff(code: string, kind: string, title: string, url: string): Promise<HandoffRecord | "full"> {
  const b = relayBackend();
  const id = randomBytes(8).toString("base64url");
  const rec: HandoffRecord = { id, code, kind, title, url, createdAt: Date.now(), expiresAt: Date.now() + RELAY.handoffTtlMs, status: "queued" };
  const n = await b.push(kHandoffs(code), rec, RELAY.handoffTtlMs, RELAY.maxPending);
  if (n < 0) return "full";
  await b.set(kHandoff(id), rec, RELAY.handoffTtlMs);
  return rec;
}

/** Phone check-in/frame upload takes pending links atomically; lens reads never consume. */
export async function takeHandoffs(code: string): Promise<HandoffRecord[]> {
  const b = relayBackend();
  const items = await b.popAll<HandoffRecord>(kHandoffs(code));
  const live = items.filter((h) => h.expiresAt > Date.now());
  for (const h of live) await b.set(kHandoff(h.id), { ...h, status: "sent", deliveredAt: Date.now() }, RELAY.handoffTtlMs);
  return live;
}

export async function handoffStatus(id: string): Promise<"queued" | "sent" | "expired"> {
  const h = await relayBackend().get<HandoffRecord>(kHandoff(id));
  if (!h) return "expired";
  if (h.status === "sent") return "sent";
  return h.expiresAt > Date.now() ? "queued" : "expired";
}

/** Simple fixed-window rate limiter keyed by caller. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const b = relayBackend();
  const k = `glance:rl:${key}:${Math.floor(Date.now() / windowMs)}`;
  const cur = (await b.get<number>(k)) ?? 0;
  if (cur >= limit) return false;
  await b.set(k, cur + 1, windowMs);
  return true;
}
