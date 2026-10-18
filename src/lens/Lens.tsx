"use client";

import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useId, type CSSProperties } from "react";
import clsx from "clsx";
import { useLens, useLensInput } from "./LensProvider";
import { MODE_META, type LensState } from "./types";
import { TopBar, Toast, UiProvider, useUi } from "./ui";
import { ScreenBody } from "./views";
import "./lens.css";

/**
 * The single lens renderer shared by /lens, the presenter stage and the wearer preview,
 * drawn at the Ray-Ban Display's native 600×600. `interactive` lenses bind keyboard +
 * native bridge; mirrored copies only render. `instant` (native snapshots) skips motion so
 * a glasses gesture shows its result on the next frame.
 */
export function Lens({ interactive = true, scale = 1, instant = false, className }: { interactive?: boolean; scale?: number; instant?: boolean; className?: string }) {
  const { state } = useLens();
  useLensInput(interactive);
  const instanceId = useId();
  const style: CSSProperties = scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : {};
  const still = state.reducedMotion || instant;

  return (
    <UiProvider value={{ instanceId, instant: still }}>
      <div
        className={clsx("lens", instant && "is-instant", className)}
        data-mode={state.mode}
        data-screen={state.screen.id}
        data-revision={state.revision}
        style={style}
        role="application"
        aria-label={`Glance ${MODE_META[state.mode].label}`}
      >
        {still ? (
          // No motion: swap screens outright. A zero-length exit can stall (in a hidden web view, or
          // headless), leaving old screens stacked over the new one.
          <div key={screenKey(state)} className="absolute inset-0"><Screen /></div>
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={screenKey(state)}
              className="absolute inset-0"
              initial={{ opacity: 0, filter: "blur(6px)", scale: 0.985 }}
              animate={{ opacity: 1, filter: "blur(0px)", scale: 1, transition: { type: "spring", bounce: 0, duration: 0.34 } }}
              exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] } }}
            >
              <Screen />
            </motion.div>
          </AnimatePresence>
        )}
        <Toast />
        <TopBar />
      </div>
    </UiProvider>
  );
}

/** One copy of the current screen; once it starts leaving, its controls stop answering. */
function Screen() {
  const ui = useUi();
  const present = useIsPresent();
  return <UiProvider value={present ? ui : { ...ui, leaving: true }}><ScreenBody /></UiProvider>;
}

/** Screens animate in when this changes (stepping through offers doesn't re-animate). */
function screenKey(state: LensState) {
  const p = state.screen.params ?? {};
  const paying = ["pending", "needs-action", "confirmed", "accepted", "error", "recovery"].includes(state.payment.status);
  return `${state.screen.id}:${p.productKey ?? ""}${p.recipeId ?? ""}${p.storeId ?? ""}${p.orderId ?? ""}${p.page ?? ""}${p.stop ?? ""}:${state.composer ? "composer" : ""}:${paying ? "pay" : ""}`;
}
