"use client";

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode,
} from "react";
import type { CaptureKind, Offer } from "@/data/types";
import { createNativeAdapter, createSampleAdapter, createWebcamAdapter, type CaptureAdapter } from "./capture";
import { moveFocus, moveLinear, reconcileFocus, type Direction } from "./navigation";
import { initialState, lensReducer } from "./reducer";
import { describeScreen, groceryQuery, isPayable, publishedActions, scanCoolingDown } from "./screens";
import { loadPersisted, savePersisted, PAIR_KEY, PHONE_CODE_KEY } from "./storage";
import * as svc from "./services";
import type { LensAction, LensEffect, LensEvent, LensState, OrderSummary } from "./types";

export interface Diagnostics {
  provider: string;
  lastLatencyMs: number | null;
  inflight: string | null;
  frames: number;
  additions: number;
  logs: string[];
  tapToFirstCardMs: number | null;
  listingTimings: { query: string; ms: number; count: number }[];
}

export interface LensContextValue {
  state: LensState;
  actions: LensAction[];
  focusId: string | null;
  dispatch: (event: LensEvent) => void;
  activate: (actionId: string) => void;
  focus: (actionId: string | null) => void;
  move: (dir: Direction) => void;
  swipe: (delta: 1 | -1) => void;
  select: () => void;
  back: () => void;
  runEffect: (effect: LensEffect) => void;
  sceneUrl: string | null;
  sceneCaption: string | null;
  /** The frame the last Glimpse scan analysed (its candidates' boxes are in this image). */
  snapshot: string | null;
  diagnostics: Diagnostics;
  interactive: boolean;
  fixture: boolean;
}

const LensContext = createContext<LensContextValue | null>(null);

export function useLens(): LensContextValue {
  const ctx = useContext(LensContext);
  if (!ctx) throw new Error("useLens must be used inside <LensProvider>");
  return ctx;
}

export interface LensProviderProps {
  children: ReactNode;
  capture?: CaptureKind;
  /** Deterministic fixture mode: effects disabled, timers disabled. */
  fixture?: boolean;
  initial?: Partial<LensState> | ((s: LensState) => LensState);
  /** A relay code to use instead of minting one (the companion app's code, from the URL). */
  pairCode?: string;
  onLog?: (line: string) => void;
}

interface CompanionCamera { ready: boolean; message?: string }
/** Present when the iPhone companion injected its bridge (before any page script ran). */
const companionBridge = () => (typeof window === "undefined" ? null : (window as unknown as { glanceCompanion?: { cameraState?: CompanionCamera } }).glanceCompanion ?? null);

const GROCERY_INTERVAL_MS = 3000;
const TOAST_MS = 2200;
const ORDER_POLL_MS = 1500;
const ORDER_POLL_MAX_MS = 90_000;

export function LensProvider({ children, capture = "sample", fixture = false, initial, pairCode, onLog }: LensProviderProps) {
  const [state, rawDispatch] = useReducer(lensReducer, undefined, () => {
    let s = initialState();
    s.capture = capture;
    if (typeof initial === "function") s = initial(s);
    else if (initial) s = { ...s, ...initial };
    return s;
  });
  const stateRef = useRef(state);
  useLayoutEffect(() => { stateRef.current = state; });

  const [diag, setDiag] = useState<Diagnostics>({ provider: "sample", lastLatencyMs: null, inflight: null, frames: 0, additions: 0, logs: [], tapToFirstCardMs: null, listingTimings: [] });
  const log = useCallback((line: string) => {
    onLog?.(line);
    setDiag((d) => ({ ...d, logs: [...d.logs.slice(-39), `${new Date().toISOString().slice(11, 19)} ${line}`] }));
  }, [onLog]);

  const dispatch = useCallback((event: LensEvent) => rawDispatch(event), []);

  // ── Capture adapter per source (memoized per capture kind; started/stopped in an effect) ──
  // Pairing codes live in a module-level registry keyed by provider instance so the native adapter
  // can read the latest code at capture time without touching React refs during render.
  const [instanceId] = useState(() => `lens-${Math.random().toString(36).slice(2)}`);
  const pairBox = useMemo(() => ({ get current() { return pairingCodes.get(instanceId) ?? null; } }), [instanceId]);
  const adapter = useMemo<CaptureAdapter>(() => {
    if (state.capture === "webcam") return createWebcamAdapter();
    if (state.capture === "native") return createNativeAdapter(pairBox);
    return createSampleAdapter();
  }, [state.capture, pairBox]);
  const adapterRef = useRef<CaptureAdapter>(adapter);
  useLayoutEffect(() => { adapterRef.current = adapter; }, [adapter]);
  useEffect(() => {
    if (state.capture !== "sample" && !fixture) {
      adapter.start().catch((e) => {
        log(`capture start failed: ${(e as Error).message}`);
        dispatch({ type: "pairing/set", status: state.capture === "webcam" ? "denied" : "waiting" });
      });
    }
    return () => adapter.stop();
  }, [adapter, state.capture, fixture, dispatch, log]);

  // Pairing code (native source): the companion's code when given, else restore or mint; register with the relay.
  useEffect(() => {
    if (fixture || state.capture !== "native") return;
    let cancelled = false;
    // Inside the companion, frames arrive locally, so the status shown is the glasses camera's, not the relay's.
    const companion = companionBridge();
    const showCamera = (c: CompanionCamera | undefined) => dispatch({ type: "pairing/set", status: c?.ready ? "connected" : "awaiting-camera" });
    const onCamera = (e: Event) => showCamera((e as CustomEvent<CompanionCamera>).detail);
    if (companion) {
      showCamera(companion.cameraState);
      window.addEventListener("glance:camera", onCamera);
    }
    (async () => {
      try {
        // The glasses web app keeps the phone's code, so a launch that loses the URL's ?pair= still finds the phone.
        if (pairCode && !companion) localStorage.setItem(PHONE_CODE_KEY, pairCode);
        const phoneCode = pairCode ?? (companion ? null : localStorage.getItem(PHONE_CODE_KEY));
        const stored = JSON.parse(localStorage.getItem(PAIR_KEY) ?? "null") as { code: string; at: number } | null;
        const body = phoneCode ? { code: phoneCode, claim: true } : stored && Date.now() - stored.at < 5 * 60_000 ? { code: stored.code } : {};
        const res = await fetch("/api/relay/pair", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = (await res.json()) as { code: string; token: string };
        if (cancelled) return;
        pairingCodes.set(instanceId, data.code);
        pairingTokens.set(instanceId, data.token);
        if (!phoneCode) localStorage.setItem(PAIR_KEY, JSON.stringify({ code: data.code, at: Date.now() }));
        if (companion) dispatch({ type: "pairing/set", status: stateRef.current.pairing.status, code: data.code });
        else dispatch({ type: "pairing/set", status: "waiting", code: data.code });
      } catch (e) {
        if (!cancelled) dispatch({ type: "pairing/set", status: "unavailable" });
        log(`pairing failed: ${(e as Error).message}`);
      }
    })();
    const poll = setInterval(async () => {
      if (!pairBox.current || companion) return;
      try {
        const r = await fetch(`/api/relay/status?code=${pairBox.current}&role=lens`, { cache: "no-store" });
        const s = (await r.json()) as { phone: boolean; frameAgeMs: number | null };
        const status = !s.phone ? "waiting" : s.frameAgeMs === null ? "awaiting-camera" : s.frameAgeMs > 8000 ? "stale" : "connected";
        if (stateRef.current.pairing.status !== status) dispatch({ type: "pairing/set", status });
      } catch { /* keep last status */ }
    }, 2500);
    return () => { cancelled = true; clearInterval(poll); window.removeEventListener("glance:camera", onCamera); };
  }, [state.capture, fixture, dispatch, log, instanceId, pairBox, pairCode]);

  // Glasses web app: its browser has its own cookies, so the paired, signed-in phone hands over the account.
  const walletStatus = state.wallet.status;
  useEffect(() => {
    if (fixture || state.capture !== "native" || !pairCode || companionBridge() || walletStatus !== "signed-out") return;
    let stop = false;
    const tick = async () => {
      const token = pairingTokens.get(instanceId);
      if (stop || !token) return;
      try {
        const res = await fetch("/api/auth/glasses", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: pairCode, token }), credentials: "same-origin" });
        const data = (await res.json()) as { signedIn?: boolean };
        if (!stop && data.signedIn) { log("signed in from the phone"); dispatch({ type: "wallet/set", wallet: { status: "unknown" } }); }
      } catch { /* try again on the next tick */ }
    };
    const id = setInterval(tick, 3000);
    tick();
    return () => { stop = true; clearInterval(id); };
  }, [fixture, state.capture, pairCode, walletStatus, instanceId, dispatch, log]);

  // ── Persistence (saved offers, recipes, list only) ─────────────────────────
  const hydrated = useRef(false);
  useEffect(() => {
    if (fixture || hydrated.current) return;
    hydrated.current = true;
    const p = loadPersisted();
    if (p) rawDispatch({ type: "hydrate", saved: p.saved, recipes: p.recipes, list: p.list });
  }, [fixture]);
  const effectiveState = state;

  useEffect(() => {
    if (fixture || !hydrated.current) return;
    savePersisted({ saved: effectiveState.glimpse.saved, recipes: effectiveState.gourmet.saved, list: effectiveState.list });
  }, [effectiveState.glimpse.saved, effectiveState.gourmet.saved, effectiveState.list, fixture]);

  // ── Reduced motion ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Mirroring sends still snapshots, so a spring caught mid-flight would stay on the display; the companion's lens
    // never animates. The glasses web app renders itself and keeps its motion.
    const native = capture === "native" && !!companionBridge();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    dispatch({ type: "init", reducedMotion: native || mq.matches });
    const h = () => dispatch({ type: "init", reducedMotion: native || mq.matches });
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [dispatch, capture]);

  // ── Toast auto-clear ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!effectiveState.toast) return;
    const t = setTimeout(() => dispatch({ type: "toast", text: null }), TOAST_MS);
    return () => clearTimeout(t);
  }, [effectiveState.toast, dispatch]);
  useEffect(() => {
    if (!effectiveState.grocery.acknowledgement) return;
    const t = setTimeout(() => dispatch({ type: "grocery/clear-ack" }), TOAST_MS);
    return () => clearTimeout(t);
  }, [effectiveState.grocery.acknowledgement, dispatch]);

  // ── Visibility: pause analysis while hidden ───────────────────────────────
  const visible = useRef(true);
  useEffect(() => {
    const h = () => { visible.current = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────
  const aborts = useRef(new Map<string, AbortController>());
  const begin = (key: string) => {
    aborts.current.get(key)?.abort();
    const c = new AbortController();
    aborts.current.set(key, c);
    return c;
  };
  const lastNativeFrameAt = useRef(0);
  const lastFrame = useRef<svc.Frame | null>(null);
  /** Waits out the scan cooldown that follows an add to cart (at most two seconds). */
  const coolDown = useCallback(async () => {
    const wait = (stateRef.current.scanCooldownUntil ?? 0) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  }, []);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const purchaseInFlight = useRef<string | null>(null);

  const runEffect = useCallback((effect: LensEffect) => {
    if (fixture) return; // fixture views never create network/payment objects
    const s = stateRef.current;
    const session = s.session;
    const adapter = adapterRef.current;
    const stillCurrent = () => stateRef.current.session === session;
    const timed = async <T,>(label: string, fn: () => Promise<T>) => {
      const t0 = performance.now();
      setDiag((d) => ({ ...d, inflight: label }));
      try { return await fn(); } finally {
        const ms = Math.round(performance.now() - t0);
        setDiag((d) => ({ ...d, inflight: null, lastLatencyMs: ms }));
        log(`${label} ${ms}ms`);
      }
    };

    switch (effect.kind) {
      case "glimpse-scan": {
        const scanId = s.glimpse.scanId + 1;
        dispatch({ type: "glimpse/scan-start", scanId });
        const c = begin("glimpse");
        (async () => {
          try {
            await coolDown();
            if (c.signal.aborted) return;
            const frame = await adapter.capture("glimpse", s.glimpse.frameIndex, { fresh: true, after: lastNativeFrameAt.current });
            if (frame.origin === "native") lastNativeFrameAt.current = frame.capturedAt;
            lastFrame.current = frame;
            const r = await timed("glimpse", () => svc.recognizeGlimpse(frame, s.glimpse.seenWindow, c.signal));
            if (!stillCurrent() || c.signal.aborted) return;
            setSnapshot(frame.dataUrl ?? null);
            dispatch({ type: "glimpse/scan-result", scanId, candidates: r.ranked, frameIndex: (s.glimpse.frameIndex + 1) % 3 });
          } catch (e) {
            if (c.signal.aborted) return;
            dispatch({ type: "glimpse/scan-error", scanId, error: (e as Error).message || "Scan failed" });
          }
        })();
        break;
      }
      case "glimpse-offers": {
        const cand = s.glimpse.candidates.find((x) => x.id === effect.candidateId) ?? s.glimpse.candidates[0];
        if (!cand) break;
        const c = begin("offers");
        const t0 = performance.now();
        (async () => {
          try {
            let first = true;
            await timed("offers", () => svc.fetchOffers({ id: cand.id, label: cand.label }, s.capture, (offers, done, replace) => {
              if (!stillCurrent() || c.signal.aborted) return;
              if (first && offers.length) { first = false; setDiag((d) => ({ ...d, tapToFirstCardMs: Math.round(performance.now() - t0) })); }
              dispatch({ type: "glimpse/offers-result", query: cand.label, offers, done, replace });
            }, c.signal));
          } catch (e) {
            if (c.signal.aborted) return;
            dispatch({ type: "glimpse/offers-error", query: cand.label, error: (e as Error).message });
          }
        })();
        break;
      }
      case "gourmet-scan": {
        const scanId = s.gourmet.scanId + 1;
        dispatch({ type: "gourmet/scan-start", scanId });
        const c = begin("gourmet");
        (async () => {
          try {
            await coolDown();
            if (c.signal.aborted) return;
            const frame = await adapter.capture("gourmet", 0, { fresh: true, after: lastNativeFrameAt.current });
            if (frame.origin === "native") lastNativeFrameAt.current = frame.capturedAt;
            lastFrame.current = frame;
            const r = await timed("dish", () => svc.recognizeDish(frame, c.signal));
            if (!stillCurrent() || c.signal.aborted) return;
            dispatch({ type: "gourmet/scan-result", scanId, isFood: r.isFood, hypotheses: r.hypotheses });
          } catch (e) {
            if (c.signal.aborted) return;
            dispatch({ type: "gourmet/scan-error", scanId, error: (e as Error).message || "Scan failed" });
          }
        })();
        break;
      }
      case "gourmet-recipes": {
        const c = begin("recipes");
        dispatch({ type: "gourmet/recipes-loading" });
        (async () => {
          try {
            const recipes = await timed("recipes", () => svc.fetchRecipes(effect.dish, s.capture, lastFrame.current?.dataUrl ?? null, c.signal));
            if (!stillCurrent() || c.signal.aborted) return;
            dispatch({ type: "gourmet/recipes-result", dish: effect.dish, recipes });
          } catch (e) {
            if (c.signal.aborted) return;
            dispatch({ type: "gourmet/recipes-error", error: (e as Error).message });
          }
        })();
        break;
      }
      case "grocery-insight": {
        const cur = s.grocery.insights[effect.productKey];
        if (cur && (cur.status === "loading" || cur.status === "ready")) break; // once per item
        dispatch({ type: "grocery/insight", productKey: effect.productKey, status: "loading" });
        const c = begin(`insight:${effect.productKey}`);
        (async () => {
          try {
            const data = await timed("insight", () => svc.fetchInsight(effect.productKey, effect.label, effect.packageSize, s.capture, lastFrame.current?.dataUrl ?? null, c.signal));
            if (!stillCurrent()) return;
            dispatch({ type: "grocery/insight", productKey: effect.productKey, status: data ? "ready" : "empty", data });
          } catch {
            if (c.signal.aborted) return;
            dispatch({ type: "grocery/insight", productKey: effect.productKey, status: "error", data: null });
          }
        })();
        break;
      }
      case "grocery-online": {
        // Live prices for a held item: the same grounded listing search, kept per item.
        if (s.capture === "sample" || s.grocery.online?.[effect.productKey]) break;
        dispatch({ type: "grocery/online", productKey: effect.productKey, status: "loading", offers: [] });
        const c = begin(`online:${effect.productKey}`);
        svc.searchListings(effect.query, (offers, done, replace) => {
          if (!stillCurrent() || c.signal.aborted) return;
          const prev = stateRef.current.grocery.online?.[effect.productKey]?.offers ?? [];
          const merged = replace ? offers : [...prev.filter((o) => !offers.some((n) => n.id === o.id)), ...offers];
          dispatch({ type: "grocery/online", productKey: effect.productKey, status: done ? (merged.length ? "ready" : "empty") : "loading", offers: merged });
        }, c.signal).catch(() => {
          if (!c.signal.aborted) dispatch({ type: "grocery/online", productKey: effect.productKey, status: "error", offers: stateRef.current.grocery.online?.[effect.productKey]?.offers ?? [] });
        });
        break;
      }
      case "grocery-exit":
        break; // the reducer computes the summary locally; /api/glance/grocery/exit exposes the same math
      case "listings-search": {
        const q = effect.query.trim();
        if (!q) break;
        const c = begin("listings");
        const t0 = performance.now();
        let count = 0;
        svc.searchListings(q, (offers, done, replace) => {
          if (!stillCurrent() || c.signal.aborted) return;
          count = replace ? offers.length : count + offers.length;
          dispatch({ type: "listings/result", query: q, offers, done, replace });
          if (done) setDiag((d) => ({ ...d, listingTimings: [...d.listingTimings.slice(-9), { query: q, ms: Math.round(performance.now() - t0), count }] }));
        }, c.signal).catch((e) => {
          if (c.signal.aborted) return;
          dispatch({ type: "listings/error", query: q, error: (e as Error).message });
        });
        break;
      }
      case "handoff": {
        const absolute = effect.url.startsWith("/") ? `${window.location.origin}${effect.url}` : effect.url;
        const code = pairBox.current;
        if (!code && s.capture !== "native") {
          // Desktop/phone preview: open directly; label honestly.
          window.open(absolute, "_blank", "noopener,noreferrer");
          dispatch({ type: "handoff/set", status: "sent", kind: effect.handoffKind, title: effect.title, url: absolute });
          break;
        }
        dispatch({ type: "handoff/set", status: "sending", kind: effect.handoffKind, title: effect.title, url: absolute });
        const c = begin("handoff");
        (async () => {
          const attempt = async () => svc.sendHandoff(code, effect.handoffKind, effect.title, absolute, c.signal);
          let res: Awaited<ReturnType<typeof attempt>>;
          try { res = await attempt(); } catch {
            await new Promise((r) => setTimeout(r, 800));
            try { res = await attempt(); } catch (e) { if (!c.signal.aborted) dispatch({ type: "handoff/set", status: "failed", error: (e as Error).message }); return; }
          }
          if (c.signal.aborted) return;
          if (res.status === "sent") { dispatch({ type: "handoff/set", status: "sent" }); return; }
          dispatch({ type: "handoff/set", status: "queued" });
          const deadline = Date.now() + 10_000;
          while (Date.now() < deadline && !c.signal.aborted) {
            await new Promise((r) => setTimeout(r, 1200));
            try {
              const p = await svc.pollHandoff(res.id, c.signal);
              if (p.status === "sent") { dispatch({ type: "handoff/set", status: "sent" }); return; }
              if (p.status === "expired") { dispatch({ type: "handoff/set", status: "failed", error: "Link expired before pickup" }); return; }
            } catch { /* keep polling */ }
          }
        })();
        break;
      }
      case "open-url":
        window.open(effect.url, "_blank", "noopener,noreferrer");
        break;
      case "wallet-refresh": {
        const c = begin("wallet");
        svc.getWallet(c.signal).then((w) => { if (stillCurrent()) dispatch({ type: "wallet/set", wallet: w }); }).catch((e: svc.ServiceError) => {
          if (c.signal.aborted) return;
          dispatch({ type: "wallet/set", wallet: { status: e.status === 401 ? "signed-out" : "unknown" } });
        });
        break;
      }
      case "orders-refresh": {
        const c = begin("orders");
        svc.getOrders(c.signal).then((orders) => dispatch({ type: "wallet/set", wallet: { orders } })).catch(() => {});
        break;
      }
      case "wallet-pause-rule": {
        svc.pauseRule(effect.pause).then((w) => dispatch({ type: "wallet/set", wallet: w })).catch((e) => dispatch({ type: "toast", text: (e as Error).message }));
        break;
      }
      case "locate": {
        if (!navigator.geolocation) { dispatch({ type: "toast", text: "Location unavailable" }); break; }
        navigator.geolocation.getCurrentPosition(
          (pos) => dispatch({ type: "location/set", lat: pos.coords.latitude, lng: pos.coords.longitude, label: "Your location", source: "device" }),
          () => dispatch({ type: "toast", text: "Location permission denied" }),
          { timeout: 8000 },
        );
        break;
      }
      case "quote": {
        const offer = findOffer(s, effect.offerId);
        if (!isPayable(offer)) break;
        const c = begin("quote");
        timed("quote", () => svc.requestQuote(offer, 1, c.signal))
          .then((quote) => { if (stillCurrent() && !c.signal.aborted) dispatch({ type: "payment/quote", offerId: offer.id, quote }); })
          .catch((e: svc.ServiceError) => {
            if (c.signal.aborted) return;
            if (e.status === 401) { dispatch({ type: "wallet/set", wallet: { status: "signed-out" } }); dispatch({ type: "payment/clear" }); dispatch({ type: "nav/push", screen: { id: "wallet" } }); return; }
            dispatch({ type: "payment/status", status: "error", error: e.message });
          });
        break;
      }
      case "purchase":
      case "retry-purchase": {
        // The Buy action dispatched payment/submit synchronously; the reducer state lands on the next render,
        // so read the quote from the pre-dispatch snapshot and guard re-entry with the attempt key.
        const p = s.payment;
        const offer = findOffer(s, p.offerId ?? "");
        if (!p.quote || !isPayable(offer) || (p.status !== "ready" && p.status !== "error" && p.status !== "pending")) break;
        const attemptKey = `${p.quote.version}:${session}`;
        if (purchaseInFlight.current === attemptKey) break;
        purchaseInFlight.current = attemptKey;
        const c = begin("purchase");
        (async () => {
          try {
            const { orderId } = await timed("order", () => svc.createOrder(p.quote!, offer, s.mode, c.signal));
            dispatch({ type: "payment/status", status: "pending", orderId });
            const res = await timed("purchase", () => svc.purchase(orderId, attemptKey, c.signal));
            if (offer.sponsored) svc.recordAdClick(offer.sponsored.attributionToken);
            applyOrder(res.order);
            if (res.status === "requires_action") return;
            // Poll until payment and fulfillment settle (Realtime is additive; polling is the bounded fallback).
            const deadline = Date.now() + ORDER_POLL_MAX_MS;
            while (Date.now() < deadline) {
              const o = await svc.getOrder(orderId, c.signal);
              applyOrder(o);
              if (["accepted", "failed", "canceled", "refunded"].includes(o.fulfillmentStatus) || ["failed", "canceled"].includes(o.paymentStatus)) return;
              if (o.paymentStatus === "succeeded" && o.fulfillmentStatus === "accepted") return;
              await new Promise((r) => setTimeout(r, ORDER_POLL_MS));
            }
          } catch (e) {
            if (c.signal.aborted) return;
            const err = e as svc.ServiceError;
            dispatch({ type: "payment/status", status: err.status === 409 ? "recovery" : "error", error: err.message || "Payment failed" });
          } finally {
            purchaseInFlight.current = null;
          }
        })();
        break;
      }
      case "persist":
        break; // persistence is reactive
      case "sample-grocery-bought":
        dispatch({ type: "grocery/bought", retailer: effect.retailer, name: effect.name, priceCents: effect.priceCents, url: effect.url });
        break;
    }

    function applyOrder(o: OrderSummary) {
      const status = o.paymentStatus === "requires_action" ? "needs-action"
        : o.paymentStatus === "failed" || o.paymentStatus === "canceled" ? "error"
        : o.fulfillmentStatus === "accepted" ? "accepted"
        : o.paymentStatus === "succeeded" ? "confirmed"
        : "pending";
      dispatch({ type: "payment/status", status, orderId: o.id, order: o, error: status === "error" ? "Card declined" : undefined });
    }
  }, [dispatch, fixture, log, coolDown]);

  // ── Grocery sampler: 3 s, single in-flight, drops busy ticks ──────────────
  const groceryBusy = useRef(false);
  useEffect(() => {
    if (fixture || effectiveState.mode !== "grocery" || !effectiveState.grocery.scanning) return;
    const session = effectiveState.session;
    let cancelled = false;
    const tick = async () => {
      // Just added something: skip scans for two seconds so it doesn't pop straight back up.
      if (cancelled || groceryBusy.current || !visible.current || scanCoolingDown(stateRef.current, Date.now())) return;
      groceryBusy.current = true;
      const s = stateRef.current;
      const c = begin("grocery");
      try {
        const frame = await adapterRef.current.capture("grocery", s.grocery.frameIndex);
        lastFrame.current = frame;
        const t0 = performance.now();
        const r = await svc.recognizeGroceryFrame(frame, s.grocery.cart.map((l) => l.label), c.signal);
        setDiag((d) => ({ ...d, frames: d.frames + 1, lastLatencyMs: Math.round(performance.now() - t0) }));
        if (cancelled || stateRef.current.session !== session) return;
        // A frame taken before an add would still show the item in hand: drop it.
        if (scanCoolingDown(stateRef.current, Date.now())) return;
        const before = stateRef.current.grocery.cart.reduce((n, l) => n + l.quantity, 0);
        dispatch({ type: "grocery/frame", observations: r.observations, frameIndex: s.grocery.frameIndex + 1 });
        queueMicrotask(() => {
          const after = stateRef.current.grocery.cart.reduce((n, l) => n + l.quantity, 0);
          if (after > before) setDiag((d) => ({ ...d, additions: d.additions + (after - before) }));
        });
      } catch (e) {
        if (!cancelled) log(`grocery frame failed: ${(e as Error).message}`);
      } finally {
        groceryBusy.current = false;
      }
    };
    tick();
    const id = setInterval(tick, GROCERY_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [fixture, effectiveState.mode, effectiveState.grocery.scanning, effectiveState.session, dispatch, log]);

  // Held-item card: request insight once per item.
  useEffect(() => {
    if (effectiveState.screen.id !== "grocery-item" && effectiveState.screen.id !== "grocery-compare") return;
    const key = String(effectiveState.screen.params?.productKey ?? "");
    if (!key) return;
    runEffect({ kind: "grocery-insight", productKey: key, label: effectiveState.grocery.heldLabel ?? key, packageSize: effectiveState.grocery.heldSize });
    runEffect({ kind: "grocery-online", productKey: key, query: groceryQuery(stateRef.current, key) });
  }, [effectiveState.screen, effectiveState.grocery.heldLabel, effectiveState.grocery.heldSize, runEffect]);

  // Wallet status as soon as the lens opens.
  useEffect(() => {
    if (fixture || effectiveState.wallet.status !== "unknown") return;
    runEffect({ kind: "wallet-refresh" });
  }, [fixture, effectiveState.wallet.status, runEffect]);

  // Auto-quote eligible offers when they become visible (so Buy $X shows the server total).
  useEffect(() => {
    if (fixture) return;
    const offer = currentOfferOf(effectiveState);
    if (!isPayable(offer) || effectiveState.wallet.status !== "ready") return;
    const p = effectiveState.payment;
    if (p.offerId === offer.id && p.status !== "idle") return;
    if (p.status !== "idle" && p.status !== "ready" && p.status !== "quoting") return;
    dispatch({ type: "payment/quoting", offerId: offer.id, originMode: effectiveState.mode });
    runEffect({ kind: "quote", offerId: offer.id });
  }, [fixture, effectiveState, dispatch, runEffect]);

  // ── Actions & focus ────────────────────────────────────────────────────────
  const actions = useMemo(() => describeScreen(effectiveState), [effectiveState]);
  const focusId = useMemo(() => reconcileFocus(actions, effectiveState.focusId), [actions, effectiveState.focusId]);

  const activate = useCallback((actionId: string) => {
    const a = describeScreen(stateRef.current).find((x) => x.id === actionId);
    if (!a || a.disabled) return;
    for (const e of a.events) dispatch(e);
    if (a.effect) runEffect(a.effect);
  }, [dispatch, runEffect]);

  const focus = useCallback((id: string | null) => {
    const a = id ? describeScreen(stateRef.current).find((x) => x.id === id) : null;
    dispatch({ type: "focus/set", id, listIndex: a?.listIndex });
  }, [dispatch]);

  const move = useCallback((dir: Direction) => {
    const acts = describeScreen(stateRef.current);
    const cur = reconcileFocus(acts, stateRef.current.focusId);
    focus(moveFocus(acts, cur, dir));
  }, [focus]);

  const swipe = useCallback((delta: 1 | -1) => {
    const acts = describeScreen(stateRef.current);
    const cur = reconcileFocus(acts, stateRef.current.focusId);
    focus(moveLinear(acts, cur, delta));
  }, [focus]);

  const select = useCallback(() => {
    const acts = describeScreen(stateRef.current);
    const cur = reconcileFocus(acts, stateRef.current.focusId);
    if (cur) activate(cur);
  }, [activate]);

  // Back does what the top bar's Back does (at a mode's root that's the picker).
  const back = useCallback(() => (actions.some((a) => a.id === "hdr-back") ? activate("hdr-back") : dispatch({ type: "nav/back" })), [actions, activate, dispatch]);

  const sceneIndex = effectiveState.mode === "grocery" ? Math.max(0, effectiveState.grocery.frameIndex - 1) : effectiveState.mode === "glimpse" ? Math.max(0, effectiveState.glimpse.frameIndex - 1) : 0;
  const sceneUrl = adapter.sceneUrl(effectiveState.mode, sceneIndex);
  const sceneCaption = adapter.caption(effectiveState.mode, sceneIndex);

  const diagnostics = useMemo(() => ({ ...diag, provider: effectiveState.capture === "sample" ? "sample" : "claude" }), [diag, effectiveState.capture]);
  const value = useMemo<LensContextValue>(() => ({
    state: effectiveState, actions, focusId, dispatch, activate, focus, move, swipe, select, back, runEffect, sceneUrl, sceneCaption, snapshot, diagnostics, interactive: !fixture, fixture,
  }), [effectiveState, actions, focusId, dispatch, activate, focus, move, swipe, select, back, runEffect, sceneUrl, sceneCaption, snapshot, diagnostics, fixture]);

  return <LensContext.Provider value={value}>{children}</LensContext.Provider>;
}

function findOffer(s: LensState, id: string): Offer | null {
  return s.glimpse.offers.find((o) => o.id === id) ?? s.listings.offers.find((o) => o.id === id) ?? s.glimpse.saved.find((o) => o.id === id) ?? null;
}

function currentOfferOf(s: LensState): Offer | null {
  if (s.screen.id === "glimpse-offers") return s.glimpse.offers.find((o) => o.id === s.glimpse.offerId) ?? null;
  if (s.screen.id === "online-listings") return s.listings.offers.find((o) => o.id === s.listings.offerId) ?? null;
  if (s.screen.id === "glimpse-cart-item") return s.glimpse.saved.find((o) => o.id === (s.screen.params?.offerId ?? s.glimpse.offerId)) ?? null;
  return null;
}

/**
 * Keyboard + native bridge binding. Mount once per interactive lens.
 * Arrow keys move, Enter selects, Escape goes back. Real inputs keep their own keys.
 */
export function useLensInput(enabled = true) {
  const lens = useLens();
  const { move, select, back, swipe, activate, focus, actions, state } = lens;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      switch (e.key) {
        case "ArrowUp": e.preventDefault(); move("up"); break;
        case "ArrowDown": e.preventDefault(); move("down"); break;
        case "ArrowLeft": e.preventDefault(); move("left"); break;
        case "ArrowRight": e.preventDefault(); move("right"); break;
        case "Tab": e.preventDefault(); swipe(e.shiftKey ? -1 : 1); break;
        case "Enter": case " ": e.preventDefault(); select(); break;
        case "Escape": case "Backspace": e.preventDefault(); back(); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, move, select, back, swipe]);

  // Native bridge: publish state after DOM updates; expose selection API.
  useLayoutEffect(() => {
    if (!enabled) return;
    const w = window as unknown as { glanceBridge?: unknown; webkit?: { messageHandlers?: { glance?: { postMessage: (m: unknown) => void } } } };
    const instance = bridgeInstance;
    const api = {
      instance,
      version: 1,
      move: (dir: Direction) => move(dir),
      swipe: (d: 1 | -1) => swipe(d),
      activate: (id: string, revision?: number) => { if (revision === undefined || revision === state.revision) activate(id); },
      select: () => select(),
      selectDisplayed: (id: string | null) => { if (id) activate(id); else select(); },
      setActive: (id: string) => focus(id),
      back: () => back(),
      tap: (x: number, y: number, revision?: number) => {
        if (revision !== undefined && revision !== state.revision) return false;
        const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-action-id]");
        if (!el) return false;
        activate(el.dataset.actionId!);
        return true;
      },
      canSnapshot: () => document.readyState === "complete" && !document.querySelector("img[data-pending]"),
      getState: () => publish(),
    };
    const publish = () => {
      const rects = Array.from(document.querySelectorAll<HTMLElement>("[data-action-id]")).map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.dataset.actionId!, x: r.left, y: r.top, width: r.width, height: r.height };
      });
      const payload = {
        type: "state", instance, version: 1, revision: state.revision, screen: state.screen.id, params: state.screen.params ?? {},
        active: lens.focusId,
        actions: publishedActions(actions, rects),
        field: state.composer ? { id: state.composer.field, value: state.composer.value } : null,
      };
      w.webkit?.messageHandlers?.glance?.postMessage(payload);
      return payload;
    };
    w.glanceBridge = api;
    const raf = requestAnimationFrame(() => publish());
    return () => cancelAnimationFrame(raf);
  }, [enabled, actions, state.revision, state.screen, state.composer, lens.focusId, move, swipe, activate, select, focus, back]);
}

const pairingCodes = new Map<string, string | null>();
const pairingTokens = new Map<string, string>();

const bridgeInstance = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `lens-${Date.now()}`;
