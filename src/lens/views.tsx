"use client";

import clsx from "clsx";
import { motion } from "motion/react";
import {
  AlertCircle, AlertTriangle, ArrowUp, Bookmark, BookmarkCheck, Check, ChevronDown, CircleCheck, CornerUpLeft, CornerUpRight, Delete,
  ListChecks, LocateFixed, MapPin, Minus, Navigation, Plus, Receipt, ScanLine, ShoppingBag, ShoppingCart, Smartphone, Sparkles, Undo2, UtensilsCrossed, Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { CATALOG_BY_ID, GROCERY_CATALOG, HOME_STORE, STORES } from "@/data/grocery";
import type { NormalizedBox, Offer } from "@/data/types";
import { cartTotals } from "@/domain/grocery/cart";
import { aisleStops, homeStoreStock } from "@/domain/grocery/list";
import { storesByDistance } from "@/domain/grocery/stores";
import { formatAmounts, paginateSteps, scaleIngredients } from "@/domain/gourmet/list";
import { formatCents } from "@/domain/money";
import { useLens } from "./LensProvider";
import { compareOffers, currentOffer, groceryOnline, isPayable, payingFor } from "./screens";
import type { LensState } from "./types";
import {
  Act, AMBER, BLUE, BottomRow, CardButtons, CardSkeleton, Center, Eyebrow, FrameCrop, LensField, OfferCard, OfferPhoto, Pill, RowList, Spinner,
  SUCCESS_GREEN, useAction, type CardLayout,
} from "./ui";

/**
 * Every lens screen, laid out as in the original Glance lens: absolute positions on the
 * 600×600 panel, the top bar above (Lens.tsx), content from y≈68, and one bottom row of
 * pills. Each control is an action from screens.ts, rendered by id.
 */

export function ScreenBody() {
  const { state } = useLens();
  if (state.composer) return <Composer />;
  switch (state.screen.id) {
    case "picker": return <ModeWheel />;
    case "glimpse": return <GlimpseScan />;
    case "glimpse-candidates": return <GlimpseCandidates />;
    case "glimpse-offers": return <GlimpseOffers />;
    case "online-listings": return <OnlineListings />;
    case "glimpse-cart": return <GlimpseCart />;
    case "glimpse-cart-item": return <GlimpseCartItem />;
    case "handoff": return <HandoffDone />;
    case "grocery": return <GroceryCart />;
    case "grocery-item": return <GroceryItem />;
    case "grocery-compare": return <GroceryCompare />;
    case "grocery-edit": return <GroceryEdit />;
    case "grocery-manual": return <GroceryManual />;
    case "grocery-list": return <GroceryList />;
    case "grocery-checkout": return <GroceryCheckout />;
    case "grocery-bought": return <GroceryBought />;
    case "grocery-find": return <GroceryFind />;
    case "gourmet": return <GourmetHome />;
    case "gourmet-recipes": return <GourmetRecipes />;
    case "gourmet-recipe": return <GourmetRecipe />;
    case "gourmet-steps": return <GourmetSteps />;
    case "gourmet-shop": return <GourmetShop />;
    case "gourmet-added": return <GourmetAdded />;
    case "stores": return <StoresNearby />;
    case "nav": return <NavHandoff />;
    case "wallet": return <WalletTray />;
    case "wallet-orders": return <WalletOrders />;
    case "wallet-order": return <OrderReceipt />;
    default: return <><Center><p className="text-[34px] font-semibold">Nothing here yet</p></Center><BottomRow><Pill id="done" className="w-[260px]" /></BottomRow></>;
  }
}

const HEADLINE = "font-semibold tracking-[-0.02em]";

function recipeOf(state: LensState, id: string) {
  return state.gourmet.recipes.find((r) => r.id === id) ?? state.gourmet.saved.find((r) => r.id === id) ?? null;
}

/** Where frames come from; the glasses camera (through the phone) is the only native source. */
export function cameraLine(state: LensState): string {
  if (state.capture === "sample") return "Sample scenario";
  if (state.capture === "webcam") return "Camera";
  switch (state.pairing.status) {
    case "connected": return "Glasses camera live";
    case "awaiting-camera": return "Starting the glasses camera…";
    case "waiting": return "Open Glance on your phone";
    case "stale": return "Camera paused · check your phone";
    case "reconnecting": return "Reconnecting…";
    case "unavailable": return "Can’t reach Glance";
    default: return "Glasses";
  }
}

const cameraDown = (state: LensState) => state.capture === "native" && state.pairing.status !== "connected";

/** A camera problem in one quiet line, on screens that need the camera. */
function CameraNote({ className }: { className?: string }) {
  const { state } = useLens();
  if (!cameraDown(state)) return null;
  return (
    <p className={clsx("flex items-center justify-center gap-2.5 text-[22px] font-medium", className)} style={{ color: AMBER }} role="status">
      <Smartphone className="size-[24px]" aria-hidden /> {cameraLine(state)}
    </p>
  );
}

function DoneCheck({ size = 116 }: { size?: number }) {
  return (
    <span className="glance-rise flex shrink-0 items-center justify-center rounded-full" style={{ background: SUCCESS_GREEN, width: size, height: size }} aria-hidden>
      <Check className="text-[#06210f]" style={{ width: size * 0.62, height: size * 0.62 }} strokeWidth={3.2} />
    </span>
  );
}

/** A full-width list row that isn't an item (Scan again, Search online, Find next item…). */
function QuietRow({ id, children }: { id: string; children?: ReactNode }) {
  return <Act id={id} className="flex size-full items-center justify-center gap-3 rounded-[24px] text-[27px] font-semibold ring-2 ring-white/25">{children}</Act>;
}

/* ── Mode picker ──────────────────────────────────────────────────────────── */

const WHEEL_ROW = 128;
const WHEEL_CENTER = 300;

/**
 * The modes as a vertical wheel filling the lens: the selected one centred, larger and
 * brighter; the others recede (smaller, dimmer, tilted away).
 */
function ModeWheel() {
  const { actions, focusId, state } = useLens();
  const modes = actions.filter((a) => a.id.startsWith("mode-"));
  const selected = Math.max(0, modes.findIndex((a) => a.id === focusId));
  const reduced = state.reducedMotion;
  const live = state.capture === "webcam" || state.pairing.status === "connected";
  return (
    <div className="absolute inset-0" aria-label="Choose a mode">
      <div className="absolute top-9 left-11 opacity-80"><Wordmark size={40} /></div>
      <p className="absolute top-12 right-11 text-[22px] font-medium text-white/50" aria-hidden>↑ ↓ · select</p>
      <p className="absolute right-0 bottom-9 left-0 text-center text-[21px] font-medium text-white/55" role="status">
        {live ? <span style={{ color: BLUE }}>● {cameraLine(state)}</span> : cameraLine(state)}
      </p>
      {/* Clipped above the status line, so a receding mode never runs into it. */}
      <div className="absolute inset-x-0 top-[96px] bottom-[84px] overflow-hidden">
      <motion.ul
        className="absolute right-0 left-0"
        style={{ top: WHEEL_CENTER - WHEEL_ROW / 2 - 96, perspective: 900 }}
        animate={{ y: -selected * WHEEL_ROW }}
        transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
      >
        {modes.map((a, i) => {
          const distance = Math.abs(i - selected);
          const isSelected = i === selected;
          return (
            <motion.li
              key={a.id}
              className="flex items-center justify-center"
              style={{ height: WHEEL_ROW, transformOrigin: "center" }}
              animate={{ scale: isSelected ? 1 : 0.62, opacity: isSelected ? 1 : distance === 1 ? 0.45 : 0.25, rotateX: reduced ? 0 : (i - selected) * -28 }}
              transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 38 }}
            >
              <Act id={a.id} className="flex flex-col items-center rounded-[30px] px-10 py-2">
                <span className="text-[78px] leading-none font-semibold tracking-[-0.035em] text-white">{a.label}</span>
                <span className="mt-2 text-[26px] font-medium" style={{ color: isSelected ? BLUE : "transparent" }}>{a.hint}</span>
              </Act>
            </motion.li>
          );
        })}
      </motion.ul>
      </div>
    </div>
  );
}

export function Wordmark({ size, className }: { size: number; className?: string }) {
  return (
    <span className={className} style={{ fontSize: size, lineHeight: 1 }}>
      <span className="inline-flex items-baseline font-semibold tracking-[-0.02em] text-white">
        <svg viewBox="0 0 46 74" aria-hidden style={{ width: "0.46em", height: "0.74em", verticalAlign: "-0.3em", marginRight: "0.02em", overflow: "visible" }}>
          <g fill="none" stroke="currentColor" strokeWidth={4.6} strokeLinecap="round">
            <circle cx={22} cy={22} r={15} fill={`${BLUE}2e`} />
            <line x1={22} y1={37} x2={22} y2={48} />
            <ellipse cx={22} cy={60} rx={18} ry={12} fill={`${BLUE}2e`} />
            <line x1={35} y1={12} x2={45} y2={7} />
          </g>
        </svg>
        <span>lance</span>
      </span>
    </span>
  );
}

/* ── Glimpse: looking ─────────────────────────────────────────────────────── */

function GlimpseScan() {
  const { state, snapshot } = useLens();
  const g = state.glimpse;
  const top = g.scan === "result" ? g.candidates.find((c) => c.id === g.chosenId) ?? g.candidates[0] : undefined;

  if (!top) {
    const scanning = g.scan === "scanning";
    const failed = g.scan === "error";
    const nothing = g.scan === "result" || g.scan === "no-food";
    return (
      <>
        <Center>
          {scanning ? <Spinner purpose="scan" /> : failed ? <AlertCircle className="size-[76px]" style={{ color: AMBER }} strokeWidth={1.7} aria-hidden /> : <ScanLine className="size-[76px]" style={{ color: BLUE }} strokeWidth={1.6} aria-hidden />}
          <p className={clsx("mt-7 text-[42px]", HEADLINE)} role="status">
            {scanning ? "Scanning item…" : failed ? "Couldn’t scan" : nothing ? "No item found" : "Point at an item"}
          </p>
          <p className="mt-3 line-clamp-2 text-[25px] text-white/60">
            {scanning ? "Hold still while Glance identifies it" : failed ? g.error ?? "Try again" : nothing ? "Move closer and try scanning again" : "Choose Scan item when it’s in view"}
          </p>
        </Center>
        <CameraNote className="absolute right-11 bottom-[142px] left-11" />
        <BottomRow><Pill id={scanning ? "scan-cancel" : "scan"} className="w-[320px]" /></BottomRow>
      </>
    );
  }

  const rest = g.candidates.filter((c) => c.id !== top.id);
  return (
    <>
      <div className="absolute top-[86px] right-11 left-11 flex gap-6" data-candidate={top.id}>
        {snapshot && <FrameCrop src={snapshot} box={top.box} size={176} />}
        <div className="min-w-0 flex-1 pt-1">
          <p className="line-clamp-3 text-[46px] leading-[1.05] font-semibold tracking-[-0.03em]">{top.label}</p>
          {/* One short line: what else is in view (the wearer may mean that instead). */}
          {rest.length > 0 && <p className="mt-3 truncate text-[23px] text-white/50">Also: {rest.slice(0, 2).map((c) => c.label.toLowerCase()).join(", ")}</p>}
        </div>
      </div>
      <div className="absolute right-11 bottom-[156px] left-11 flex justify-center">
        <Pill id="scan" className="h-[64px] px-7 text-[26px]" icon={<ScanLine className="size-[28px]" aria-hidden />} />
      </div>
      <BottomRow>
        <Pill id="see-offers" className="flex-[1.35] px-5" icon={<ShoppingBag className="size-[30px]" strokeWidth={2.2} aria-hidden />} />
        <Pill id="not-this" className="flex-1 px-5" />
      </BottomRow>
    </>
  );
}

/* ── Glimpse: "Not this" ──────────────────────────────────────────────────── */

function GlimpseCandidates() {
  const { state, snapshot } = useLens();
  const list = state.glimpse.frozenCandidates ?? state.glimpse.candidates;
  const ids = [...list.map((c) => `cand-${c.id}`), "keep-looking"];
  return (
    <>
      <p className={clsx("absolute top-[74px] right-11 left-11 text-[34px]", HEADLINE)}>What caught your eye?</p>
      <RowList
        ids={ids}
        rowHeight={92}
        top={136}
        bottom={40}
        renderRow={(id) => {
          const c = list.find((x) => `cand-${x.id}` === id);
          if (!c) return <QuietRow id={id}>Scan again</QuietRow>;
          return (
            <Act id={id} className="flex size-full items-center gap-5 rounded-[26px] bg-white/[0.07] pr-6 pl-2.5 text-left">
              {snapshot ? <FrameCrop src={snapshot} box={c.box} size={72} radius={18} /> : <span className="w-2" />}
              <span className="min-w-0 flex-1 truncate text-[30px] leading-tight font-semibold tracking-[-0.015em]">{c.label}</span>
            </Act>
          );
        }}
      />
    </>
  );
}

/* ── Offer cards (Glimpse offers, online listings, cart items) ────────────── */

/** The line under the chips for a buy-in-lens offer: the card it will charge, or the quote. */
function payNote(state: LensState, offer: Offer): ReactNode {
  if (!isPayable(offer)) return null;
  const p = state.payment;
  if (p.offerId === offer.id && p.quote) return <span>total {p.quote.shippingCents ? `incl. ${formatCents(p.quote.shippingCents)} shipping` : "· free shipping"}</span>;
  if (state.wallet.status === "ready" && state.wallet.last4) return <span>{state.wallet.brand ?? "Card"} •• {state.wallet.last4} · Stripe</span>;
  return <span>Set up your wallet to buy here</span>;
}

/** Card screens: the card, or (once Buy is pressed) where the payment is. */
function CardScreen({ list, arriving, layout, secondary, snapshot, box }: { list: Offer[]; arriving: boolean; layout: CardLayout; secondary: "cart-add" | "cart-remove"; snapshot?: string | null; box?: NormalizedBox }) {
  const { state } = useLens();
  const offer = currentOffer(state);
  if (!offer) return null;
  if (payingFor(state, offer)) return <PaymentSurface offer={offer} />;
  return (
    <>
      <OfferCard offers={list} offer={offer} arriving={arriving} layout={layout} snapshot={snapshot} box={box} note={payNote(state, offer)} />
      <CardButtons secondary={secondary} single={list.length < 2} />
    </>
  );
}

const OFFERS_LAYOUT: CardLayout = { top: 130, photo: 184 };

function GlimpseOffers() {
  const { state, snapshot } = useLens();
  const g = state.glimpse;
  const selected = g.candidates.find((c) => c.id === g.chosenId) ?? g.candidates[0];
  const label = g.offersQuery ?? selected?.label ?? "Item";
  const paying = payingFor(state, currentOffer(state));

  const chip = !paying && (
    <div className="absolute top-[68px] right-11 left-11 flex justify-center">
      <Act id="change" label={`${label}: change item`} className="flex max-w-full min-w-0 items-center gap-2 rounded-full px-5 py-1.5 text-[23px] font-medium text-white/75 ring-2 ring-white/25">
        <span className="truncate">{label}</span>
        <ChevronDown className="size-[22px] shrink-0" aria-hidden />
      </Act>
    </div>
  );

  if (!g.offers.length) {
    if (g.offersStatus === "loading" || !g.offersQuery) {
      return (
        <>
          {chip}
          <CardSkeleton layout={OFFERS_LAYOUT} snapshot={snapshot} box={selected?.box} />
          <p className="absolute right-11 bottom-[72px] left-11 flex items-center justify-center gap-3 text-[24px] text-white/55" role="status"><Spinner small /> Finding offers…</p>
        </>
      );
    }
    const failed = g.offersStatus === "error";
    return (
      <>
        {chip}
        <div className="absolute right-11 left-11 flex gap-6" style={{ top: OFFERS_LAYOUT.top }}>
          <OfferPhoto snapshot={snapshot} box={selected?.box} size={OFFERS_LAYOUT.photo} />
          <div className="min-w-0 flex-1 pt-2">
            <p className={clsx("text-[32px] leading-tight", HEADLINE)} role="alert">{failed ? "Couldn’t load offers" : "No offers found"}</p>
            <p className="mt-2 line-clamp-3 text-[22px] leading-snug text-white/55">{failed ? g.error ?? "Check the connection and try again." : "Try again, or search with your own words."}</p>
          </div>
        </div>
        <BottomRow>
          <Pill id="retry-offers" className="flex-1" />
          <Pill id="search-online" className="flex-1" />
        </BottomRow>
      </>
    );
  }

  return (
    <>
      {chip}
      <CardScreen list={g.offers} arriving={g.offersStatus === "loading"} layout={OFFERS_LAYOUT} secondary="cart-add" snapshot={snapshot} box={selected?.box} />
    </>
  );
}

/** Below the search field: the same card as Glimpse offers, a little smaller. */
const LISTINGS_LAYOUT: CardLayout = { top: 162, photo: 164 };

function OnlineListings() {
  const { state } = useLens();
  const l = state.listings;
  const paying = payingFor(state, currentOffer(state));
  const search = !paying && (
    <div className="absolute top-[68px] right-11 left-11">
      <LensField id="search" placeholder="Search for an item" />
    </div>
  );

  if (!l.offers.length) {
    if (l.status === "loading") {
      return (
        <>
          {search}
          <CardSkeleton layout={LISTINGS_LAYOUT} />
          <p className="absolute right-11 bottom-[72px] left-11 flex items-center justify-center gap-3 text-[24px] text-white/55" role="status"><Spinner small /> Searching stores…</p>
        </>
      );
    }
    if (l.status === "idle") {
      return (
        <>
          {search}
          <Center className="top-[170px]">
            <ShoppingBag className="size-[64px] text-white/35" strokeWidth={1.6} aria-hidden />
            <p className="mt-5 text-[26px] leading-snug text-white/60">Type a brand, model or size.<br />Glance searches real stores.</p>
          </Center>
          <BottomRow><Pill id="go" className="w-[300px]" /></BottomRow>
        </>
      );
    }
    const failed = l.status === "error";
    return (
      <>
        {search}
        <div className="absolute right-11 left-11 flex gap-6" style={{ top: LISTINGS_LAYOUT.top }}>
          <OfferPhoto size={LISTINGS_LAYOUT.photo} />
          <div className="min-w-0 flex-1 pt-2">
            <p className={clsx("text-[32px] leading-tight", HEADLINE)} role="alert">{failed ? "Couldn’t search" : "No listings found"}</p>
            <p className="mt-2 line-clamp-3 text-[22px] leading-snug text-white/55">{failed ? l.error ?? "Check the connection and try again." : "Try a brand, model or size."}</p>
          </div>
        </div>
        <BottomRow><Pill id="retry" className="w-[300px]" /></BottomRow>
      </>
    );
  }

  return (
    <>
      {search}
      <CardScreen list={l.offers} arriving={l.status === "loading"} layout={LISTINGS_LAYOUT} secondary="cart-add" />
    </>
  );
}

/* ── Glimpse cart ─────────────────────────────────────────────────────────── */

function GlimpseCart() {
  const { state } = useLens();
  const items = state.glimpse.saved;
  if (!items.length) {
    return (
      <>
        <Center>
          <ShoppingCart className="size-[68px] text-white/40" strokeWidth={1.6} aria-hidden />
          <p className={clsx("mt-5 text-[38px]", HEADLINE)}>Your cart is empty</p>
        </Center>
        <BottomRow><Pill id="keep-shopping" className="w-[300px]" /></BottomRow>
      </>
    );
  }
  // Integer cents; an unknown price is never counted as zero.
  const knownCents = items.reduce((sum, o) => sum + (o.priceCents ?? 0), 0);
  const unpriced = items.filter((o) => o.priceCents === null).length;
  return (
    <>
      <div className="absolute top-[72px] right-11 left-11 flex items-baseline justify-between gap-4">
        <p className={clsx("text-[34px]", HEADLINE)}>Cart <span className="text-white/45 tabular-nums">· {items.length}</span></p>
        <p className="text-[34px] font-bold tracking-[-0.02em] tabular-nums" data-cart-total>
          {formatCents(knownCents)}
          {unpriced > 0 && <span className="ml-2 text-[19px] font-medium text-white/45">+ {unpriced} unpriced</span>}
        </p>
      </div>
      <RowList
        ids={items.map((o) => `saved-${o.id}`)}
        rowHeight={96}
        top={136}
        bottom={40}
        renderRow={(id, i) => {
          const o = items[i];
          return (
            <Act id={id} className="flex size-full items-center gap-5 rounded-[26px] bg-white/[0.07] pr-6 pl-2.5 text-left">
              <OfferPhoto image={o.imageUrl} size={76} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[25px] leading-tight font-semibold">{o.name}</span>
                <span className="block truncate text-[20px] text-white/55">{o.retailer}</span>
              </span>
              <span className="shrink-0 text-[28px] font-bold tabular-nums">{o.priceCents === null ? <span className="text-[22px] font-semibold text-white/55">See price</span> : formatCents(o.priceCents)}</span>
            </Act>
          );
        }}
      />
    </>
  );
}

const CART_ITEM_LAYOUT: CardLayout = { top: 124, photo: 184 };

function GlimpseCartItem() {
  const { state } = useLens();
  const offer = currentOffer(state);
  if (!offer) {
    return (
      <>
        <Center><p className={clsx("text-[36px]", HEADLINE)}>Removed from cart</p></Center>
        <BottomRow><Pill id="keep-shopping" className="w-[300px]" /></BottomRow>
      </>
    );
  }
  const saved = state.glimpse.saved.find((o) => o.id === offer.id);
  return (
    <>
      {!payingFor(state, offer) && <p className="absolute top-[76px] right-11 left-11 truncate text-center text-[22px] text-white/50">{saved?.candidateLabel}</p>}
      <CardScreen list={state.glimpse.saved} arriving={false} layout={CART_ITEM_LAYOUT} secondary="cart-remove" />
    </>
  );
}

/* ── Payment (Buy pressed on a buy-in-lens offer) ─────────────────────────── */

function PaymentSurface({ offer }: { offer: Offer }) {
  const { state } = useLens();
  const p = state.payment;
  const total = p.order?.totalCents ?? p.quote?.totalCents ?? offer.priceCents;
  const done = p.status === "confirmed" || p.status === "accepted";
  const problem = p.status === "needs-action" || p.status === "error" || p.status === "recovery";
  const title = p.status === "pending" ? "Paying…" : done ? "Done!" : p.status === "needs-action" ? "Quick check" : p.status === "recovery" ? "Price changed" : "Didn’t go through";
  const line = done
    ? (p.status === "accepted" ? "Order accepted" : "Payment confirmed · waiting for the seller")
    : p.status === "needs-action" ? "Your bank wants to verify on your phone. Your order is saved."
    : problem ? p.error ?? "Your selection is kept." : `${offer.retailer} · Payments by Stripe`;
  return (
    <>
      <div className="absolute top-[78px] right-11 left-11 flex flex-col items-center text-center">
        {p.status === "pending" ? <span className="flex size-[116px] items-center justify-center"><Spinner /></span>
          : done ? <DoneCheck />
          : <AlertCircle className="size-[116px]" style={{ color: AMBER }} strokeWidth={1.6} aria-hidden />}
        <p className="mt-5 text-[60px] leading-none font-bold tracking-[-0.03em]" role="status">{title}</p>
        <p className="mt-4 line-clamp-1 max-w-full text-[27px] font-medium text-white/85">{offer.name}</p>
        <p className="mt-1 text-[25px] text-white/60">{offer.retailer} · <span className="font-semibold text-white tabular-nums">{formatCents(total)}</span></p>
      </div>
      <p className="absolute right-11 bottom-[142px] left-11 line-clamp-2 text-center text-[22px] font-medium text-white/70" data-payment-status={p.status}>
        {line}{done && p.order?.reference ? ` · Ref ${p.order.reference}` : ""}
      </p>
      <BottomRow>
        <Pill id="pay-wait" className="w-[300px]" />
        <Pill id="pay-recover" className="flex-[1.4]" />
        <Pill id="pay-done" className="flex-1" />
        <Pill id="pay-orders" className="flex-1" />
        <Pill id="pay-retry" className="flex-1" />
        <Pill id="pay-back" className="flex-1" />
      </BottomRow>
    </>
  );
}

/* ── Done: the link is on the wearer's phone ──────────────────────────────── */

function HandoffDone() {
  const { state } = useLens();
  const h = state.handoff;
  const failed = h.status === "failed";
  const status = h.status === "sent" ? (state.pairing.code ? "Sent to your phone" : "Opened on this device")
    : h.status === "queued" ? "Open Glance on your phone to finish"
    : failed ? h.error ?? "Couldn’t reach your phone"
    : "Sending to your phone…";
  return (
    <>
      <div className="absolute top-[78px] right-11 left-11 flex flex-col items-center text-center">
        {failed ? <AlertCircle className="size-[116px]" style={{ color: AMBER }} strokeWidth={1.6} aria-hidden /> : <DoneCheck />}
        <p className="mt-5 text-[60px] leading-none font-bold tracking-[-0.03em]">{failed ? "Not sent" : "Done!"}</p>
        {h.title && <p className="mt-4 line-clamp-2 max-w-full text-[27px] font-medium text-white/85">{h.title}</p>}
      </div>
      <p className="absolute right-11 bottom-[142px] left-11 flex items-center justify-center gap-2.5 text-[23px] font-medium text-white/75" role="status" data-handoff-status={h.status}>
        {h.status === "sending" ? <Spinner small /> : <Smartphone className="size-[26px] shrink-0" style={{ color: failed ? AMBER : BLUE }} aria-hidden />}
        <span className="truncate">{status}</span>
      </p>
      <BottomRow>
        {failed ? <><Pill id="retry" className="flex-1" /><Pill id="done" className="flex-1" /></> : <><Pill id="done" className="flex-1" /><Pill id="keep" className="flex-[1.3]" /></>}
      </BottomRow>
    </>
  );
}

/* ── Grocery: the cart ────────────────────────────────────────────────────── */

function lineNote(l: { priceSource: string; packageSize: string | null }) {
  if (l.priceSource === "unknown") return "Price unknown";
  if (l.priceSource === "shelf-label") return "From shelf label";
  if (l.priceSource === "manual") return "Entered";
  if (l.priceSource === "online") return `Online price${l.packageSize ? ` · ${l.packageSize}` : ""}`;
  return l.packageSize ?? "";
}

function GroceryCart() {
  const { state } = useLens();
  const gr = state.grocery;
  const t = cartTotals(gr.cart);
  const { action: undo } = useAction("undo");
  const pending = gr.pendingAsk;
  const listTop = pending ? 348 : 268;
  const openList = state.list.filter((i) => !i.done).length;
  const estimated = t.unknownLines > 0 || gr.cart.some((l) => l.priceSource === "shelf-label" || l.priceSource === "online");

  return (
    <>
      <div className="absolute top-[66px] right-11 left-11 flex h-[44px] items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-[22px] text-white/70" role="status">
          {gr.scanning && <Spinner small purpose="scan" />}
          <span className="truncate">{cameraDown(state) ? cameraLine(state) : gr.scanning ? "Scanning for items…" : "Scanning paused"}</span>
        </p>
        <Act id="scan" className="flex h-[44px] shrink-0 items-center rounded-full px-4 text-[21px] font-semibold ring-2 ring-white/30" />
      </div>
      <div className="absolute top-[120px] right-11 left-11 flex items-end justify-between">
        <div>
          <p className="text-[28px] font-medium text-white/70">Your cart</p>
          <p className="text-[84px] leading-[0.95] font-bold tracking-[-0.045em] tabular-nums">
            {formatCents(t.knownSubtotalCents)}
            {estimated && gr.cart.length > 0 && <span className="ml-3 align-top text-[26px] font-semibold tracking-normal" style={{ color: BLUE }}>est.</span>}
          </p>
        </div>
        <div className="pb-2 text-right text-[22px] leading-snug text-white/55">
          {undo && (
            <Act id="undo" label="Undo" className="mb-2 ml-auto flex w-fit items-center gap-1.5 rounded-full px-3.5 py-1 text-[20px] font-semibold text-white/85 ring-2 ring-white/35">
              <Undo2 className="size-[20px]" aria-hidden /> Undo
            </Act>
          )}
          {t.units} item{t.units === 1 ? "" : "s"}
          {t.unknownLines > 0 && <><br />+{t.unknownLines} unpriced</>}
          {gr.cart.some((l) => l.priceSource === "catalog") && state.capture === "sample" && <><br />sample prices</>}
          {gr.cart.some((l) => l.priceSource === "online") && <><br />online prices</>}
        </div>
      </div>

      {pending && (
        <div className="absolute top-[250px] right-11 left-11 flex items-center gap-4 rounded-[26px] bg-white/[0.08] py-3 pr-3 pl-6">
          <p className="min-w-0 flex-1 text-[24px] leading-tight">Did <b className="font-semibold">{pending.label}</b> go in the cart?</p>
          <Pill id="ask-yes" className="h-[64px] px-6 text-[24px]" />
          <Pill id="ask-no" className="h-[64px] px-6 text-[24px]" />
        </div>
      )}

      {gr.cart.length === 0 ? !pending && (
        <div className="absolute right-11 left-11 text-center" style={{ top: listTop + 20 }}>
          <ShoppingCart className="mx-auto size-[56px] text-white/35" strokeWidth={1.6} aria-hidden />
          <p className="mt-4 text-[26px] leading-snug text-white/60">{cameraDown(state) ? "Waiting for the glasses camera." : gr.scanning ? "Hold an item up, then put it in your cart." : "Start scan, then hold an item up."}</p>
          <p className="mt-1 text-[22px] text-white/40">Seeing or holding never adds by itself.</p>
        </div>
      ) : (
        <RowList
          ids={gr.cart.map((l) => `line-${l.productKey}`)}
          rowHeight={66}
          gap={10}
          top={listTop}
          bottom={140}
          renderRow={(id, i) => {
            const l = gr.cart[i];
            return (
              <Act id={id} className="flex size-full items-center gap-4 rounded-[20px] bg-white/[0.06] px-6 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[27px] leading-tight font-semibold">{l.label} {l.quantity > 1 && <span className="font-medium text-white/60">×{l.quantity}</span>}</span>
                  <span className="block truncate text-[19px] text-white/50">{lineNote(l)}</span>
                </span>
                <span className="text-[28px] font-semibold tabular-nums">{l.unitPriceCents === null ? "—" : formatCents(l.unitPriceCents * l.quantity)}</span>
              </Act>
            );
          }}
        />
      )}

      <div className="absolute right-11 bottom-11 left-11 flex items-center gap-3">
        <Pill id="list" className="h-[76px] flex-1 px-4 text-[25px]" icon={<ListChecks className="size-[26px]" aria-hidden />}>
          List{openList > 0 && <span className="ml-2 tabular-nums" style={{ color: BLUE }}>{openList}</span>}
        </Pill>
        <Pill id="add" className="h-[76px] flex-1 px-4 text-[25px]" icon={<Plus className="size-[26px]" aria-hidden />} />
        <Pill id="finish" className="h-[76px] flex-[1.4] px-4 text-[25px]" />
      </div>
    </>
  );
}

/* ── Grocery: the item held up ────────────────────────────────────────────── */

function GroceryItem() {
  const { state } = useLens();
  const key = String(state.screen.params?.productKey ?? "");
  const product = CATALOG_BY_ID[key];
  const insight = state.grocery.insights[key]?.data ?? null;
  const isHeld = state.grocery.heldKey === key;
  const name = product?.name ?? (isHeld ? state.grocery.heldLabel : null) ?? key;
  const size = product?.size ?? (isHeld ? state.grocery.heldSize : null);
  const held = isHeld ? state.grocery.heldPrice ?? null : null;
  const inCart = state.grocery.cart.find((l) => l.productKey === key);
  const sample = state.capture === "sample";

  // Sample: this store's price, then nearby stores and online retailers (sample prices).
  // Live: the shelf label Claude read, then online listings, then a marked "≈" typical price.
  const here = insight?.homePriceCents ?? product?.qfcPriceCents ?? null;
  const live = groceryOnline(state, key);
  const online = live?.offers.filter((o) => o.priceCents !== null) ?? [];
  const price: { cents: number; note: string; approx?: boolean } | null =
    !sample && held?.source === "shelf-label" ? { cents: held.cents, note: "shelf label" }
    : sample && here !== null ? { cents: here, note: `${HOME_STORE} · sample` }
    : online[0] ? { cents: online[0].priceCents!, note: `online · ${online[0].retailer}` }
    : held ? { cents: held.cents, note: held.source === "estimate" ? "typical price" : "shelf label · est.", approx: held.source === "estimate" }
    : here !== null ? { cents: here, note: HOME_STORE }
    : null;
  // A two-line nudge takes the third comparison row's space (the full list is on Compare).
  const rowLimit = insight?.nudge ? 2 : 3;
  const same = sample ? compareOffers(state, key).filter((c) => c.match === "same") : [];
  const cheapest = same.length ? Math.min(...same.map((c) => c.priceCents)) : null;
  const rows = sample
    ? same.slice(0, rowLimit).map((c) => ({ key: c.store, name: c.store, cents: c.priceCents, best: c.priceCents === cheapest && (here === null || c.priceCents < here) }))
    : online.slice(0, rowLimit).map((o, i) => ({ key: o.id, name: o.retailer, cents: o.priceCents!, best: i === 0 }));

  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className="truncate text-[40px] leading-[1.05] font-semibold tracking-[-0.025em]">{name}</p>
        <p className="mt-0.5 truncate text-[21px] text-white/55">
          <span style={{ color: BLUE }}>{isHeld ? "You’re holding" : "Item"}</span> · {size ?? "Size unknown"}
          {inCart && <span className="font-semibold text-white"> · in cart ×{inCart.quantity}</span>}
        </p>
        <p className="mt-1.5 flex items-baseline gap-4">
          <span className="text-[64px] leading-none font-bold tracking-[-0.045em] tabular-nums">{price ? `${price.approx ? "≈ " : ""}${formatCents(price.cents)}` : "Price unknown"}</span>
          {price && <span className="truncate text-[20px] text-white/50">{price.note}</span>}
        </p>
        {rows.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {rows.map((o) => (
              <li key={o.key} className="flex items-baseline justify-between gap-4 text-[23px] text-white/75">
                <span className="truncate">{o.name}</span>
                <span className="flex items-baseline gap-3">
                  {o.best && <span className="text-[19px] font-semibold" style={{ color: BLUE }}>Best</span>}
                  <span className="font-semibold tabular-nums">{formatCents(o.cents)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : live?.status === "loading" ? (
          <p className="mt-3 text-[21px] text-white/50" role="status">Checking prices online…</p>
        ) : null}
        <div className="mt-2"><InsightStrip productKey={key} /></div>
      </div>
      <BottomRow>
        <Pill id="add" className="h-[76px] flex-1" icon={<Plus className="size-[28px]" aria-hidden />} />
        <Pill id="buy-amazon" className="h-[76px] flex-[1.4] text-[27px]" />
        <Pill id="compare" className="h-[76px] flex-1" />
      </BottomRow>
    </>
  );
}

const amount = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** Nutrition (label vs ≈ estimate), up to two diet/allergy flags, and at most one nudge. */
function InsightStrip({ productKey }: { productKey: string }) {
  const { state } = useLens();
  const entry = state.grocery.insights[productKey];
  if (!entry || entry.status === "loading") return <p className="text-[21px] text-white/45" role="status">Checking nutrition…</p>;
  const insight = entry.data;
  if (entry.status === "error" || !insight) return null;
  const n = insight.nutrition;
  const approx = insight.nutritionOrigin === "label" ? "" : "≈ ";
  const parts = n ? [`${approx}${amount(n.kcal)} cal`, `${amount(n.carbs)} g carbs`, n.sugar > 0 && `${amount(n.sugar)} g sugar`, n.protein >= 5 && `${amount(n.protein)} g protein`].filter(Boolean).slice(0, 3) : [];
  // Glanceable: two lines under the price at most (a nudge takes the second flag's place).
  const flags = insight.flags.slice(0, insight.nudge ? 1 : 2);
  return (
    <div className="space-y-1">
      {n && (
        <p className="flex items-baseline gap-3 text-[21px] text-white/75">
          <span className="truncate tabular-nums">{parts.join(" · ")}</span>
          <span className="shrink-0 text-[18px] font-semibold text-white/50">{insight.nutritionOrigin === "label" ? "From the label" : "Estimate"}{state.capture === "sample" && " · sample"}</span>
        </p>
      )}
      {flags.map((f) => (
        <p key={f.text} className="flex items-center gap-2 truncate text-[22px] font-semibold" style={{ color: f.severity === "warn" ? AMBER : "rgb(255 255 255 / 0.75)" }}>
          <AlertTriangle className="size-[22px] shrink-0" aria-hidden /> {f.text}
        </p>
      ))}
      {insight.nudge && (
        <p className="flex items-start gap-2 text-[21px] leading-snug" style={{ color: BLUE }}>
          <Sparkles className="mt-0.5 size-[20px] shrink-0" aria-hidden /> <span className="line-clamp-2">{insight.nudge}</span>
        </p>
      )}
    </div>
  );
}

/* ── Grocery: compare (nearby stores with sample prices, or live online prices) ── */

const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const R = 6371, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

function GroceryCompare() {
  const { state, actions } = useLens();
  const key = String(state.screen.params?.productKey ?? "");
  const product = CATALOG_BY_ID[key];
  const live = groceryOnline(state, key);
  const hasSearch = actions.some((a) => a.id === "search-online");

  if (live) {
    const name = product?.name ?? state.grocery.cart.find((l) => l.productKey === key)?.label ?? state.grocery.heldLabel ?? key;
    const size = product?.size ?? state.grocery.heldSize;
    const priced = live.offers.flatMap((o) => (o.priceCents === null ? [] : [o.priceCents]));
    const cheapest = priced.length ? Math.min(...priced) : null;
    return (
      <>
        <div className="absolute top-[100px] right-11 left-11">
          <p className={clsx("text-[38px]", HEADLINE)}>Prices online</p>
          <p className="mt-0.5 truncate text-[21px] text-white/50">{name}{size ? ` · ${size}` : ""} · web prices · confirm at retailer</p>
        </div>
        {live.status === "loading" && !live.offers.length && (
          <div className="absolute top-[214px] right-11 left-11 flex items-center gap-4 text-[26px] text-white/70" role="status"><Spinner small /> Checking retailers…</div>
        )}
        {live.status !== "loading" && !live.offers.length && (
          <p className="absolute top-[200px] right-11 left-11 text-[24px] text-white/60">{live.status === "error" ? "Couldn’t check prices right now." : "No listings found for this item."}</p>
        )}
        <RowList
          ids={[...live.offers.map((_, i) => `online-${i}`), ...(hasSearch ? ["search-online"] : [])]}
          rowHeight={84}
          top={live.offers.length ? 208 : 290}
          bottom={40}
          renderRow={(id, i) => {
            const o = live.offers[i];
            if (!o) return <QuietRow id={id}>Search online</QuietRow>;
            const best = o.priceCents !== null && o.priceCents === cheapest;
            return (
              <Act id={id} className={clsx("flex size-full items-center gap-4 rounded-[24px] px-6 text-left", best ? "bg-white/[0.1]" : "bg-white/[0.05]")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[28px] leading-tight font-semibold">{o.retailer}</span>
                  <span className="block truncate text-[19px] text-white/55">{o.name}</span>
                </span>
                {best && <span className="text-[20px] font-semibold" style={{ color: BLUE }}>Best</span>}
                <span className="text-[30px] font-semibold tabular-nums">{o.priceCents === null ? "—" : formatCents(o.priceCents)}</span>
              </Act>
            );
          }}
        />
      </>
    );
  }

  const offers = compareOffers(state, key);
  const here = state.grocery.insights[key]?.data?.homePriceCents ?? product?.qfcPriceCents ?? null;
  const sameCheapest = Math.min(...offers.filter((c) => c.match === "same").map((c) => c.priceCents));
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className={clsx("text-[38px]", HEADLINE)}>Nearby & online</p>
        <p className="mt-0.5 truncate text-[21px] text-white/50">{product?.size} · here at {HOME_STORE} {formatCents(here)} · sample prices</p>
      </div>
      <RowList
        ids={offers.map((_, i) => `cmp-${i}`)}
        rowHeight={84}
        top={208}
        bottom={40}
        renderRow={(id, i) => {
          const c = offers[i];
          const store = STORES.find((s) => s.name === c.store);
          const best = c.match === "same" && c.priceCents === sameCheapest;
          const onlineStore = c.store === "Amazon" || c.store === "Temu";
          const where = onlineStore ? "Online · demo buy" : store ? `${km(state.location.lat, state.location.lng, store.lat, store.lng).toFixed(1)} km` : "";
          return (
            <Act id={id} className={clsx("flex size-full items-center gap-4 rounded-[24px] px-6 text-left", best ? "bg-white/[0.1]" : "bg-white/[0.05]")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[28px] leading-tight font-semibold">{c.store}</span>
                <span className="block truncate text-[19px] text-white/55">{c.match === "same" ? `Same item · ${c.size}` : `Alternative · ${c.size}`}{where ? ` · ${where}` : ""}</span>
              </span>
              {best && <span className="text-[20px] font-semibold" style={{ color: BLUE }}>Best</span>}
              <span className="text-[30px] font-semibold tabular-nums">{formatCents(c.priceCents)}</span>
            </Act>
          );
        }}
      />
    </>
  );
}

/* ── Grocery: edit a cart line ────────────────────────────────────────────── */

function GroceryEdit() {
  const { state } = useLens();
  const key = String(state.screen.params?.productKey ?? "");
  const line = state.grocery.cart.find((l) => l.productKey === key);
  if (!line) return <><Center><p className={clsx("text-[36px]", HEADLINE)}>Removed</p></Center><BottomRow><Pill id="done" className="w-[260px]" /></BottomRow></>;
  const note = lineNote(line);
  return (
    <>
      <div className="absolute top-[104px] right-11 left-11 text-center">
        <p className={clsx("truncate text-[38px]", HEADLINE)}>{line.label}</p>
        <p className="text-[22px] text-white/50">{line.unitPriceCents === null ? "Price unknown" : `${formatCents(line.unitPriceCents)} each`}{note ? ` · ${note}` : ""}</p>
      </div>
      <div className="absolute top-[200px] right-11 left-11 flex items-center justify-center gap-10">
        <Act id="qty-minus" label="Fewer" className="flex size-[84px] items-center justify-center rounded-full ring-[3px] ring-white/50"><Minus className="size-[40px]" aria-hidden /></Act>
        <span className="w-[150px] text-center text-[88px] leading-none font-bold tabular-nums">×{line.quantity}</span>
        <Act id="qty-plus" label="More" className="flex size-[84px] items-center justify-center rounded-full ring-[3px] ring-white/50"><Plus className="size-[40px]" aria-hidden /></Act>
      </div>
      <div className="absolute top-[318px] right-16 left-16"><LensField id="price" placeholder="Enter price, e.g. 4.99" /></div>
      <BottomRow>
        <Pill id="remove" className="flex-1" />
        <Pill id="done" className="flex-1" />
      </BottomRow>
    </>
  );
}

/* ── Grocery: add by name ─────────────────────────────────────────────────── */

function GroceryManual() {
  const { state, actions } = useLens();
  const ids = actions.filter((a) => a.listIndex !== undefined).sort((a, b) => a.listIndex! - b.listIndex!).map((a) => a.id);
  return (
    <>
      <p className={clsx("absolute top-[90px] right-11 left-11 text-[34px]", HEADLINE)}>Add an item</p>
      <div className="absolute top-[142px] right-11 left-11"><LensField id="manual-type" placeholder="Type any item" /></div>
      <p className="absolute top-[232px] right-11 left-11 text-[20px] text-white/50">Or pick one · sample catalog{state.capture === "sample" ? " · sample prices" : ""}</p>
      <RowList
        ids={ids}
        rowHeight={70}
        gap={10}
        top={270}
        bottom={40}
        renderRow={(id) => {
          const product = GROCERY_CATALOG.find((p) => `manual-${p.id}` === id);
          if (!product) return <QuietRow id={id}><Plus className="size-[26px]" aria-hidden /> Add “{state.grocery.manualText.trim()}”</QuietRow>;
          return (
            <Act id={id} className="flex size-full items-center gap-4 rounded-[22px] bg-white/[0.06] px-6 text-left">
              <span className="min-w-0 flex-1 truncate text-[27px] font-semibold">{product.name} <span className="font-normal text-white/50">· {product.size}</span></span>
              <span className="text-[26px] font-semibold tabular-nums">{formatCents(product.qfcPriceCents)}</span>
            </Act>
          );
        }}
      />
    </>
  );
}

/* ── Grocery: shopping list (planned in Gourmet, ticked off here) ─────────── */

function GroceryList() {
  const { state, actions } = useLens();
  const list = state.list;
  const left = list.filter((i) => !i.done).length;
  const ids = [...list.map((i) => `list-${i.key}`), ...(actions.some((a) => a.id === "find") ? ["find"] : [])];
  const stock = left ? homeStoreStock(list) : null;
  const stockText = stock && (stock.unavailable.length ? `${stock.store} lacks ${stock.unavailable.length} item${stock.unavailable.length === 1 ? "" : "s"} (demo stock)` : `${stock.store} has all ${stock.covered.length} (demo stock)`);
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className={clsx("text-[38px]", HEADLINE)}>Shopping list</p>
        <p className="mt-0.5 truncate text-[21px] text-white/50">{list.length ? `${left} of ${list.length} left · items tick off as they go in the cart` : "Add ingredients from a recipe in Gourmet"}</p>
        {stockText && <p className="truncate text-[21px]" style={{ color: BLUE }}>{stockText}</p>}
      </div>
      <RowList
        ids={ids}
        rowHeight={64}
        gap={8}
        top={stockText ? 248 : 212}
        bottom={40}
        renderRow={(id) => {
          const item = list.find((i) => `list-${i.key}` === id);
          if (!item) return <QuietRow id={id}>Find next item · demo</QuietRow>;
          return (
            <Act id={id} className="flex size-full items-center gap-4 rounded-[20px] bg-white/[0.06] px-5 text-left">
              <span aria-hidden className={clsx("flex size-[34px] shrink-0 items-center justify-center rounded-[10px] ring-[3px]", item.done ? "ring-transparent" : "ring-white/45")} style={item.done ? { background: SUCCESS_GREEN } : undefined}>
                {item.done && <Check className="size-[24px] text-[#06210f]" strokeWidth={3} />}
              </span>
              <span className={clsx("min-w-0 flex-1 truncate text-[26px] font-medium", item.done && "text-white/45 line-through")}>{item.name}</span>
              <span className="max-w-[170px] truncate text-[20px] text-white/50">{item.recipes[0] ?? formatAmounts(item.amounts)}</span>
            </Act>
          );
        }}
      />
    </>
  );
}

/* ── Grocery: checked out (the trip's total into this month's spending) ───── */

/** Emphasis, not categories: this trip in the accent, earlier spending in stepped greys. */
const GREYS = ["rgb(255 255 255 / 0.62)", "rgb(255 255 255 / 0.44)", "rgb(255 255 255 / 0.32)", "rgb(255 255 255 / 0.22)"];

function GroceryCheckout() {
  const { state } = useLens();
  const s = state.grocery.summary;
  if (!s) {
    return (
      <>
        <Center>
          <DoneCheck />
          <p className="mt-5 text-[52px] leading-none font-bold tracking-[-0.03em]" role="status">All checked out!</p>
        </Center>
        <BottomRow><Pill id="done" className="w-[260px]" /></BottomRow>
      </>
    );
  }
  let grey = 0;
  const segments = s.segments.map((seg) => ({ ...seg, color: seg.highlight ? BLUE : GREYS[grey++ % GREYS.length] }));
  const month = new Date().toLocaleString("en-US", { month: "long" });
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11 flex items-center gap-7">
        <SpendDonut segments={segments} centre={s.thisTripCents} size={200} instant={state.reducedMotion} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2.5 text-[30px] font-bold tracking-[-0.02em]" role="status">
            <span className="flex size-[34px] items-center justify-center rounded-full" style={{ background: SUCCESS_GREEN }} aria-hidden><Check className="size-[22px] text-[#06210f]" strokeWidth={3.4} /></span>
            Checked out
          </p>
          <p className="mt-2 text-[22px] text-white/70 tabular-nums">
            {s.items} item{s.items === 1 ? "" : "s"}
            {s.onlineOrdersCents > 0 && ` + ${formatCents(s.onlineOrdersCents)} online`}
            {s.unknownLines > 0 && " · est."}
          </p>
          <p className="mt-3 text-[25px] leading-tight font-semibold tabular-nums">{formatCents(s.monthToDateCents)} <span className="font-medium text-white/60">in {month}</span></p>
          {/* Month so far vs a whole month isn't a fair "over/under", so last month is just context. */}
          <p className="mt-1 text-[20px] text-white/50 tabular-nums">Last month {formatCents(s.lastMonthCents)}</p>
        </div>
      </div>
      <ul className="absolute top-[318px] right-11 left-11 grid grid-cols-2 gap-x-6 gap-y-1">
        {segments.map((seg) => (
          <li key={seg.label} className="flex items-center gap-2.5 text-[21px]">
            <span className="size-[14px] shrink-0 rounded-full" style={{ background: seg.color }} aria-hidden />
            <span className={clsx("min-w-0 flex-1 truncate", seg.highlight ? "font-semibold text-white" : "text-white/70")}>{seg.label}</span>
            <span className="text-white/80 tabular-nums">{formatCents(seg.cents)}</span>
          </li>
        ))}
      </ul>
      <p className="absolute right-11 bottom-[136px] left-11 flex items-center justify-center gap-2.5 text-[20px] font-medium text-white/50">
        <Smartphone className="size-[22px]" style={{ color: BLUE }} aria-hidden />
        {state.capture === "sample" ? "Sample prices · mock history" : "Receipt details on your phone"}
      </p>
      <BottomRow><Pill id="done" className="w-[260px]" /></BottomRow>
    </>
  );
}

function SpendDonut({ segments, centre, size, instant }: { segments: { label: string; cents: number; color: string; highlight?: boolean }[]; centre: number; size: number; instant: boolean }) {
  const total = segments.reduce((sum, x) => sum + x.cents, 0) || 1;
  const stroke = 30;
  const r = (size - stroke) / 2;
  const gap = segments.length > 1 ? 2 / (2 * Math.PI * r) : 0;
  const starts = segments.map((_, i) => segments.slice(0, i).reduce((sum, x) => sum + x.cents / total, 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Spending this month: ${segments.map((x) => `${x.label} ${formatCents(x.cents)}`).join(", ")}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map((x, i) => {
          const length = Math.max(0, x.cents / total - gap);
          return (
            <motion.circle
              key={x.label}
              cx={size / 2} cy={size / 2} r={r} fill="none" stroke={x.color} strokeWidth={stroke}
              transform={`rotate(${starts[i] * 360} ${size / 2} ${size / 2})`}
              initial={{ pathLength: x.highlight && !instant ? 0 : length }}
              animate={{ pathLength: length }}
              transition={x.highlight && !instant ? { delay: 0.45 + i * 0.05, duration: 1.1, ease: [0.23, 1, 0.32, 1] } : { duration: 0 }}
            />
          );
        })}
      </g>
      <text x="50%" y="46%" textAnchor="middle" fill="#fff" fontSize="34" fontWeight="700">{formatCents(centre)}</text>
      <text x="50%" y="60%" textAnchor="middle" fill="rgb(255 255 255 / 0.55)" fontSize="19" fontWeight="500">this trip</text>
    </svg>
  );
}

/* ── Grocery: bought online (demo handoff) ────────────────────────────────── */

function GroceryBought() {
  const { state } = useLens();
  const b = state.grocery.bought.at(-1);
  return (
    <>
      <div className="absolute top-[112px] right-11 left-11 flex flex-col items-center text-center">
        <DoneCheck />
        <p className="mt-5 text-[60px] leading-none font-bold tracking-[-0.03em]" role="status">Bought</p>
        <p className="mt-4 line-clamp-1 max-w-full text-[27px] font-medium text-white/85">{b?.name}</p>
        <p className="mt-1 text-[25px] text-white/60">{b?.retailer} · <span className="font-semibold text-white tabular-nums">{formatCents(b?.priceCents ?? null)}</span> · sample price</p>
      </div>
      <p className="absolute right-11 bottom-[142px] left-11 flex items-center justify-center gap-2.5 text-[23px] font-medium text-white/70">
        <Smartphone className="size-[26px]" style={{ color: BLUE }} aria-hidden /> Demo · finish on your phone
      </p>
      <BottomRow>
        <Pill id="done" className="flex-1" />
        <Pill id="view" className="flex-1" />
      </BottomRow>
    </>
  );
}

/* ── Grocery: in-store arrows to the next list item (scripted aisle map) ──── */

function GroceryFind() {
  const { state } = useLens();
  const stops = aisleStops(state.list);
  const index = Number(state.screen.params?.stop ?? 0);
  const stop = stops.length ? stops[index % stops.length] : null;
  const Arrow = !stop ? ArrowUp : stop.side === "left" ? CornerUpLeft : CornerUpRight;
  return (
    <>
      {stop ? (
        <div className="absolute top-[104px] right-11 left-11 flex flex-col items-center text-center">
          <motion.span
            key={stop.productId}
            initial={state.reducedMotion ? false : { y: 18, opacity: 0 }}
            animate={{ y: state.reducedMotion ? 0 : [18, 0, -6, 0], opacity: 1 }}
            transition={{ duration: state.reducedMotion ? 0 : 1.1, ease: "easeOut" }}
            className="flex size-[150px] items-center justify-center rounded-full"
            style={{ boxShadow: `inset 0 0 0 4px ${BLUE}` }}
            aria-hidden
          >
            <Arrow className="size-[96px]" style={{ color: BLUE }} strokeWidth={2.4} />
          </motion.span>
          <p className="mt-5 text-[54px] leading-none font-bold tracking-[-0.03em]">Aisle {stop.aisle}</p>
          <p className="mt-2 text-[26px] text-white/75">{stop.section} · on your {stop.side}</p>
          <p className="mt-3 flex items-center gap-2 text-[28px] font-semibold"><MapPin className="size-[26px]" style={{ color: BLUE }} aria-hidden /> {stop.name}</p>
          <p className="mt-1 text-[20px] text-white/45">Stop {(index % stops.length) + 1} of {stops.length} · scripted demo map</p>
        </div>
      ) : (
        <div className="absolute top-[200px] right-11 left-11 text-center text-[28px] text-white/65">Everything on your list is in the cart.</div>
      )}
      <BottomRow>
        <Pill id="done" className="flex-1" />
        <Pill id="next" className="flex-1" />
      </BottomRow>
    </>
  );
}

/* ── Gourmet: scan → dish hypotheses ──────────────────────────────────────── */

function GourmetHome() {
  const { state } = useLens();
  const g = state.gourmet;

  if (g.scan === "scanning") {
    return (
      <>
        <Center>
          <Spinner purpose="scan" />
          <p className={clsx("mt-7 text-[40px]", HEADLINE)} role="status">Scanning dish…</p>
          <p className="mt-3 text-[25px] text-white/60">Hold still while Glance identifies it</p>
        </Center>
        <BottomRow><Pill id="scan-cancel" className="w-[260px]" /></BottomRow>
      </>
    );
  }

  if (g.scan === "result" && g.hypotheses.length) {
    const [top] = g.hypotheses;
    return (
      <>
        <div className="absolute top-[102px] right-11 left-11">
          <Eyebrow>Looks like</Eyebrow>
          <p className="mt-0.5 truncate text-[40px] leading-[1.05] font-semibold tracking-[-0.03em]">{top.name}</p>
          <p className="mt-1 truncate text-[21px] text-white/50">{top.cues.slice(0, 2).join(" · ")}</p>
        </div>
        <RowList
          ids={[...g.hypotheses.map((_, i) => `dish-${i}`), "rescan"]}
          rowHeight={74}
          gap={10}
          top={238}
          bottom={40}
          renderRow={(id, i) => {
            const dish = g.hypotheses[i];
            if (!dish) return <QuietRow id={id}><ScanLine className="size-[28px]" aria-hidden /> Rescan</QuietRow>;
            return (
              <Act id={id} className="flex size-full items-center gap-4 rounded-[22px] bg-white/[0.07] px-6 text-left">
                <span className="min-w-0 flex-1 truncate text-[28px] font-semibold">{dish.name}</span>
                <span className="text-[20px]" style={{ color: i === 0 ? BLUE : "rgb(255 255 255 / 0.6)" }}>{i === 0 ? "Best match" : "Possible"}</span>
              </Act>
            );
          }}
        />
      </>
    );
  }

  return (
    <>
      <Center>
        {g.scan === "error" ? <AlertCircle className="size-[76px]" style={{ color: AMBER }} strokeWidth={1.7} aria-hidden /> : <UtensilsCrossed className="size-[76px]" style={{ color: BLUE }} strokeWidth={1.6} aria-hidden />}
        <p className="mt-6 text-[44px] leading-tight font-semibold tracking-[-0.025em]">
          {g.scan === "no-food" ? "That doesn’t look like a dish" : g.scan === "error" ? "Couldn’t scan" : "Look at a dish"}
        </p>
        <p className="mt-3 line-clamp-2 text-[25px] text-white/60">{g.scan === "error" ? g.error ?? "Try again" : "Choose Scan dish when it’s in view"}</p>
      </Center>
      <CameraNote className="absolute right-11 bottom-[142px] left-11" />
      <BottomRow><Pill id="scan" className="w-[320px]" icon={<ScanLine className="size-[30px]" aria-hidden />} /></BottomRow>
    </>
  );
}

/* ── Gourmet: recipe choices ──────────────────────────────────────────────── */

function GourmetRecipes() {
  const { state } = useLens();
  const g = state.gourmet;
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className={clsx("truncate text-[38px]", HEADLINE)}>Recipes for {g.dish ?? "this dish"}</p>
        <p className="mt-0.5 truncate text-[21px] text-white/50">Make something like the dish you saw</p>
      </div>
      {g.recipesStatus === "loading" ? (
        <Center className="top-[180px]">
          <Spinner />
          <p className="mt-6 text-[32px] font-semibold" role="status">Finding recipes…</p>
        </Center>
      ) : g.recipesStatus === "error" || g.recipesStatus === "empty" || !g.recipes.length ? (
        <>
          <Center className="top-[180px]">
            <p className="text-[32px] font-semibold">{g.recipesStatus === "error" ? "Couldn’t load recipes" : "No recipes found for this dish"}</p>
            {g.error && <p className="mt-2 line-clamp-2 text-[22px] text-white/55">{g.error}</p>}
          </Center>
          <BottomRow><Pill id="retry" className="w-[300px]" /></BottomRow>
        </>
      ) : (
        <RowList
          ids={g.recipes.map((r) => `recipe-${r.id}`)}
          rowHeight={112}
          top={204}
          bottom={40}
          renderRow={(id, i) => {
            const r = g.recipes[i];
            return (
              <Act id={id} className="flex size-full flex-col justify-center rounded-[26px] bg-white/[0.07] px-7 text-left">
                <span className="line-clamp-2 text-[27px] leading-tight font-semibold tracking-[-0.015em]">{r.title}</span>
                <span className="mt-1 text-[22px] text-white/60 tabular-nums">{r.minutes} min · serves {r.servings} · {r.ingredients.length} ingredients</span>
              </Act>
            );
          }}
        />
      )}
    </>
  );
}

/* ── Gourmet: recipe detail (servings, ingredient checklist, actions) ─────── */

function GourmetRecipe() {
  const { state } = useLens();
  const id = String(state.screen.params?.recipeId ?? "");
  const r = recipeOf(state, id);
  if (!r) return <><Center><p className={clsx("text-[34px]", HEADLINE)}>Recipe not found</p></Center><BottomRow><Pill id="back" className="w-[260px]" /></BottomRow></>;
  const servings = state.gourmet.servings[id] ?? r.servings;
  const deselected = new Set(state.gourmet.deselected[id] ?? []);
  const ings = scaleIngredients(r.ingredients, r.servings, servings);
  const selected = ings.filter((i) => !deselected.has(i.name)).length;
  const saved = state.gourmet.saved.some((x) => x.id === id);
  return (
    <>
      <p className="absolute top-[72px] right-11 left-11 truncate text-[36px] leading-tight font-semibold tracking-[-0.02em]">{r.title}</p>
      <div className="absolute top-[122px] right-11 left-11 flex items-center gap-4">
        <p className="min-w-0 flex-1 text-[21px] text-white/55">{r.minutes} min · {r.source === "sample" ? "sample" : "suggested"} recipe</p>
        <Act id="servings-down" label="Fewer servings" className="flex size-[60px] items-center justify-center rounded-full ring-2 ring-white/45"><Minus className="size-[28px]" aria-hidden /></Act>
        <span className="w-[86px] text-center text-[22px] leading-tight text-white/70"><b className="block text-[34px] text-white tabular-nums">{servings}</b>serves</span>
        <Act id="servings-up" label="More servings" className="flex size-[60px] items-center justify-center rounded-full ring-2 ring-white/45"><Plus className="size-[28px]" aria-hidden /></Act>
      </div>
      <p className="absolute top-[190px] left-11 text-[18px] text-white/55">{selected} of {ings.length} selected · uncheck what you already have</p>
      <RowList
        ids={ings.map((_, i) => `ing-${i}`)}
        rowHeight={56}
        gap={6}
        top={230}
        bottom={184}
        renderRow={(rowId, i) => {
          const ing = ings[i];
          const on = !deselected.has(ing.name);
          return (
            <Act id={rowId} className="flex size-full items-center gap-4 rounded-[18px] px-4 text-left">
              <span aria-hidden className={clsx("flex size-[34px] shrink-0 items-center justify-center rounded-[10px] ring-[3px]", on ? "ring-transparent" : "ring-white/45")} style={on ? { background: BLUE } : undefined}>
                {on && <Check className="size-[24px] text-[#0d1a2a]" strokeWidth={3} />}
              </span>
              <span className={clsx("min-w-0 flex-1 truncate text-[26px] font-medium", !on && "text-white/45 line-through")}>{ing.name}</span>
              <span className="text-[24px] text-white/65 tabular-nums">{formatAmounts([{ quantity: ing.quantity, unit: ing.unit }])}</span>
            </Act>
          );
        }}
      />
      <div className="absolute right-11 bottom-[94px] left-11 flex gap-4">
        <Pill id="add-list" className="h-[76px] flex-[1.5] px-4 text-[26px]" icon={<ListChecks className="size-[28px]" aria-hidden />} />
        <Pill id="steps" className="h-[76px] flex-1 px-4 text-[26px]" />
        <Pill id="save-recipe" className="h-[76px] flex-1 px-4 text-[26px]" icon={saved ? <BookmarkCheck className="size-[26px]" aria-hidden /> : <Bookmark className="size-[26px]" aria-hidden />} />
      </div>
      <div className="absolute right-11 bottom-[28px] left-11"><Pill id="shop-ingredients" className="h-[50px] w-full text-[22px]" /></div>
    </>
  );
}

/* ── Gourmet: instructions ────────────────────────────────────────────────── */

function GourmetSteps() {
  const { state } = useLens();
  const id = String(state.screen.params?.recipeId ?? "");
  const page = Number(state.screen.params?.page ?? 0);
  const r = recipeOf(state, id);
  if (!r) return null;
  const pages = paginateSteps(r.steps);
  const chunk = pages[Math.min(page, pages.length - 1)] ?? [];
  let n = 1;
  for (let i = 0; i < page; i += 1) n += pages[i].filter((s) => !s.startsWith("…")).length;
  const first = n;
  const servings = state.gourmet.servings[id] ?? r.servings;
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className="truncate text-[28px] font-semibold">{r.title}</p>
        <p className="mt-3 text-[21px]" style={{ color: BLUE }}>
          {chunk.length ? `Step ${first} of ${r.steps.length}` : "No instructions available"} · serves {servings}
        </p>
        <div className="mt-5 flex gap-1.5" aria-hidden>
          {pages.map((_, i) => <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= page ? BLUE : "#ffffff30" }} />)}
        </div>
        <ol className="mt-6 space-y-4" aria-live="polite">
          {chunk.map((s, i) => {
            const num = s.startsWith("…") ? null : n++;
            return (
              <li key={i} className="flex gap-4 text-[28px] leading-[1.3] font-medium">
                {chunk.length > 1 && <span className="w-[30px] shrink-0 font-bold" style={{ color: BLUE }}>{num ?? ""}</span>}
                <span className="min-w-0 break-words">{s}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <BottomRow>
        <Pill id="prev" className="flex-1 text-[26px]" />
        <Pill id="next" className="flex-1 text-[26px]" />
        <Pill id="done" className="flex-1 text-[26px]" />
      </BottomRow>
    </>
  );
}

/* ── Gourmet: shop ingredients (live listings for whichever is chosen) ────── */

function GourmetShop() {
  const { state } = useLens();
  const r = recipeOf(state, String(state.screen.params?.recipeId ?? ""));
  if (!r) return <><Center><p className={clsx("text-[34px]", HEADLINE)}>Recipe not found</p></Center><BottomRow><Pill id="back" className="w-[260px]" /></BottomRow></>;
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className={clsx("text-[36px]", HEADLINE)}>Shop ingredients</p>
        <p className="mt-1 text-[22px] text-white/60">Choose an ingredient for online listings</p>
      </div>
      <RowList
        ids={r.ingredients.map((_, i) => `shop-${i}`)}
        rowHeight={76}
        top={206}
        bottom={48}
        renderRow={(id, i) => (
          <Act id={id} className="flex size-full items-center gap-3 rounded-[22px] bg-white/[0.07] px-5 text-left">
            <span className="min-w-0 flex-1 truncate text-[27px] font-semibold">{r.ingredients[i].name}</span>
            <span className="text-[22px] text-white/60">{formatAmounts([{ quantity: r.ingredients[i].quantity, unit: r.ingredients[i].unit }])}</span>
          </Act>
        )}
      />
    </>
  );
}

/* ── Gourmet: added to the planned shopping list ──────────────────────────── */

function GourmetAdded() {
  const { state } = useLens();
  const { action: stores } = useAction("stores");
  const left = state.list.filter((i) => !i.done).length;
  return (
    <>
      <Center className="pb-[70px]">
        <CircleCheck className="size-[88px] text-black" style={{ fill: "#93e4b0" }} strokeWidth={1.6} aria-hidden />
        <p className="mt-6 text-[42px] leading-tight font-semibold tracking-[-0.02em]" role="status">Added to shopping list</p>
        <p className="mt-3 text-[25px] text-white/60">{left} item{left === 1 ? "" : "s"} planned · ticks off in Grocery</p>
      </Center>
      <div className="absolute right-11 bottom-11 left-11 flex flex-col gap-4">
        <Pill id="shop-list" className="h-[76px] w-full" icon={<ListChecks className="size-[28px]" aria-hidden />} />
        <div className="flex gap-4">
          {stores ? <Pill id="stores" className="h-[72px] flex-[1.4] text-[26px]" /> : <Pill id="shop-ingredients" className="h-[72px] flex-[1.4] text-[26px]" />}
          <Pill id="done" className="h-[72px] flex-1 text-[26px]" />
        </div>
      </div>
    </>
  );
}

/* ── Places ───────────────────────────────────────────────────────────────── */

function StoresNearby() {
  const { state } = useLens();
  const stores = storesByDistance(state.location.lat, state.location.lng, STORES).slice(0, 4);
  const ids = [...(state.location.source === "demo" ? ["locate"] : []), ...stores.map((s) => `store-${s.id}`)];
  return (
    <>
      <div className="absolute top-[100px] right-11 left-11">
        <p className={clsx("text-[38px]", HEADLINE)}>Stores near you</p>
        <p className="mt-0.5 truncate text-[21px] text-white/50">{state.location.source === "demo" ? "From U District (demo)" : "From your location"} · sample stores · stock unknown</p>
      </div>
      <RowList
        ids={ids}
        rowHeight={84}
        top={208}
        bottom={40}
        renderRow={(id) => {
          if (id === "locate") return <QuietRow id={id}><LocateFixed className="size-[28px]" aria-hidden /> Use my location</QuietRow>;
          const store = stores.find((s) => `store-${s.id}` === id);
          if (!store) return null;
          return (
            <Act id={id} className="flex size-full items-center gap-4 rounded-[24px] bg-white/[0.07] px-6 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[28px] leading-tight font-semibold">{store.name}</span>
                <span className="block truncate text-[19px] text-white/55">{store.address}</span>
              </span>
              <span className="text-[24px] font-semibold tabular-nums" style={{ color: BLUE }}>{store.km.toFixed(1)} km</span>
            </Act>
          );
        }}
      />
    </>
  );
}

/**
 * Directions. Web apps on the glasses can't open Maps, so the directions link goes to the
 * wearer's phone (the Glance app shows a notification that opens it).
 */
function NavHandoff() {
  const { state } = useLens();
  const store = STORES.find((s) => s.id === state.screen.params?.storeId);
  const status = state.handoff.kind === "nav" ? state.handoff.status : "sending";
  return (
    <>
      <Center>
        <Navigation className="size-[72px]" style={{ color: BLUE }} strokeWidth={1.7} aria-hidden />
        <p className="mt-5 text-[46px] leading-tight font-semibold tracking-[-0.025em]">{store?.name ?? "Directions"}</p>
        {store && <p className="mt-1 line-clamp-1 text-[26px] text-white/70 tabular-nums">{km(state.location.lat, state.location.lng, store.lat, store.lng).toFixed(1)} km · {store.address}</p>}
        <p className={clsx("mt-5 flex items-center gap-2.5 text-[23px] font-medium", status === "failed" ? "text-[#ffc266]" : "text-white/70")} role="status">
          <Smartphone className="size-[24px]" aria-hidden />
          {status === "sent" ? "Directions sent to your phone" : status === "queued" ? "Open Glance on your phone for directions" : status === "failed" ? "Couldn’t reach your phone" : "Sending to your phone…"}
        </p>
      </Center>
      <BottomRow><Pill id="done" className="w-[260px]" /></BottomRow>
    </>
  );
}

/* ── Wallet (one-time setup on the phone; buy in lens after) ──────────────── */

function WalletTray() {
  const { state } = useLens();
  const w = state.wallet;
  if (w.status === "ready") {
    return (
      <>
        <div className="absolute top-[86px] right-11 left-11 flex items-center gap-5 rounded-[26px] bg-white/[0.07] px-6 py-5">
          <span className="flex size-[64px] shrink-0 items-center justify-center rounded-[18px]" style={{ background: BLUE }} aria-hidden><Wallet className="size-[34px] text-[#0d1a2a]" strokeWidth={2.2} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[32px] leading-tight font-bold tabular-nums">{w.brand ?? "Card"} •• {w.last4}</span>
            <span className="block truncate text-[20px] text-white/55">Ready · saved with Stripe{w.email ? ` · ${w.email}` : ""}</span>
          </span>
        </div>
        <RowList ids={["w-orders", "w-autobuy"]} rowHeight={84} top={232} bottom={150} renderRow={(id) => <WalletRow id={id} />} />
        <BottomRow><Pill id="w-done" className="w-[260px]" /></BottomRow>
      </>
    );
  }
  const checking = w.status === "unknown";
  return (
    <>
      <Center>
        {checking ? <Spinner /> : <Wallet className="size-[76px]" style={{ color: BLUE }} strokeWidth={1.6} aria-hidden />}
        <p className={clsx("mt-6 text-[40px] leading-tight", HEADLINE)}>{w.status === "signed-out" ? "Set up your wallet" : w.status === "not-ready" ? "No saved card yet" : "Checking your wallet…"}</p>
        <p className="mt-3 max-w-[480px] text-[24px] leading-snug text-white/60">One-time setup on your phone. Card details stay with Stripe.</p>
      </Center>
      <BottomRow>
        <Pill id="w-setup" className="flex-[1.5]" icon={<Smartphone className="size-[28px]" aria-hidden />} />
        <Pill id="w-refresh" className="flex-1" />
      </BottomRow>
    </>
  );
}

function WalletRow({ id }: { id: string }) {
  const { action } = useAction(id);
  return (
    <Act id={id} className="flex size-full items-center gap-4 rounded-[24px] bg-white/[0.05] px-6 text-left">
      {id === "w-orders" ? <Receipt className="size-[28px] shrink-0 text-white/70" aria-hidden /> : <Sparkles className="size-[28px] shrink-0" style={{ color: BLUE }} aria-hidden />}
      <span className="min-w-0 flex-1 truncate text-[28px] font-semibold">{action?.label}</span>
      <span className="max-w-[200px] truncate text-[21px] text-white/55">{action?.hint}</span>
    </Act>
  );
}

function WalletOrders() {
  const { state } = useLens();
  const orders = state.wallet.orders;
  if (!orders.length) {
    return (
      <>
        <Center>
          <Receipt className="size-[68px] text-white/40" strokeWidth={1.6} aria-hidden />
          <p className={clsx("mt-5 text-[38px]", HEADLINE)}>No orders yet</p>
        </Center>
        <BottomRow><Pill id="back" className="w-[260px]" /></BottomRow>
      </>
    );
  }
  return (
    <>
      <p className={clsx("absolute top-[74px] right-11 left-11 text-[34px]", HEADLINE)}>Orders</p>
      <RowList
        ids={orders.map((o) => `order-${o.id}`)}
        rowHeight={92}
        top={136}
        bottom={40}
        renderRow={(id, i) => {
          const o = orders[i];
          return (
            <Act id={id} className="flex size-full items-center gap-4 rounded-[26px] bg-white/[0.07] px-6 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[27px] leading-tight font-semibold">{o.merchantName}</span>
                <span className="block truncate text-[19px] text-white/55">{o.lines[0]?.name ?? "Order"} · {o.status}</span>
              </span>
              <span className="text-[28px] font-bold tabular-nums">{formatCents(o.totalCents)}</span>
            </Act>
          );
        }}
      />
    </>
  );
}

function OrderReceipt() {
  const { state } = useLens();
  const o = state.wallet.orders.find((x) => x.id === state.screen.params?.orderId);
  if (!o) return <><Center><p className={clsx("text-[34px]", HEADLINE)}>Order not found</p></Center><BottomRow><Pill id="done" className="w-[260px]" /></BottomRow></>;
  return (
    <>
      <div className="absolute top-[78px] right-11 left-11">
        <Eyebrow>Receipt · Ref {o.reference}</Eyebrow>
        <p className="mt-1 text-[72px] leading-none font-bold tracking-[-0.045em] tabular-nums">{formatCents(o.totalCents)}</p>
        <p className="mt-2 truncate text-[23px] text-white/60">{o.merchantName}{o.cardSummary ? ` · ${o.cardSummary}` : ""}</p>
        <ul className="mt-5 space-y-1.5 text-[23px]">
          {o.lines.slice(0, 3).map((l) => (
            <li key={l.name} className="flex justify-between gap-4"><span className="truncate text-white/80">{l.quantity} × {l.name}</span><span className="tabular-nums">{formatCents(l.lineTotalCents)}</span></li>
          ))}
          <li className="flex justify-between gap-4 pt-1 text-white/55"><span>Payment</span><span>{o.paymentStatus}</span></li>
          <li className="flex justify-between gap-4 text-white/55"><span>Fulfillment</span><span>{o.fulfillmentStatus}</span></li>
        </ul>
      </div>
      <BottomRow><Pill id="done" className="w-[260px]" /></BottomRow>
    </>
  );
}

/* ── Composer: typing with the D-pad (the glasses have no keyboard) ───────── */

function Composer() {
  const { state, actions } = useLens();
  const c = state.composer!;
  const keys = actions.filter((a) => a.id.startsWith("key-") && !["key-page", "key-delete", "key-done", "key-cancel"].includes(a.id));
  const price = c.field.startsWith("price");
  return (
    <>
      <div className="absolute top-[36px] right-11 left-11 flex h-[76px] items-center rounded-full px-8 text-[32px] ring-[3px] ring-[#A9CDF5]/80">
        <span className={clsx("truncate", !c.value && "text-white/45")}>{c.value || (price ? "Price in dollars" : "Type to search")}</span>
        <span className="glance-caret ml-1 inline-block h-[36px] w-[3px] shrink-0 rounded-full" style={{ background: BLUE }} aria-hidden />
      </div>
      <div className="absolute top-[140px] right-9 left-9 grid grid-cols-7 gap-2.5" role="group" aria-label="Keys">
        {keys.map((a) => (
          <Act key={a.id} id={a.id} className="flex h-[64px] items-center justify-center rounded-[18px] bg-white/[0.08] text-[32px] font-semibold">{a.label}</Act>
        ))}
      </div>
      <div className="absolute top-[300px] right-9 left-9 flex gap-2.5">
        <Act id="key-page" className="flex h-[64px] flex-1 items-center justify-center rounded-[18px] bg-white/[0.08] text-[24px] font-semibold">
          {c.page + 1} of 3 · More keys
        </Act>
        <Act id="key-delete" label="Delete" className="flex h-[64px] flex-1 items-center justify-center gap-2 rounded-[18px] bg-white/[0.08] text-[24px] font-semibold">
          <Delete className="size-[28px]" aria-hidden /> Delete
        </Act>
      </div>
      <BottomRow>
        <Pill id="key-done" className="flex-1" />
        <Pill id="key-cancel" className="flex-1" />
      </BottomRow>
    </>
  );
}
