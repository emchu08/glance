"use client";

import type { Tone } from "./cues";

/**
 * Lens sounds: short tones made with Web Audio (no files to load), never speech. Web Audio on the glasses is
 * not documented, so every call fails silently and the screen always carries the same information.
 */

const SOUND_KEY = "glance:sound";

/** [frequency Hz, start s, length s] per note. */
const NOTES: Record<Tone, [number, number, number][]> = {
  found: [[880, 0, 0.09], [1320, 0.08, 0.14]],
  added: [[660, 0, 0.1]],
  paid: [[784, 0, 0.1], [988, 0.09, 0.1], [1319, 0.18, 0.26]],
  sent: [[1568, 0, 0.12]],
  error: [[247, 0, 0.16], [196, 0.15, 0.24]],
};

let ctx: AudioContext | null = null;

function enabled(): boolean {
  try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; }
}

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
  if (!Ctor) return null;
  try { ctx = new Ctor(); } catch { return null; }
  return ctx;
}

/** Browsers start audio only after a press; call from a pointer/key handler. */
export function unlockAudio(): void {
  const c = audio();
  if (c?.state === "suspended") c.resume().catch(() => {});
}

export function playTone(tone: Tone): void {
  if (!enabled()) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const t0 = c.currentTime + 0.01;
  for (const [freq, start, len] of NOTES[tone]) {
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = tone === "error" ? "triangle" : "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + start);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + len);
      osc.connect(gain).connect(c.destination);
      osc.start(t0 + start);
      osc.stop(t0 + start + len + 0.02);
    } catch { /* audio unavailable: the screen already shows the result */ }
  }
}
