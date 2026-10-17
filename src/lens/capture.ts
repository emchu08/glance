"use client";

import { STREET_FRAME_CAPTIONS } from "@/data/glimpse";
import type { CaptureKind, Mode } from "@/data/types";
import { SAMPLE_SCENES, sampleGroceryFrame } from "@/domain/sample";
import type { Frame } from "./services";

/**
 * Capture adapters are independent from recognition providers.
 *  - sample: deterministic local scene photos per mode/frame
 *  - webcam: getUserMedia → downscaled raw JPEG (max 768px)
 *  - native: server relay (companion uploads), polled for fresh frames
 * HUD text, overlays, and WKWebView snapshots are never sent to the vision model.
 */

export interface CaptureAdapter {
  kind: CaptureKind;
  start(): Promise<void>;
  stop(): void;
  /** Resolve the latest raw frame; `fresh` requires an upload newer than `after` (native). */
  capture(mode: Mode, index: number, opts?: { fresh?: boolean; after?: number }): Promise<Frame>;
  sceneUrl(mode: Mode, index: number): string | null;
  caption(mode: Mode, index: number): string | null;
  status(): "idle" | "ready" | "denied" | "unavailable" | "stale";
}

export const MAX_FRAME_PX = 768;

export function createSampleAdapter(): CaptureAdapter {
  return {
    kind: "sample",
    async start() {},
    stop() {},
    async capture(mode, index) {
      return { dataUrl: null, width: 1600, height: 1200, index, origin: "sample", capturedAt: Date.now() };
    },
    sceneUrl(mode, index) {
      if (mode === "glimpse") return SAMPLE_SCENES.street;
      if (mode === "gourmet") return SAMPLE_SCENES.meal;
      return SAMPLE_SCENES[sampleGroceryFrame(index).scene];
    },
    caption(mode, index) {
      if (mode === "glimpse") return STREET_FRAME_CAPTIONS[index % STREET_FRAME_CAPTIONS.length];
      if (mode === "gourmet") return "Alfredo plate · sample photo";
      return sampleGroceryFrame(index).caption;
    },
    status: () => "ready",
  };
}

export function createWebcamAdapter(getDeviceId?: () => string | undefined): CaptureAdapter {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let state: ReturnType<CaptureAdapter["status"]> = "idle";
  let lastUrl: string | null = null;
  return {
    kind: "webcam",
    async start() {
      if (stream) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: getDeviceId?.(), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        await video.play();
        state = "ready";
      } catch (e) {
        state = (e as DOMException)?.name === "NotAllowedError" ? "denied" : "unavailable";
        throw e;
      }
    },
    stop() {
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      video = null;
      state = "idle";
    },
    async capture(_mode, index) {
      if (!video || video.readyState < 2) throw new Error("Camera not ready");
      const scale = Math.min(1, MAX_FRAME_PX / Math.max(video.videoWidth, video.videoHeight));
      const w = Math.round(video.videoWidth * scale);
      const h = Math.round(video.videoHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(video, 0, 0, w, h);
      lastUrl = canvas.toDataURL("image/jpeg", 0.82);
      return { dataUrl: lastUrl, width: w, height: h, index, origin: "webcam", capturedAt: Date.now() };
    },
    sceneUrl: () => lastUrl,
    caption: () => "Live camera · explicit scan only",
    status: () => state,
  };
}

export const RELAY = { frameTtlMs: 20_000, demandTtlMs: 10_000, presenceTtlMs: 30_000, staleThresholdMs: 8_000 };

export function createNativeAdapter(codeRef: { current: string | null }): CaptureAdapter {
  let state: ReturnType<CaptureAdapter["status"]> = "idle";
  let lastUrl: string | null = null;
  let lastAt = 0;
  return {
    kind: "native",
    async start() { state = "ready"; },
    stop() { state = "idle"; },
    async capture(_mode, index, opts) {
      const code = codeRef.current;
      if (!code) throw new Error("Not paired");
      const deadline = Date.now() + 12_000;
      for (;;) {
        const res = await fetch(`/api/relay/frame?code=${encodeURIComponent(code)}&demand=1`, { cache: "no-store" });
        if (res.status === 204 || !res.ok) {
          if (Date.now() > deadline) { state = "stale"; throw new Error("No fresh frame from your phone"); }
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        const body = (await res.json()) as { image: string; width: number; height: number; capturedAt: number };
        if (opts?.fresh && opts.after && body.capturedAt <= opts.after) {
          if (Date.now() > deadline) { state = "stale"; throw new Error("Waiting for a new photo from your phone"); }
          await new Promise((r) => setTimeout(r, 700));
          continue;
        }
        lastUrl = body.image;
        lastAt = body.capturedAt;
        state = Date.now() - lastAt > RELAY.staleThresholdMs ? "stale" : "ready";
        return { dataUrl: body.image, width: body.width, height: body.height, index, origin: "native", capturedAt: body.capturedAt };
      }
    },
    sceneUrl: () => lastUrl,
    caption: () => (lastAt ? `Glasses camera · ${Math.round((Date.now() - lastAt) / 1000)}s ago` : "Glasses camera · waiting for phone"),
    status: () => state,
  };
}

/** 16×16 grayscale signature for still-frame reuse (threshold 6, ≤ 3 reuses, 10 s). */
export function frameSignature(canvas: HTMLCanvasElement): Uint8Array {
  const small = document.createElement("canvas");
  small.width = 16;
  small.height = 16;
  const ctx = small.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, 16, 16);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  const out = new Uint8Array(256);
  for (let i = 0; i < 256; i += 1) out[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  return out;
}

export function signatureDistance(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
