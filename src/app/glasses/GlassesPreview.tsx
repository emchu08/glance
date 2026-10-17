"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import type { CaptureKind } from "@/data/types";
import { LensProvider, useLens } from "@/lens/LensProvider";
import { ScaledLens } from "@/components/lens/LensStage";

export function GlassesPreview({ source }: { source: string }) {
  const initial = (source === "webcam" || source === "native" ? source : "sample") as CaptureKind;
  return (
    <LensProvider capture={initial}>
      <Inner />
    </LensProvider>
  );
}

function Inner() {
  const { state, dispatch, sceneUrl } = useLens();
  const [world, setWorld] = useState(false);
  const [help, setHelp] = useState(false);
  const size = "min(92vw, calc(100dvh - 10rem), 640px)";
  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-5 px-4 py-8">
        <div className="text-center text-[13px] tracking-wide text-white/60">
          Simulated Meta Ray-Ban Display · 600×600 · right lens{state.capture === "sample" ? " · sample status" : ""}
        </div>
        <div className="relative" style={{ width: size, height: size }}>
          {world && sceneUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sceneUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full rounded-2xl object-cover brightness-[0.45]" />
          )}
          <div className="absolute inset-0 rounded-2xl" style={world ? { mixBlendMode: "screen" } : undefined}>
            <ScaledLens interactive className="rounded-2xl" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {(["sample", "webcam", "native"] as CaptureKind[]).map((c) => (
            <button key={c} type="button" onClick={() => dispatch({ type: "capture/set", capture: c })} className={clsx("rounded-full border px-4 py-2 transition", state.capture === c ? "border-white bg-white text-black" : "border-white/25 text-white/80 hover:border-white/60")}>
              {c === "sample" ? "Sample scenario" : c === "webcam" ? "Camera" : "Glasses camera"}
            </button>
          ))}
          <button type="button" onClick={() => setWorld((w) => !w)} className={clsx("rounded-full border px-4 py-2 transition", world ? "border-white bg-white text-black" : "border-white/25 text-white/80 hover:border-white/60")}>Show world</button>
          <button type="button" onClick={() => setHelp((h) => !h)} className="rounded-full border border-white/25 px-4 py-2 text-white/80 hover:border-white/60">Install</button>
          <Link href="/demo" className="rounded-full border border-white/25 px-4 py-2 text-white/80 hover:border-white/60">Presenter view</Link>
        </div>
        <p className="text-center text-[13px] text-white/50">Arrow keys move · Enter selects · Esc goes back · or tap any control</p>
        {help && (
          <div className="max-w-xl rounded-2xl border border-white/15 p-5 text-sm leading-relaxed text-white/80">
            <p className="font-medium text-white">Running on glasses</p>
            <p className="mt-2">Display glasses need the Glance iPhone companion (see <code>ios/</code>) registered through Meta’s Wearables Device Access Toolkit. The companion opens <code>{typeof window !== "undefined" ? `${window.location.origin}/lens` : "/lens"}</code> and mirrors it to the right-lens display. A website button cannot install a native app.</p>
            <p className="mt-2">Camera-only glasses stream frames to this preview through the companion. Phones and laptops can use this page directly with the Camera source.</p>
            <button type="button" className="mt-3 rounded-full border border-white/30 px-3 py-1.5" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/lens`)}>Copy lens URL</button>
          </div>
        )}
      </div>
    </main>
  );
}
