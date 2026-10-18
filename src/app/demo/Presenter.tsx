"use client";

import Link from "next/link";
import { useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, Undo2 } from "lucide-react";
import type { CaptureKind } from "@/data/types";
import { formatCents } from "@/domain/money";
import { EnlargedLens, WearerScene } from "@/components/lens/LensStage";
import { LensProvider, useLens } from "@/lens/LensProvider";
import { MODE_META } from "@/lens/types";

export function Presenter({ groceryEntry }: { groceryEntry?: boolean }) {
  return (
    <LensProvider capture="sample" initial={groceryEntry ? (s) => ({ ...s, grocery: { ...s.grocery, storeEntry: { store: "QFC", active: true } } }) : undefined}>
      <Stage />
    </LensProvider>
  );
}

function Stage() {
  const lens = useLens();
  const { state, dispatch, runEffect, move, select, back, sceneCaption, diagnostics } = lens;
  const [showDiag, setShowDiag] = useState(false);
  const sourceBtn = (c: CaptureKind, label: string) => (
    <button key={c} type="button" onClick={() => dispatch({ type: "capture/set", capture: c })} className={clsx("rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition", state.capture === c ? "border-ink bg-ink text-white" : "border-rule bg-white text-ink-muted hover:border-ink-subtle")}>{label}</button>
  );
  const ctl = (label: string, onClick: () => void, extra?: string) => (
    <button type="button" onClick={onClick} className={clsx("rounded-full border border-rule bg-white px-3.5 py-1.5 text-[13px] font-medium text-ink hover:border-ink-subtle", extra)}>{label}</button>
  );
  const scanning = state.mode === "grocery" ? state.grocery.scanning : state.mode === "glimpse" ? state.glimpse.scan === "scanning" : state.gourmet.scan === "scanning";

  return (
    <main className="light-page dot-grid-light min-h-dvh bg-[#eef3fb] text-ink">
      <div className="mx-auto max-w-[1440px] px-5 py-6 md:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-serif text-2xl leading-none text-ink">glance</Link>
            <span className="text-sm text-ink-muted">Presenter</span>
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/glasses" className="rounded-full border border-rule bg-white px-3.5 py-1.5 text-ink hover:border-ink-subtle">Glasses view</Link>
            <Link href="/connect" className="cta-blue rounded-full px-3.5 py-1.5 font-medium">Connect glasses</Link>
          </nav>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_clamp(320px,34vw,460px)]">
          <section>
            <div className="mb-2 flex items-center justify-between text-[13px] text-ink-muted">
              <span className="font-medium text-ink">Wearer view</span>
              <span>{state.capture === "sample" ? "Sample scenario" : state.capture === "webcam" ? "Browser camera" : `Glasses camera · ${state.pairing.status}${state.pairing.code ? ` · ${state.pairing.code}` : ""}`}</span>
            </div>
            <WearerScene />
            <p className="mt-2 text-[13px] text-ink-subtle">{sceneCaption ?? "—"}{state.capture === "sample" ? " · scripted fixture, not live recognition" : ""}</p>

            <div className="mt-5 rounded-[20px] border border-rule bg-white/80 p-4 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">Source</span>
                {sourceBtn("sample", "Sample scenario")}{sourceBtn("webcam", "Camera")}{sourceBtn("native", "Glasses camera")}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">Scenario</span>
                {ctl(scanning ? "Pause scanning" : "Start scanning", () => {
                  if (state.mode === "grocery") dispatch({ type: "grocery/scan-toggle" });
                  else if (state.mode === "glimpse") scanning ? dispatch({ type: "glimpse/scan-cancel" }) : runEffect({ kind: "glimpse-scan" });
                  else scanning ? dispatch({ type: "gourmet/scan-cancel" }) : runEffect({ kind: "gourmet-scan" });
                })}
                {ctl("Reset scenario", () => dispatch({ type: "reset" }))}
                {ctl(state.grocery.storeEntry?.active ? "Simulate leaving store" : "Simulate store entry", () => dispatch({ type: "grocery/store-entry", store: state.grocery.storeEntry?.active ? null : "QFC" }))}
                {ctl(showDiag ? "Hide diagnostics" : "Diagnostics", () => setShowDiag((d) => !d))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[12px] font-medium uppercase tracking-wide text-ink-subtle">Mode</span>
                {(Object.keys(MODE_META) as (keyof typeof MODE_META)[]).map((m) => (
                  <button key={m} type="button" onClick={() => dispatch({ type: "mode/set", mode: m })} className={clsx("rounded-full border px-3.5 py-1.5 text-[13px] font-medium", state.mode === m ? "border-ink bg-ink text-white" : "border-rule bg-white text-ink-muted hover:border-ink-subtle")}>{MODE_META[m].label}</button>
                ))}
                <span className="ml-auto text-[13px] text-ink-subtle">Wallet: {state.wallet.status === "ready" ? `${state.wallet.brand} •• ${state.wallet.last4}` : state.wallet.status}</span>
              </div>
            </div>

            {showDiag && <Diagnostics />}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between text-[13px] text-ink-muted">
              <span className="font-medium text-ink">Lens interface · enlarged 600×600</span>
              <span>{state.screen.id} · rev {state.revision}</span>
            </div>
            <EnlargedLens />
            <div className="mt-4 rounded-[20px] border border-rule bg-white/80 p-4 backdrop-blur">
              <div className="grid grid-cols-[auto_1fr] items-center gap-4">
                <div className="grid grid-cols-3 gap-1" aria-label="D-pad">
                  <span />
                  <Pad onClick={() => move("up")} label="Up"><ArrowUp size={16} /></Pad>
                  <span />
                  <Pad onClick={() => move("left")} label="Left"><ArrowLeft size={16} /></Pad>
                  <Pad onClick={select} label="Select" primary><CornerDownLeft size={16} /></Pad>
                  <Pad onClick={() => move("right")} label="Right"><ArrowRight size={16} /></Pad>
                  <span />
                  <Pad onClick={() => move("down")} label="Down"><ArrowDown size={16} /></Pad>
                  <Pad onClick={back} label="Back"><Undo2 size={16} /></Pad>
                </div>
                <div className="text-[13px] leading-relaxed text-ink-muted">
                  <p className="font-medium text-ink">How the wearer navigates</p>
                  <p>Temple swipes or the D-pad move the white focus ring. Select activates. Back returns one level. The mode chip opens Modes; the wallet chip opens the shared wallet.</p>
                  <p className="mt-1">Keyboard works here too: arrows, Enter, Esc.</p>
                </div>
              </div>
              {state.handoff.status !== "idle" && (
                <p className="mt-3 text-[13px] text-ink-muted">Handoff: <span className="font-medium text-ink">{state.handoff.status}</span> · {state.handoff.title}</p>
              )}
              {state.payment.status !== "idle" && (
                <p className="mt-2 text-[13px] text-ink-muted">Payment: <span className="font-medium text-ink">{state.payment.status}</span>{state.payment.quote ? ` · total ${formatCents(state.payment.quote.totalCents)} · Glance commission ${formatCents(state.payment.quote.commission.amountCents)} (${state.payment.quote.commission.bps / 100}% sandbox example)` : ""}</p>
              )}
            </div>
          </section>
        </div>
        <p className="mt-8 text-center text-[12px] text-ink-subtle">Sample prices, scripted recognition, and simulated fulfillment are labeled. Live sources call the configured model explicitly; nothing analyzes frames while you read an offer. {diagnostics.provider === "sample" ? "" : "Live provider active."}</p>
      </div>
    </main>
  );
}

function Pad({ children, onClick, label, primary }: { children: React.ReactNode; onClick: () => void; label: string; primary?: boolean }) {
  return <button type="button" aria-label={label} onClick={onClick} className={clsx("grid h-10 w-10 place-items-center rounded-xl border text-ink transition active:scale-95", primary ? "border-ink bg-ink text-white" : "border-rule bg-white hover:border-ink-subtle")}>{children}</button>;
}

function Diagnostics() {
  const { state, diagnostics, actions, focusId } = useLens();
  const rows: [string, string][] = [
    ["Provider", diagnostics.provider],
    ["Service", state.capture === "sample" ? "sample fixtures" : "Claude vision + web search (server)"],
    ["Session", String(state.session)],
    ["Screen", `${state.screen.id} ${JSON.stringify(state.screen.params ?? {})}`],
    ["Focus / actions", `${focusId ?? "—"} / ${actions.length}`],
    ["Candidates", state.glimpse.candidates.map((c) => `${c.label} ${c.interest.toFixed(2)}`).join(" · ") || "—"],
    ["Grocery tracks", Object.values(state.grocery.tracker.tracks).map((t) => `${t.productKey}:${t.phase}#${t.episode}`).join(" · ") || "—"],
    ["Emitted additions", `${state.grocery.tracker.emitted.length} (${diagnostics.additions} this session)`],
    ["Inference", diagnostics.lastLatencyMs === null ? "—" : `${diagnostics.lastLatencyMs} ms${diagnostics.inflight ? ` · in flight: ${diagnostics.inflight}` : ""}`],
    ["Frames analyzed", String(diagnostics.frames)],
    ["Insights cached", Object.keys(state.grocery.insights).length.toString()],
    ["Location", `${state.location.label} (${state.location.source})`],
    ["Listing timings", diagnostics.listingTimings.map((t) => `${t.query}: ${t.ms} ms / ${t.count}`).join(" · ") || "—"],
    ["Tap → first card", diagnostics.tapToFirstCardMs === null ? "—" : `${diagnostics.tapToFirstCardMs} ms`],
    ["Est. cost", state.capture === "sample" ? "$0 (no model calls)" : `~$${((diagnostics.frames + diagnostics.listingTimings.length) * 0.01).toFixed(2)} sandbox estimate`],
    ["Commission", state.payment.quote ? `${formatCents(state.payment.quote.commission.amountCents)} gross · ${state.payment.quote.commission.version}` : "—"],
  ];
  return (
    <div className="mt-4 rounded-[20px] border border-rule bg-white/80 p-4 font-mono text-[12px] leading-relaxed text-ink-muted">
      <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-ink-subtle">{k}</dt><dd className="truncate text-ink">{v}</dd></div>)}
      </dl>
      <div className="mt-3 max-h-40 overflow-auto rounded-lg bg-ink/5 p-2">
        {diagnostics.logs.length ? diagnostics.logs.map((l, i) => <div key={i}>{l}</div>) : <div>No log lines yet.</div>}
      </div>
      <p className="mt-2 text-ink-subtle">Diagnostics never include credentials, client secrets, or card data.</p>
    </div>
  );
}
