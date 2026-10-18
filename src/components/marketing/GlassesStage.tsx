"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useSyncExternalStore } from "react";

/** Drawn on the server, while the scene loads, and if WebGL is unavailable. */
function FrameFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center p-10">
      <svg viewBox="0 0 320 120" className="w-full max-w-md text-graphite-soft" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
        <path d="M18 44c6-16 22-20 38-20h46c12 0 20 6 22 16 2-10 10-16 22-16h46c16 0 32 4 38 20" />
        <rect x="26" y="40" width="112" height="56" rx="24" />
        <rect x="182" y="40" width="112" height="56" rx="24" />
        <rect x="196" y="52" width="84" height="32" rx="10" stroke="#7fe3d0" strokeWidth="2" />
        <path d="M18 44c-6 18-8 40-6 62M302 44c6 18 8 40 6 62" />
      </svg>
    </div>
  );
}

// WebGL cannot render on the server, and `ssr: false` is only allowed inside a
// Client Component, so the canvas is split out behind this boundary.
const GlassesScene = dynamic(() => import("./GlassesScene"), { ssr: false, loading: () => <FrameFallback /> });

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeToMotion = (onChange: () => void) => {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const getMotionSnapshot = () => window.matchMedia(MOTION_QUERY).matches;
const getMotionServerSnapshot = () => false;

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function GlassesStage() {
  const reduced = useSyncExternalStore(subscribeToMotion, getMotionSnapshot, getMotionServerSnapshot);

  return (
    // A band of its own above the headline on phones, where sitting behind the text
    // would mean dimming it to nothing; beside the headline from md up.
    <div
      className="absolute inset-x-0 top-20 h-[220px] md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[56%] md:[mask-image:linear-gradient(to_right,transparent_0%,#000_26%)]"
      aria-hidden
    >
      {/* The lens bloom sits behind the frame so the teal reads as emitted light. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[46vmin] w-[46vmin] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(127,227,208,0.55) 0%, rgba(127,227,208,0.1) 55%, transparent 72%)" }}
      />
      <SceneBoundary fallback={<FrameFallback />}>
        <GlassesScene reduced={reduced} />
      </SceneBoundary>
    </div>
  );
}
