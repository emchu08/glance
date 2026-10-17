"use client";

import clsx from "clsx";
import { Check, ShoppingBag } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode } from "react";
import { CATALOG_BY_ID, HOME_STORE, STORES } from "@/data/grocery";
import type { Offer } from "@/data/types";
import { cartTotals } from "@/domain/grocery/cart";
import { aisleStops, homeStoreStock } from "@/domain/grocery/list";
import { formatAmounts, paginateSteps, scaleIngredients } from "@/domain/gourmet/list";
import { formatCents } from "@/domain/money";
import { useLens } from "./LensProvider";
import { LIST_WINDOW } from "./reducer";
import { COMPOSER_KEYS, currentOffer, isPayable, visibleWindow } from "./screens";
import { MODE_META, type LensAction, type LensState } from "./types";

// ──────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ──────────────────────────────────────────────────────────────────────────────

function Rows({ render, filter }: { render?: (a: LensAction, i: number) => ReactNode; filter?: (a: LensAction) => boolean }) {
  const { actions, focusId, activate, state } = useLens();
  const list = actions.filter((a) => a.listIndex !== undefined && (filter ? filter(a) : true)).sort((a, b) => a.listIndex! - b.listIndex!);
  const { start, end } = visibleWindow(list, state.windowStart);
  const visible = list.slice(start, end);
  return (
    <div className="lens-rows" role="list">
      {visible.map((a) => (
        <button key={a.id} type="button" role="listitem" className={clsx("lens-row", focusId === a.id && "is-focused", a.variant === "row" && a.hint && (a.hint === "checked" || a.hint === "unchecked") && "has-check")} data-action-id={a.id} onClick={() => activate(a.id)} disabled={a.disabled}>
          {render ? render(a, a.listIndex!) : (
            <>
              <div className="lens-row-main">
                <div className="lens-row-label">{a.label}</div>
                {a.hint && <div className="lens-row-hint">{a.hint}</div>}
              </div>
            </>
          )}
        </button>
      ))}
    </div>
  );
}

function Position({ count, index, note }: { count: number; index?: number; note?: ReactNode }) {
  const { state, actions, focusId, activate } = useLens();
  if (index !== undefined) {
    const prev = actions.find((a) => a.id === "offer-prev");
    const next = actions.find((a) => a.id === "offer-next");
    const chevron = (a: LensAction | undefined, glyph: string) => a ? (
      <button type="button" className={clsx("lens-chevron", focusId === a.id && "is-focused")} data-action-id={a.id} aria-label={a.label} onClick={() => activate(a.id)}>{glyph}</button>
    ) : null;
    return (
      <>
        <span>{note}</span>
        <span className="lens-dots" aria-label={`${index + 1} of ${count}`}>
          {chevron(prev, "‹")}
          {Array.from({ length: Math.min(count, 8) }).map((_, i) => <i key={i} className={i === index ? "is-on" : undefined} />)}
          <span style={{ marginLeft: 10 }}>{index + 1} of {count}</span>
          {chevron(next, "›")}
        </span>
      </>
    );
  }
  const { start, end } = visibleWindow(Array.from({ length: count }, (_, i) => ({ listIndex: i })) as unknown as LensAction[], state.windowStart);
  if (count <= LIST_WINDOW) return <><span>{note}</span><span /></>;
  return (
    <>
      <span>{note}</span>
      <span>{start + 1}–{end} of {count} {end < count ? "↓" : "↑"}</span>
    </>
  );
}

/** Status/position line under the content — one short line, never a toolbar. */
export function StatusLine() {
  const { state, actions } = useLens();
  const s = state.screen;
  const listCount = actions.filter((a) => a.listIndex !== undefined).length;
  let body: ReactNode = null;
  const sampleNote = state.capture === "sample" ? "Sample" : null;
  if (state.composer) body = <><span>{state.composer.page + 1} of {COMPOSER_KEYS.length} key pages</span><span>Done saves</span></>;
  else switch (s.id) {
    case "glimpse-offers": case "online-listings": case "glimpse-cart-item": {
      const list = s.id === "online-listings" ? state.listings.offers : s.id === "glimpse-cart-item" ? state.glimpse.saved : state.glimpse.offers;
      const offer = currentOffer(state);
      const idx = offer ? list.findIndex((o) => o.id === offer.id) : -1;
      if (idx >= 0 && !["pending", "needs-action", "confirmed", "accepted", "error", "recovery"].includes(state.payment.status)) body = <Position count={list.length} index={idx} note={offer?.origin === "sample" ? "Sample prices" : state.glimpse.offersStatus === "loading" || state.listings.status === "loading" ? <span className="is-accent">Still searching…</span> : "Live search"} />;
      break;
    }
    case "grocery": {
      const t = cartTotals(state.grocery.cart);
      body = <Position count={listCount} note={<>{t.unknownLines ? <span className="is-warn">{t.unknownLines} without price · </span> : null}{state.grocery.scanning ? <span className="is-accent">Scanning every 3 s</span> : sampleNote ? "Sample prices" : "Scan paused"}</>} />;
      break;
    }
    case "grocery-item": body = <><span>{sampleNote ? `${HOME_STORE} · sample price` : "Live estimate"}</span><span>Add puts it in your cart</span></>; break;
    case "grocery-list": {
      const stock = homeStoreStock(state.list);
      body = <Position count={listCount} note={stock.unavailable.length ? <span className="is-warn">{stock.store} lacks {stock.unavailable.length}</span> : `${stock.store} has all ${stock.covered.length} (demo stock)`} />;
      break;
    }
    case "gourmet-recipe": body = <Position count={listCount} note="Uncheck what you already have" />; break;
    case "gourmet-steps": { const r = recipeOf(state, String(s.params?.recipeId)); const pages = r ? paginateSteps(r.steps) : [[]]; body = <><span>Suggested recipe</span><span>Page {Number(s.params?.page ?? 0) + 1} of {pages.length}</span></>; break; }
    case "grocery-checkout": body = <><span>Finish trip never charges a card</span><span>{sampleNote ? "Mock history" : ""}</span></>; break;
    case "stores": body = <Position count={listCount} note={state.location.source === "demo" ? "From U District (demo)" : "From your location"} />; break;
    case "wallet": body = <><span>Payments by Stripe · sandbox</span><span>{state.wallet.email ?? ""}</span></>; break;
    default:
      if (listCount > LIST_WINDOW) body = <Position count={listCount} note={sampleNote} />;
      else if (sampleNote && !["welcome", "picker"].includes(s.id)) body = <><span>{sampleNote}</span><span /></>;
  }
  if (!body) return null;
  return <div className="lens-status" aria-live="polite">{body}</div>;
}

function recipeOf(state: LensState, id: string) {
  return state.gourmet.recipes.find((r) => r.id === id) ?? state.gourmet.saved.find((r) => r.id === id) ?? null;
}

function Center({ children }: { children: ReactNode }) {
  return <div className="lens-center"><div>{children}</div></div>;
}

function Spinner({ pay }: { pay?: boolean }) {
  return <div className={clsx("lens-spinner", pay && "is-pay")} aria-hidden />;
}

// ──────────────────────────────────────────────────────────────────────────────
// Screen bodies
// ──────────────────────────────────────────────────────────────────────────────

export function ScreenBody() {
  const { state } = useLens();
  if (state.composer) return <Composer />;
  switch (state.screen.id) {
    case "welcome": return <Welcome />;
    case "picker": return <Picker />;
    case "more": return <Rows />;
    case "glimpse": return <GlimpseRoot />;
    case "glimpse-candidates": return <Candidates />;
    case "glimpse-offers": case "online-listings": case "glimpse-cart-item": return <OfferScreen />;
    case "glimpse-cart": return <SavedList />;
    case "handoff": return <Handoff />;
    case "grocery": return <GroceryRoot />;
    case "grocery-item": return <GroceryItem />;
    case "grocery-compare": return <GroceryCompare />;
    case "grocery-edit": return <GroceryEdit />;
    case "grocery-manual": return <Rows />;
    case "grocery-list": return <GroceryList />;
    case "grocery-checkout": return <TripSummary />;
    case "grocery-bought": return <Bought />;
    case "grocery-find": return <FindNext />;
    case "gourmet": return <GourmetRoot />;
    case "gourmet-recipes": return <RecipeList />;
    case "gourmet-recipe": return <RecipeDetail />;
    case "gourmet-steps": return <Steps />;
    case "gourmet-shop": return <Rows />;
    case "gourmet-added": return <Added />;
    case "stores": return <Rows />;
    case "nav": return <Center><p className="lens-eyebrow">Directions sent</p><h2 className="lens-title is-wrap">Check your phone for walking directions.</h2></Center>;
    case "wallet": return <WalletTray />;
    case "wallet-orders": return <Rows />;
    case "wallet-order": return <OrderReceipt />;
    default: return null;
  }
}

// ── Welcome & picker ─────────────────────────────────────────────────────────

function Welcome() {
  const { state } = useLens();
  const reduced = state.reducedMotion;
  return (
    <div className="lens-welcome">
      <div>
        <div className="lens-welcome-kicker">Welcome to</div>
        <div className="lens-wordmark" aria-label="glance">
          glance
          {!reduced && <motion.span className="is-mask" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ delay: 0.4, duration: 2.5, ease: "linear" }} aria-hidden />}
          <motion.span className="lens-scanbar" initial={reduced ? { left: "100%" } : { left: "0%" }} animate={{ left: "100%" }} transition={reduced ? { duration: 0 } : { delay: 0.4, duration: 2.5, ease: "linear" }} aria-hidden />
        </div>
        <motion.div className="lens-welcome-tag" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 2.9, duration: 0.4 }}>Buy with your eyes.</motion.div>
      </div>
    </div>
  );
}

function Picker() {
  const { actions, focusId, activate, state } = useLens();
  const modes = actions.filter((a) => a.id.startsWith("mode-"));
  const selected = Math.max(0, modes.findIndex((a) => a.id === focusId));
  const reduced = state.reducedMotion;
  return (
    <div className="lens-wheel" aria-label="Choose a mode">
      {modes.map((a, i) => {
        const offset = i - selected;
        const isSel = offset === 0;
        const mode = a.id.replace("mode-", "") as keyof typeof MODE_META;
        return (
          <motion.button
            key={a.id}
            type="button"
            className={clsx("lens-wheel-row", isSel && "is-focused")}
            data-action-id={a.id}
            onClick={() => activate(a.id)}
            animate={{ top: 300 - 64 + offset * 128, scale: isSel ? 1 : 0.62, opacity: isSel ? 1 : Math.abs(offset) === 1 ? 0.45 : 0.25, rotateX: offset * -28 }}
            transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
            style={{ color: isSel ? MODE_META[mode].color : "#fff" }}
          >
            <span className="lens-wheel-label">{a.label}</span>
            {isSel && <span className="lens-wheel-hint">{a.hint}</span>}
          </motion.button>
        );
      })}
      <div className="lens-status" style={{ justifyContent: "center", bottom: 36, height: 30 }}>
        {state.pairing.status === "none"
          ? (state.capture === "sample" ? "Sample scenario · ↑↓ then select" : state.capture === "webcam" ? "Camera · ↑↓ then select" : "Glasses · ↑↓ then select")
          : `Glasses ${state.pairing.status === "connected" ? "connected" : state.pairing.status === "waiting" ? `· pair code ${state.pairing.code ?? "…"}` : `· ${state.pairing.status}`}`}
      </div>
    </div>
  );
}

// ── Glimpse ──────────────────────────────────────────────────────────────────

function GlimpseRoot() {
  const { state } = useLens();
  const g = state.glimpse;
  if (g.scan === "scanning") return <Center><Spinner /><p className="lens-sub">Hold still for a moment</p></Center>;
  if (g.scan === "error") return <Center><p className="lens-eyebrow">Couldn’t scan</p><h2 className="lens-title is-wrap" style={{ fontSize: 30 }}>{g.error ?? "Try again"}</h2></Center>;
  const best = g.candidates.find((c) => c.id === g.chosenId) ?? g.candidates[0];
  if (best) {
    return (
      <div>
        <h2 className="lens-title is-wrap" style={{ fontSize: 44 }}>{best.label}</h2>
        <p className="lens-sub">{best.attributes.join(" · ")}</p>
        <div className="lens-tags">
          <span className="lens-tag is-accent">{Math.round(best.confidence * 100)}% match</span>
          <span className="lens-tag">{best.reason}</span>
          {g.candidates.length > 1 && <span className="lens-tag">+{g.candidates.length - 1} more in view</span>}
        </div>
        <p className="lens-sub" style={{ marginTop: 14, fontSize: 19 }}>Estimated from where you’re facing · not eye tracking</p>
      </div>
    );
  }
  return (
    <div>
      <p className="lens-sub is-wrap" style={{ fontSize: 24 }}>Look at a product and scan. Glance finds offers and lets you buy eligible items with your saved card.</p>
      <div className="lens-tags"><span className="lens-tag is-accent">Scan is explicit</span><span className="lens-tag">Nothing analyzed until you ask</span></div>
    </div>
  );
}

function Candidates() {
  const { state } = useLens();
  const list = state.glimpse.frozenCandidates ?? state.glimpse.candidates;
  return (
    <>
      <p className="lens-sub">Paused while you choose</p>
      <Rows render={(a) => {
        const c = list.find((x) => `cand-${x.id}` === a.id)!;
        return (<><div className="lens-row-main"><div className="lens-row-label">{c.label}</div><div className="lens-row-hint">{c.reason}</div></div><div className="lens-row-aside">{Math.round(c.confidence * 100)}%</div></>);
      }} />
    </>
  );
}

function OfferScreen() {
  const { state } = useLens();
  const s = state.screen;
  const list = s.id === "online-listings" ? state.listings.offers : s.id === "glimpse-cart-item" ? state.glimpse.saved : state.glimpse.offers;
  const status = s.id === "online-listings" ? state.listings.status : state.glimpse.offersStatus;
  const offer = currentOffer(state);
  const p = state.payment;

  if (s.id === "online-listings" && (status === "idle" || (status === "loading" && !list.length) || status === "error" || status === "empty")) {
    return (
      <div>
        <SearchField />
        {status === "loading" && <Center><Spinner /><p className="lens-sub">Searching real listings…</p></Center>}
        {status === "error" && <p className="lens-sub is-wrap" style={{ marginTop: 16 }}>{state.listings.error ?? "Search failed"}</p>}
        {status === "empty" && <p className="lens-sub is-wrap" style={{ marginTop: 16 }}>No listings matched. Try a shorter name.</p>}
        {status === "idle" && <p className="lens-sub is-wrap" style={{ marginTop: 16, fontSize: 20 }}>Live search · uses the configured model and web search</p>}
      </div>
    );
  }
  if (!offer) {
    if (status === "loading") return <Center><Spinner /><p className="lens-sub">Comparing offers…</p></Center>;
    if (status === "error") return <Center><p className="lens-eyebrow">Couldn’t load offers</p><p className="lens-sub is-wrap">{state.glimpse.error ?? "Try again"}</p></Center>;
    return <Center><p className="lens-sub is-wrap">No offers yet. Try online listings.</p></Center>;
  }
  if (p.offerId === offer.id && ["pending", "needs-action", "confirmed", "accepted", "error", "recovery"].includes(p.status)) return <PaymentSurface offer={offer} />;
  return <OfferCard offer={offer} />;
}

function SearchField() {
  const { actions, focusId, activate, state } = useLens();
  const a = actions.find((x) => x.id === "search");
  if (!a) return null;
  const q = state.listings.query;
  return (
    <button type="button" className={clsx("lens-field", focusId === a.id && "is-focused")} data-action-id={a.id} onClick={() => activate(a.id)} style={{ position: "relative", borderRadius: 18, width: "100%", textAlign: "left", background: "transparent", color: "#fff", fontFamily: "inherit" }}>
      {q ? q : <span className="is-placeholder">Search products</span>}
    </button>
  );
}

function OfferCard({ offer }: { offer: Offer }) {
  const { state } = useLens();
  const p = state.payment;
  const payable = isPayable(offer);
  const quote = payable && p.offerId === offer.id && p.quote ? p.quote : null;
  const matchLabel = offer.match === "exact" ? "Exact match" : offer.match === "possible" ? "Possible match" : "Similar";
  return (
    <div>
      <div className="lens-offer">
        <Thumb offer={offer} />
        <div style={{ minWidth: 0 }}>
          <div className="lens-offer-name">{offer.name}</div>
          <div className="lens-offer-meta">{offer.retailer}{offer.variant ? ` · ${offer.variant}` : ""}{payable ? " · qty 1" : ""}</div>
          <div className="lens-tags">
            <span className={clsx("lens-tag", offer.match === "exact" && "is-accent")}>{matchLabel}</span>
            {offer.sponsored && <span className="lens-tag is-sponsored">Sponsored</span>}
            {offer.badge && !offer.sponsored && <span className={clsx("lens-tag", payable ? "is-pay" : "is-best")}>{offer.badge}</span>}
            {!payable && <span className="lens-tag">External retailer</span>}
          </div>
        </div>
      </div>
      <div className="lens-price">
        {quote ? formatCents(quote.totalCents) : formatCents(offer.priceCents)}
        {quote ? <small>total · {quote.shippingCents ? `incl. ${formatCents(quote.shippingCents)} shipping` : "free shipping"}{quote.taxCents ? ` · tax ${formatCents(quote.taxCents)}` : " · no tax"}</small> : offer.priceCents !== null ? <small>{offer.origin === "sample" ? "sample price" : "listed price"}</small> : null}
      </div>
      {payable && (
        <p className="lens-sub" style={{ marginTop: 8 }}>
          {state.wallet.status === "ready" && state.wallet.last4 ? `${state.wallet.brand ?? "Card"} •• ${state.wallet.last4} · Payments by Stripe` : "Set up your wallet to buy here"}
        </p>
      )}
    </div>
  );
}

function Thumb({ offer }: { offer: Offer }) {
  const url = offer.imageUrl;
  if (!url) return <div className="lens-thumb"><ShoppingBag aria-hidden /></div>;
  return (
    <div className={clsx("lens-thumb", offer.origin === "sample" && !url.endsWith(".svg") && "is-sample")}>
      {/* External product images: contained on a white tile, no referrer. */}
      <img src={url} alt="" referrerPolicy="no-referrer" loading="eager" decoding="async" onError={(e) => { (e.currentTarget.parentElement as HTMLElement).innerHTML = ""; }} />
    </div>
  );
}

function PaymentSurface({ offer }: { offer: Offer }) {
  const { state } = useLens();
  const p = state.payment;
  const total = p.order?.totalCents ?? p.quote?.totalCents ?? offer.priceCents;
  switch (p.status) {
    case "pending":
      return <Center><Spinner pay /><h2 className="lens-title">Paying…</h2><p className="lens-sub">{formatCents(total)} · {offer.retailer}</p></Center>;
    case "needs-action":
      return <Center><div className="lens-badge is-warn"><Check aria-hidden /></div><h2 className="lens-title is-wrap" style={{ fontSize: 34 }}>Your bank wants a quick check</h2><p className="lens-sub is-wrap">Verify on your phone. Your order is saved.</p></Center>;
    case "confirmed":
    case "accepted":
      return (
        <Center>
          <div className="lens-badge is-ok"><Check aria-hidden /></div>
          <h2 className="lens-title">{p.status === "accepted" ? "Order accepted" : "Payment confirmed"}</h2>
          <p className="lens-sub">{formatCents(total)} · {offer.retailer}</p>
          <p className="lens-sub" style={{ fontSize: 19 }}>{p.order?.reference ? `Ref ${p.order.reference}` : ""}{p.status === "confirmed" ? " · waiting for the seller" : " · demo fulfillment"}</p>
        </Center>
      );
    case "error":
    case "recovery":
      return <Center><div className="lens-badge is-warn">!</div><h2 className="lens-title is-wrap" style={{ fontSize: 34 }}>{p.status === "recovery" ? "Price or stock changed" : "Payment didn’t go through"}</h2><p className="lens-sub is-wrap">{p.error ?? "Your selection is kept."}</p></Center>;
    default:
      return null;
  }
}

function SavedList() {
  const { state } = useLens();
  if (!state.glimpse.saved.length) return <Center><ShoppingBag style={{ width: 64, height: 64, color: "rgba(255,255,255,0.4)", margin: "0 auto 12px" }} aria-hidden /><p className="lens-sub">Nothing saved yet</p></Center>;
  return <Rows render={(a) => { const o = state.glimpse.saved.find((x) => `saved-${x.id}` === a.id)!; return (<><div className="lens-row-main"><div className="lens-row-label">{o.name}</div><div className="lens-row-hint">{o.retailer} · {o.candidateLabel}</div></div><div className="lens-row-aside is-strong">{formatCents(o.priceCents)}</div></>); }} />;
}

function Handoff() {
  const { state } = useLens();
  const h = state.handoff;
  const label = h.status === "sending" ? "Sending…" : h.status === "queued" ? "Waiting for your phone" : h.status === "sent" ? (state.pairing.code ? "Sent to your iPhone" : "Opened on this device") : "Couldn’t send";
  return (
    <Center>
      {h.status === "sending" || h.status === "queued" ? <Spinner /> : <div className={clsx("lens-badge", h.status === "sent" ? "is-ok" : "is-warn")}>{h.status === "sent" ? <Check aria-hidden /> : "!"}</div>}
      <h2 className="lens-title is-wrap" style={{ fontSize: 36 }}>{label}</h2>
      <p className="lens-sub is-wrap">{h.title}</p>
      {h.error && <p className="lens-sub is-wrap" style={{ color: "var(--lens-warn)" }}>{h.error}</p>}
    </Center>
  );
}

// ── Grocery ──────────────────────────────────────────────────────────────────

function GroceryRoot() {
  const { state } = useLens();
  const gr = state.grocery;
  const t = cartTotals(gr.cart);
  if (gr.pendingAsk) {
    return <Center><p className="lens-eyebrow">Did this go in your cart?</p><h2 className="lens-title is-wrap">{gr.pendingAsk.label}</h2><p className="lens-sub">{gr.pendingAsk.packageSize ?? ""}</p></Center>;
  }
  if (!gr.cart.length) {
    return (
      <div>
        <div className="lens-figure">{formatCents(0)}</div>
        <p className="lens-sub" style={{ marginTop: 8 }}>0 items</p>
        <p className="lens-sub is-wrap" style={{ marginTop: 18, fontSize: 22 }}>Hold an item up, then put it in your cart. Seeing or holding never adds by itself.</p>
      </div>
    );
  }
  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div className="lens-figure is-mid">{formatCents(t.knownSubtotalCents)}</div>
        <div className="lens-sub">{t.units} item{t.units === 1 ? "" : "s"}{t.unknownLines ? " · some unpriced" : ""}</div>
      </div>
      <Rows render={(a) => { const l = gr.cart.find((x) => `line-${x.productKey}` === a.id)!; return (<><div className="lens-row-main"><div className="lens-row-label">{l.label}</div><div className="lens-row-hint">{l.quantity} × {formatCents(l.unitPriceCents)}{l.packageSize ? ` · ${l.packageSize}` : ""}{l.priceSource === "manual" ? " · you entered" : l.priceSource === "unknown" ? " · price unknown" : ""}</div></div><div className="lens-row-aside is-strong">{l.unitPriceCents === null ? "—" : formatCents(l.unitPriceCents * l.quantity)}</div></>); }} />
    </>
  );
}

function GroceryItem() {
  const { state } = useLens();
  const key = String(state.screen.params?.productKey ?? "");
  const product = CATALOG_BY_ID[key];
  const ins = state.grocery.insights[key];
  const data = ins?.data ?? null;
  const name = product?.name ?? state.grocery.heldLabel ?? key;
  const size = product?.size ?? state.grocery.heldSize ?? "";
  const best = data?.bestSame && data.homePriceCents !== null && data.bestSame.priceCents < (data.homePriceCents ?? Infinity) ? data.bestSame : null;
  return (
    <div>
      <h2 className="lens-title is-wrap" style={{ fontSize: 40 }}>{name}</h2>
      <p className="lens-sub">{size ? `${size} · ` : ""}{HOME_STORE}</p>
      <div className="lens-price" style={{ fontSize: 60 }}>{formatCents(data?.homePriceCents ?? product?.qfcPriceCents ?? null)}{best ? <small>{best.store} <span style={{ color: "var(--lens-best)" }}>{formatCents(best.priceCents)}</span></small> : null}</div>
      {ins?.status === "loading" && <p className="lens-sub" style={{ marginTop: 10 }}>Checking nutrition…</p>}
      {data?.nutrition && (
        <p className="lens-sub" style={{ marginTop: 10, fontSize: 20 }}>≈ {data.nutrition.kcal} cal · {data.nutrition.carbs} g carbs · {data.nutrition.sugar} g sugar · Estimate</p>
      )}
      <div className="lens-tags">
        {data?.flags.map((f) => <span key={f.text} className={clsx("lens-tag", f.severity === "warn" ? "is-sponsored" : undefined)}>⚠ {f.text}</span>)}
      </div>
      {data?.nudge && !state.grocery.nudgedKeys.includes(`${key}:shown`) && <p className="lens-sub is-wrap" style={{ marginTop: 10, fontSize: 21, color: "var(--lens-accent)" }}>{data.nudge}</p>}
    </div>
  );
}

function GroceryCompare() {
  const { state } = useLens();
  const key = String(state.screen.params?.productKey ?? "");
  const tab = state.screen.params?.tab;
  const product = CATALOG_BY_ID[key];
  const data = state.grocery.insights[key]?.data;
  if (tab === "nutrition") {
    const n = data?.nutrition;
    if (!n) return <Center><p className="lens-sub">No nutrition data</p></Center>;
    return (
      <div>
        <p className="lens-sub">{product?.name} · per {n.serving}</p>
        <div className="lens-card" style={{ fontSize: 24 }}>
          <Row k="Calories" v={`≈ ${n.kcal}`} /><Row k="Protein" v={`${n.protein} g`} /><Row k="Carbs" v={`${n.carbs} g`} /><Row k="Sugar" v={`${n.sugar} g`} /><Row k="Fat" v={`${n.fat} g`} /><Row k="Sodium" v={`${n.sodium} mg`} />
        </div>
        <p className="lens-sub" style={{ marginTop: 10, fontSize: 19 }}>{data.allergens.length ? `Typically contains ${data.allergens.join(", ")}` : "No allergen listed in this sample"} · Estimate · Sample</p>
      </div>
    );
  }
  const comps = data?.comparisons ?? [];
  const home = data?.homePriceCents ?? product?.qfcPriceCents ?? null;
  const bestSame = comps.filter((c) => c.match === "same").sort((a, b) => a.priceCents - b.priceCents)[0];
  return (
    <>
      <p className="lens-sub">{product?.size} · here at {HOME_STORE} {formatCents(home)} · sample prices</p>
      <Rows render={(a) => {
        const i = Number(a.id.split("-").pop());
        const c = comps[i];
        if (!c) return null;
        const store = STORES.find((s) => s.name === c.store);
        const km = store ? `${haversine(state.location.lat, state.location.lng, store.lat, store.lng).toFixed(1)} km` : "Online";
        return (<><div className="lens-row-main"><div className="lens-row-label">{c.store}</div><div className="lens-row-hint">{c.match === "alternative" ? "Different pack" : "Same item"} · {c.size} · {km}{c.store === "Amazon" || c.store === "Temu" ? " · demo buy" : ""}</div></div><div className={clsx("lens-row-aside is-strong", c === bestSame && "is-best")}>{c === bestSame ? <span style={{ fontSize: 18, marginRight: 8 }}>Best</span> : null}{formatCents(c.priceCents)}</div></>);
      }} />
    </>
  );
}

function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--lens-muted)" }}>{k}</span><span>{v}</span></div>;
}

function GroceryEdit() {
  const { state, actions, focusId, activate } = useLens();
  const key = String(state.screen.params?.productKey ?? "");
  const line = state.grocery.cart.find((l) => l.productKey === key);
  if (!line) return <Center><p className="lens-sub">Removed</p></Center>;
  const btn = (id: string, className?: string) => { const a = actions.find((x) => x.id === id); if (!a) return null; return <button type="button" className={clsx("lens-pill", className, focusId === id && "is-focused")} data-action-id={id} onClick={() => activate(id)} style={{ flex: "0 0 auto" }}>{a.label}</button>; };
  return (
    <div>
      <h2 className="lens-title is-wrap" style={{ fontSize: 34 }}>{line.label}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8 }}>
        {btn("qty-minus", "is-quiet")}
        <div style={{ flex: 1, textAlign: "center" }}><div className="lens-figure is-mid">{line.quantity}</div><div className="lens-sub" style={{ textAlign: "center" }}>in cart</div></div>
        {btn("qty-plus", "is-quiet")}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
        {btn("price", "is-quiet")}
        {btn("remove", "is-danger")}
      </div>
    </div>
  );
}

function GroceryList() {
  const { state } = useLens();
  const left = state.list.filter((i) => !i.done).length;
  if (!state.list.length) return <Center><p className="lens-sub is-wrap">Your list is empty. Add a recipe in Gourmet.</p></Center>;
  return (
    <>
      <p className="lens-sub">{left} of {state.list.length} left · items tick off as they go in the cart</p>
      <Rows render={(a) => { const it = state.list.find((x) => `list-${x.key}` === a.id)!; return (<><span className={clsx("lens-check", it.done && "is-on")}>{it.done && <Check aria-hidden />}</span><div className="lens-row-main"><div className="lens-row-label" style={it.done ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{it.name}</div><div className="lens-row-hint">{formatAmounts(it.amounts)}{it.recipes.length ? ` · ${it.recipes[0]}` : ""}</div></div></>); }} />
    </>
  );
}

function TripSummary() {
  const { state } = useLens();
  const s = state.grocery.summary;
  if (!s) return <Center><p className="lens-sub">No trip yet</p></Center>;
  const total = s.segments.reduce((n, x) => n + x.cents, 0);
  const colors = ["#a9cdf5", "#6b6b6b", "#8a8a8a", "#a9a9a9", "#505050"];
  const r = 78, c = 2 * Math.PI * r;
  const offsets = s.segments.reduce<number[]>((acc, seg) => [...acc, (acc[acc.length - 1] ?? 0) + seg.cents], []).map((end, i) => end - s.segments[i].cents);
  return (
    <div>
      <div className="lens-donut">
        <svg viewBox="0 0 200 200" width="200" height="200" role="img" aria-label="Spending this month">
          {s.segments.map((seg, i) => {
            const frac = total ? seg.cents / total : 0;
            const dash = `${frac * c} ${c}`;
            const rot = (offsets[i] / Math.max(total, 1)) * 360 - 90;
            return <motion.circle key={seg.label} cx="100" cy="100" r={r} fill="none" stroke={seg.highlight ? colors[0] : colors[(i % 4) + 1]} strokeWidth="26" strokeDasharray={dash} transform={`rotate(${rot} 100 100)`} initial={state.reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.08 }} />;
          })}
          <text x="100" y="96" textAnchor="middle" fill="#fff" fontSize="30" fontWeight="700">{formatCents(s.thisTripCents)}</text>
          <text x="100" y="122" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="15">this trip</text>
        </svg>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="lens-badge is-ok" style={{ width: 36, height: 36, margin: 0 }}><Check style={{ width: 22, height: 22 }} aria-hidden /></span><span style={{ fontSize: 30, fontWeight: 700 }}>Checked out</span></div>
          <p className="lens-sub" style={{ marginTop: 6 }}>{s.items} item{s.items === 1 ? "" : "s"}{s.unknownLines ? ` · ${s.unknownLines} unpriced` : ""}</p>
          <p style={{ fontSize: 26, margin: "6px 0 0" }}><b>{formatCents(s.monthToDateCents)}</b> <span className="lens-sub" style={{ display: "inline" }}>in October</span></p>
          <p className="lens-sub">Last month {formatCents(s.lastMonthCents)}</p>
        </div>
      </div>
      <div className="lens-legend" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 12 }}>
        {s.segments.map((seg, i) => <div key={seg.label} className={seg.highlight ? "is-strong" : undefined}><span><i style={{ background: seg.highlight ? colors[0] : colors[(i % 4) + 1] }} />{seg.label}</span><span>{formatCents(seg.cents)}</span></div>)}
      </div>
    </div>
  );
}

function Bought() {
  const { state } = useLens();
  const b = state.grocery.bought[state.grocery.bought.length - 1];
  return <Center><div className="lens-badge is-ok"><Check aria-hidden /></div><h2 className="lens-title">Bought</h2><p className="lens-sub">{b?.name}</p><p className="lens-sub">{b?.retailer} · {formatCents(b?.priceCents ?? null)} · sample price</p><p className="lens-sub" style={{ fontSize: 19 }}>Demo · finish on your phone · no merchant integration</p></Center>;
}

function FindNext() {
  const { state } = useLens();
  const stops = aisleStops(state.list);
  const i = Number(state.screen.params?.stop ?? 0);
  const stop = stops[i];
  if (!stop) return <Center><p className="lens-sub">Nothing left to find</p></Center>;
  const prevAisle = i === 0 ? 0 : stops[i - 1].aisle;
  const arrow = stop.aisle > prevAisle ? "↑" : stop.aisle < prevAisle ? "↓" : stop.side === "left" ? "←" : "→";
  return (
    <div>
      <div className="lens-arrow" aria-hidden>{arrow}</div>
      <h2 className="lens-title" style={{ textAlign: "center" }}>Aisle {stop.aisle} · {stop.side}</h2>
      <p className="lens-sub" style={{ textAlign: "center" }}>{stop.name} · {stop.section}</p>
      <p className="lens-sub" style={{ textAlign: "center", fontSize: 19, marginTop: 8 }}>Stop {i + 1} of {stops.length} · scripted store layout</p>
    </div>
  );
}

// ── Gourmet ──────────────────────────────────────────────────────────────────

function GourmetRoot() {
  const { state } = useLens();
  const g = state.gourmet;
  if (g.scan === "scanning") return <Center><Spinner /><p className="lens-sub">Looking at the plate</p></Center>;
  if (g.scan === "no-food") return <Center><p className="lens-eyebrow">No dish in view</p><p className="lens-sub is-wrap">Point at prepared food and scan again.</p></Center>;
  if (g.scan === "error") return <Center><p className="lens-eyebrow">Couldn’t scan</p><p className="lens-sub is-wrap">{g.error}</p></Center>;
  if (g.hypotheses.length) {
    const best = g.hypotheses[0];
    return (
      <>
        <h2 className="lens-title is-wrap" style={{ fontSize: 40 }}>{best.name}</h2>
        <p className="lens-sub">{best.cues.join(" · ")}</p>
        <Rows render={(a) => { const i = Number(a.id.split("-")[1]); const h = g.hypotheses[i]; return (<><div className="lens-row-main"><div className="lens-row-label">{h.name}</div></div><div className={clsx("lens-row-aside", i === 0 && "is-best")}>{i === 0 ? "Best match" : "Possible"}</div></>); }} />
      </>
    );
  }
  return (
    <div>
      <p className="lens-sub is-wrap" style={{ fontSize: 24 }}>Look at a dish and scan. Glance suggests recipes and turns them into a shopping list.</p>
      <div className="lens-tags"><span className="lens-tag is-accent">Suggestions, not restaurant recipes</span></div>
    </div>
  );
}

function RecipeList() {
  const { state } = useLens();
  const g = state.gourmet;
  if (g.recipesStatus === "loading") return <Center><Spinner /><p className="lens-sub">Writing three recipes…</p></Center>;
  if (g.recipesStatus === "error") return <Center><p className="lens-eyebrow">Couldn’t get recipes</p><p className="lens-sub is-wrap">{g.error}</p></Center>;
  if (g.recipesStatus === "empty" || !g.recipes.length) return <Center><p className="lens-sub is-wrap">No recipes for this dish yet.</p></Center>;
  return <><p className="lens-sub">Like {state.gourmet.dish ?? "the dish you saw"}</p><Rows /></>;
}

function RecipeDetail() {
  const { state } = useLens();
  const id = String(state.screen.params?.recipeId ?? "");
  const r = recipeOf(state, id);
  if (!r) return null;
  const servings = state.gourmet.servings[id] ?? r.servings;
  const deselected = new Set(state.gourmet.deselected[id] ?? []);
  const ings = scaleIngredients(r.ingredients, r.servings, servings);
  const selected = ings.filter((i) => !deselected.has(i.name)).length;
  return (
    <>
      <h2 className="lens-title is-wrap" style={{ fontSize: 36 }}>{r.title}</h2>
      <p className="lens-sub">{r.minutes} min · serves {servings} · {selected} of {ings.length} selected · {r.source === "sample" ? "sample" : "suggested"} recipe</p>
      <Rows render={(a) => { const i = Number(a.id.split("-")[1]); const ing = ings[i]; const on = !deselected.has(ing.name); return (<><span className={clsx("lens-check", on && "is-on")}>{on && <Check aria-hidden />}</span><div className="lens-row-main"><div className="lens-row-label">{ing.name}</div></div><div className="lens-row-aside">{formatAmounts([{ quantity: ing.quantity, unit: ing.unit }])}</div></>); }} />
    </>
  );
}

function Steps() {
  const { state } = useLens();
  const id = String(state.screen.params?.recipeId ?? "");
  const page = Number(state.screen.params?.page ?? 0);
  const r = recipeOf(state, id);
  if (!r) return null;
  const pages = paginateSteps(r.steps);
  const chunk = pages[Math.min(page, pages.length - 1)] ?? [];
  let n = 1;
  for (let i = 0; i < page; i += 1) n += pages[i].filter((s) => !s.startsWith("…")).length;
  return (
    <div>
      <p className="lens-sub">{r.title}</p>
      <ol style={{ margin: "12px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 14 }}>
        {chunk.map((s, i) => { const num = s.startsWith("…") ? null : n++; return <li key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr", gap: 12, fontSize: 25, lineHeight: 1.3 }}><span style={{ color: "var(--lens-accent)", fontWeight: 700 }}>{num ?? ""}</span><span>{s}</span></li>; })}
      </ol>
    </div>
  );
}

function Added() {
  const { state } = useLens();
  const left = state.list.filter((i) => !i.done).length;
  return <Center><div className="lens-badge is-ok"><Check aria-hidden /></div><h2 className="lens-title">Added to shopping list</h2><p className="lens-sub">{left} item{left === 1 ? "" : "s"} planned · ticks off in Grocery</p></Center>;
}

// ── Wallet ───────────────────────────────────────────────────────────────────

function WalletTray() {
  const { state } = useLens();
  const w = state.wallet;
  if (w.status === "ready") {
    return (
      <>
        <div className="lens-card" style={{ gridTemplateColumns: "1fr auto", display: "grid", alignItems: "center" }}>
          <div><div style={{ fontSize: 30, fontWeight: 700 }}>{w.brand ?? "Card"} •• {w.last4}</div><div className="lens-sub">Ready · saved with Stripe</div></div>
          <span className="lens-tag is-pay">Ready</span>
        </div>
        <Rows />
      </>
    );
  }
  return (
    <Center>
      <div className="lens-badge is-pay" style={{ background: "transparent", border: "3px solid rgba(99,91,255,0.8)", color: "#c9c5ff" }}>•••</div>
      <h2 className="lens-title is-wrap" style={{ fontSize: 34 }}>{w.status === "signed-out" ? "Sign in to use your wallet" : w.status === "not-ready" ? "No saved card yet" : "Checking your wallet…"}</h2>
      <p className="lens-sub is-wrap">One-time setup happens on your phone. Card details stay with Stripe.</p>
    </Center>
  );
}

function OrderReceipt() {
  const { state } = useLens();
  const id = String(state.screen.params?.orderId ?? "");
  const o = state.wallet.orders.find((x) => x.id === id);
  if (!o) return <Center><p className="lens-sub">Order not found</p></Center>;
  return (
    <div>
      <div className="lens-figure is-mid">{formatCents(o.totalCents)}</div>
      <p className="lens-sub">{o.merchantName} · Ref {o.reference}</p>
      <div className="lens-card" style={{ fontSize: 23 }}>
        {o.lines.slice(0, 3).map((l) => <Row key={l.name} k={`${l.quantity} × ${l.name}`} v={formatCents(l.lineTotalCents)} />)}
        <Row k="Payment" v={o.paymentStatus} /><Row k="Fulfillment" v={o.fulfillmentStatus} />
      </div>
      <p className="lens-sub" style={{ fontSize: 19, marginTop: 8 }}>{o.cardSummary ?? ""} · Payments by Stripe · sandbox</p>
    </div>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────

function Composer() {
  const { state, actions, focusId, activate } = useLens();
  const c = state.composer!;
  const keys = actions.filter((a) => a.id.startsWith("key-") && !["key-page", "key-delete", "key-done", "key-cancel"].includes(a.id));
  const wide = actions.filter((a) => a.id === "key-page" || a.id === "key-delete");
  return (
    <div>
      <div className="lens-field" style={{ borderRadius: 18 }}>{c.value ? c.value : <span className="is-placeholder">{c.field.startsWith("price") ? "Price in dollars" : "Type to search"}</span>}<span className="is-caret" aria-hidden /></div>
      <div className="lens-keys" role="group" aria-label="Keys">
        {keys.map((a) => <button key={a.id} type="button" className={clsx("lens-key", focusId === a.id && "is-focused")} data-action-id={a.id} onClick={() => activate(a.id)}>{a.label}</button>)}
        {wide.map((a) => <button key={a.id} type="button" className={clsx("lens-key is-wide", focusId === a.id && "is-focused")} data-action-id={a.id} onClick={() => activate(a.id)}>{a.label}</button>)}
      </div>
    </div>
  );
}
