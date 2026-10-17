"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChefHat, ScanLine, ShoppingBasket, Wallet } from "lucide-react";
import { type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";
import { useLens, useLensInput } from "./LensProvider";
import { ACTION_ROW, screenTitle } from "./screens";
import { MODE_META, type LensAction } from "./types";
import { ScreenBody, StatusLine } from "./views";
import "./lens.css";

/**
 * The single lens renderer shared by /lens, the presenter stage and the wearer preview.
 * `interactive` lenses bind keyboard + native bridge; mirrored copies only render.
 */
export function Lens({ interactive = true, scale = 1, instant = false, className }: { interactive?: boolean; scale?: number; instant?: boolean; className?: string }) {
  const lens = useLens();
  useLensInput(interactive);
  const { state, actions, focusId, activate, focus } = lens;
  const style: CSSProperties = scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : {};
  const reduced = state.reducedMotion || instant;

  const header = actions.filter((a) => a.row === 0);
  const bottom = actions.filter((a) => a.row === ACTION_ROW);
  const showHeader = state.screen.id !== "welcome" && state.screen.id !== "picker" && !state.composer;

  return (
    <div
      className={clsx("lens", instant && "is-instant", className)}
      data-mode={state.mode}
      data-screen={state.screen.id}
      data-revision={state.revision}
      style={style}
      role="application"
      aria-label={`Glance ${MODE_META[state.mode].label}`}
      onPointerDown={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-action-id]");
        if (el && interactive) focus(el.dataset.actionId!);
      }}
    >
      {showHeader && (
        <header className="lens-header">
          <div>{header.find((a) => a.id === "hdr-back") && <Chip action={header.find((a) => a.id === "hdr-back")!} focused={focusId === "hdr-back"} onActivate={activate} icon={<ArrowLeft />} />}</div>
          <div>{header.find((a) => a.id === "hdr-modes") && <Chip action={header.find((a) => a.id === "hdr-modes")!} focused={focusId === "hdr-modes"} onActivate={activate} className="is-mode" icon={<ModeIcon mode={state.mode} />} />}</div>
          <div>{header.find((a) => a.id === "hdr-wallet") && <Chip action={header.find((a) => a.id === "hdr-wallet")!} focused={focusId === "hdr-wallet"} onActivate={activate} className={clsx("is-wallet", state.wallet.status === "ready" && "is-ready")} icon={<Wallet />} />}</div>
        </header>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${state.screen.id}:${JSON.stringify(state.screen.params ?? {})}:${state.composer ? "composer" : ""}:${state.payment.status === "idle" ? "" : state.payment.status}`}
          className={clsx("lens-body", !showHeader && "is-full")}
          initial={reduced ? false : { opacity: 0, scale: 0.985, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.99, filter: "blur(4px)", transition: { duration: 0.14 } }}
          transition={reduced ? { duration: 0 } : { type: "spring", duration: 0.34, bounce: 0 }}
        >
          {showHeader && <ScreenHeading />}
          <ScreenBody />
        </motion.div>
      </AnimatePresence>

      <StatusLine />

      {bottom.length > 0 && (
        <div className={clsx("lens-actions", bottom.length === 1 && "is-single")}>
          {bottom.sort((a, b) => a.x - b.x).map((a) => (
            <Pill key={a.id} action={a} focused={focusId === a.id} onActivate={activate} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {(state.toast || state.grocery.acknowledgement) && (
          <motion.div className="lens-toast" role="status" initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {state.grocery.acknowledgement ?? state.toast?.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScreenHeading() {
  const { state } = useLens();
  const title = screenTitle(state);
  if (!title) return null;
  const long = title.length > 22;
  return <h1 className={clsx("lens-title", long && "is-wrap")} style={long ? { fontSize: 34 } : undefined}>{title}</h1>;
}

export function ModeIcon({ mode, className }: { mode: keyof typeof MODE_META; className?: string }) {
  const cls = clsx("lens-mode-icon", className);
  if (mode === "glimpse") return <ScanLine className={cls} />;
  if (mode === "grocery") return <ShoppingBasket className={cls} />;
  return <ChefHat className={cls} />;
}

function Chip({ action, focused, onActivate, icon, className }: { action: LensAction; focused: boolean; onActivate: (id: string) => void; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      className={clsx("lens-chip", className, focused && "is-focused")}
      data-action-id={action.id}
      aria-label={action.hint ?? action.label}
      onClick={() => onActivate(action.id)}
    >
      {icon}
      {action.id === "hdr-modes" && <span className="lens-chip-dot" aria-hidden />}
      <span>{action.id === "hdr-back" ? "Back" : action.label}</span>
    </button>
  );
}

export function Pill({ action, focused, onActivate }: { action: LensAction; focused: boolean; onActivate: (id: string) => void }) {
  return (
    <button
      type="button"
      className={clsx("lens-pill", `is-${action.variant}`, focused && "is-focused")}
      data-action-id={action.id}
      disabled={action.disabled}
      aria-disabled={action.disabled}
      onClick={() => onActivate(action.id)}
    >
      {action.id === "add" || action.id === "add-list" ? <span aria-hidden>+</span> : null}
      {action.id.startsWith("pay-done") || action.id === "done" ? <Check aria-hidden /> : null}
      <span>{action.label}</span>
    </button>
  );
}
