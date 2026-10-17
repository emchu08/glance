"use client";

import { useEffect, useState } from "react";
import type { CaptureKind } from "@/data/types";
import { Lens } from "@/lens/Lens";
import { LensProvider } from "@/lens/LensProvider";
import { fixtureState } from "@/lens/fixtures";

/**
 * /lens — the wearer runtime. Native source by default inside the companion
 * WKWebView (detected by the bridge handler), sample otherwise. Fixture query
 * parameters only work in development builds.
 */
export function LensRuntime({ fixtureScreen, source, groceryEntry }: { fixtureScreen?: string; source?: string; groceryEntry?: boolean }) {
  const [capture, setCapture] = useState<CaptureKind | null>(null);
  useEffect(() => {
    const w = window as unknown as { webkit?: { messageHandlers?: { glance?: unknown } } };
    const native = !!w.webkit?.messageHandlers?.glance;
    const pick = (source === "sample" || source === "webcam" || source === "native" ? source : native ? "native" : "sample") as CaptureKind;
    setCapture(pick);
  }, [source]);
  if (!capture) return null;
  if (fixtureScreen) {
    const live = source === "live";
    return (
      <LensProvider capture="sample" fixture initial={(s) => fixtureState(fixtureScreen, live, s)} skipIntro>
        <Lens interactive instant />
      </LensProvider>
    );
  }
  return (
    <LensProvider capture={capture} initial={groceryEntry ? (s) => ({ ...s, mode: "grocery", grocery: { ...s.grocery, storeEntry: { store: "QFC", active: true } } }) : undefined}>
      <Lens interactive instant={capture === "native"} />
    </LensProvider>
  );
}
