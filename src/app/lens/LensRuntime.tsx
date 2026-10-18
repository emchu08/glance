"use client";

import { useSyncExternalStore } from "react";
import type { CaptureKind } from "@/data/types";
import { Lens } from "@/lens/Lens";
import { LensProvider } from "@/lens/LensProvider";
import { fixtureState } from "@/lens/fixtures";

/**
 * /lens — the wearer runtime. Native source by default inside the companion
 * WKWebView (detected by the bridge handler), sample otherwise. Fixture query
 * parameters only work in development builds.
 */
export function LensRuntime({ fixtureScreen, source, groceryEntry, pairCode }: { fixtureScreen?: string; source?: string; groceryEntry?: boolean; pairCode?: string }) {
  const native = useSyncExternalStore(() => () => {}, () => !!(window as unknown as { webkit?: { messageHandlers?: { glance?: unknown } } }).webkit?.messageHandlers?.glance, () => false);
  const capture = (source === "sample" || source === "webcam" || source === "native" ? source : native ? "native" : "sample") as CaptureKind;
  if (fixtureScreen) {
    const live = source === "live";
    return (
      <LensProvider capture="sample" fixture initial={(s) => fixtureState(fixtureScreen, live, s)}>
        <Lens interactive instant />
      </LensProvider>
    );
  }
  return (
    <LensProvider capture={capture} pairCode={pairCode} initial={groceryEntry ? (s) => ({ ...s, mode: "grocery", grocery: { ...s.grocery, storeEntry: { store: "QFC", active: true } } }) : undefined}>
      <Lens interactive instant={native} />
    </LensProvider>
  );
}
