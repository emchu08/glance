"use client";

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import clsx from "clsx";
import { ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Hourglass, LayoutGrid, ScanLine, Search, ShoppingBag, ShoppingCart, Trash2, Wallet } from "lucide-react";
import type { NormalizedBox, Offer } from "@/data/types";
import { formatCents } from "@/domain/money";
import { useLens } from "./LensProvider";
import { MODE_META } from "./types";

/**
 * Lens primitives, from the original Glance lens. Sizes are display pixels on the
 * 600×600 panel. Palette for an additive display: black = no light; ink is white; the
 * one accent is light blue. Focus is a bright white ring that glides between actions.
 */

export const BLUE = "#A9CDF5";
export const AMBER = "#FFC266";
export const SUCCESS_GREEN = "#5BE49B";
export const SPRING = { type: "spring", bounce: 0, duration: 0.34 } as const;

/** `leaving`: this copy of a screen is animating out; its controls are drawn but inert. */
interface UiContext { instanceId: string; instant: boolean; leaving?: boolean }
const Ui = createContext<UiContext>({ instanceId: "lens", instant: false });
export const UiProvider = Ui.Provider;
export const useUi = () => useContext(Ui);

/** An action of the current screen by id, with its focus state. */
export function useAction(id: string) {
  const { actions, focusId } = useLens();
  const action = actions.find((a) => a.id === id);
  return { action, focused: !!action && focusId === id };
}

export function FocusRing({ className }: { className?: string }) {
  const { instanceId, instant } = useUi();
  return (
    <motion.span
      layoutId={`glance-focus-${instanceId}`}
      transition={instant ? { duration: 0 } : SPRING}
      aria-hidden
      data-focus-ring
      className={clsx("pointer-events-none absolute -inset-[9px] rounded-[inherit] shadow-[0_0_24px_rgb(169_205_245/0.55)] ring-[4px] ring-white", className)}
    />
  );
}

/**
 * Pointer-down focuses, which can move the control (the mode wheel turns, lists glide). If it
 * has moved out from under the pointer by release, no click will reach it, so the press
 * completes on release instead. Otherwise it's an ordinary click.
 *
 * Touch always completes on release: a touch stays captured by the control it started on, so
 * release can't tell that the control moved, and iOS sends the click to whatever slid under the
 * finger since (on the phone app, tapping Grocery on the mode wheel opened Gourmet). Any click
 * just after a press finished here is that stray click, whichever control it lands on.
 */
let lastPress: { id: string; at: number } | null = null;

/** A focusable action. Pointer-down moves focus; release activates. The D-pad moves the same focus. */
export function Act({ id, className, children, label, style }: { id: string; className?: string; children?: ReactNode; label?: string; style?: CSSProperties }) {
  const { activate, focus, interactive } = useLens();
  const { action, focused } = useAction(id);
  const { leaving } = useUi();
  // A screen animating out renders against the next screen's actions: keep it visible, inert.
  if (!action || leaving) return <div className={clsx("relative select-none", className)} style={style}>{children}</div>;
  const Tag = interactive ? "button" : "div";
  return (
    <Tag
      {...(interactive && {
        type: "button" as const,
        tabIndex: -1,
        disabled: action.disabled,
        "aria-pressed": action.hint === "pressed" ? true : undefined,
        "aria-label": label ?? action.label,
        onPointerDown: (e: React.PointerEvent) => {
          if (e.button !== 0) return;
          focus(id);
          const el = e.currentTarget;
          const touch = e.pointerType !== "mouse";
          const press = new AbortController();
          // Mouse still over the control on release: the click follows as usual. Touch, or moved away: finish here.
          window.addEventListener("pointerup", (up) => {
            if (up.pointerId !== e.pointerId) return;
            press.abort();
            if (!touch && up.target instanceof Node && el.contains(up.target)) return;
            lastPress = { id, at: Date.now() };
            activate(id);
          }, { signal: press.signal });
          // A cancelled touch (the page scrolled instead) presses nothing.
          window.addEventListener("pointercancel", (c) => { if (c.pointerId === e.pointerId) press.abort(); }, { signal: press.signal });
        },
        onClick: () => {
          if (lastPress && Date.now() - lastPress.at < 800) return;
          activate(id);
        },
      })}
      data-action-id={id}
      data-focused={focused || undefined}
      style={style}
      className={clsx(
        "relative outline-none select-none",
        interactive && "cursor-pointer transition-transform duration-100 ease-out active:scale-[0.97]",
        action.disabled && "opacity-55",
        className,
      )}
    >
      {focused && <FocusRing />}
      {children ?? action.label}
    </Tag>
  );
}

/** Pill button: primary (and pay) = filled light blue; secondary = outlined. */
export function Pill({ id, className, children, icon }: { id: string; className?: string; children?: ReactNode; icon?: ReactNode }) {
  const { action } = useAction(id);
  if (!action) return null;
  const primary = action.variant === "primary" || action.variant === "pay";
  const pressed = action.hint === "pressed";
  return (
    <Act
      id={id}
      className={clsx(
        "flex items-center justify-center gap-3 rounded-full font-semibold tracking-[-0.01em] whitespace-nowrap",
        // Defaults a screen can override (classes can't override each other reliably).
        !/(^|\s)h-/.test(className ?? "") && "h-[84px]",
        !/(^|\s)px-/.test(className ?? "") && "px-7",
        !/(^|\s)text-\[/.test(className ?? "") && "text-[30px]",
        primary ? "text-[#0d1a2a]" : "text-white ring-[3px] ring-white/50",
        pressed && !primary && "text-[#A9CDF5] ring-[#A9CDF5]",
        className,
      )}
    >
      {primary && <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: BLUE }} />}
      <span className="relative flex min-w-0 items-center gap-3">
        {icon}
        <span className="truncate">{children ?? action.label}</span>
      </span>
    </Act>
  );
}

/**
 * A vertical list on a no-scroll display: a fixed window of whole rows that glides so the
 * focused row stays visible, with "1–3 of 5 ↓" when it overflows.
 */
export function RowList({ ids, rowHeight, gap = 12, top, bottom, renderRow }: { ids: string[]; rowHeight: number; gap?: number; top: number; bottom: number; renderRow: (id: string, i: number) => ReactNode }) {
  const { focusId } = useLens();
  const { instant } = useUi();
  const focusedRow = ids.indexOf(focusId ?? "");
  const height = 600 - top - bottom;
  const fits = (h: number) => Math.max(1, Math.floor((h + gap) / (rowHeight + gap)));
  const visible = ids.length > fits(height) ? fits(height - 30) : fits(height);
  // Keep the window still while focus moves inside it; shift only when focus leaves it.
  const [anchor, setAnchor] = useState(0);
  let next = anchor;
  if (focusedRow >= 0) {
    if (focusedRow < next) next = focusedRow;
    else if (focusedRow > next + visible - 1) next = focusedRow - visible + 1;
  }
  next = Math.max(0, Math.min(next, ids.length - visible));
  if (next !== anchor) setAnchor(next);
  const listHeight = Math.min(ids.length, visible) * (rowHeight + gap) - gap;
  return (
    <>
      {/* Clipped to whole rows, so a half-visible row never reads as a button. */}
      <div className="absolute right-11 left-11 overflow-hidden" style={{ top: top - 12, height: listHeight + 24, padding: 12, margin: "0 -12px" }}>
        <motion.ul animate={{ y: -next * (rowHeight + gap) }} transition={instant ? { duration: 0 } : SPRING} className="flex flex-col" style={{ gap }}>
          {ids.map((id, i) => <li key={id} style={{ height: rowHeight }}>{renderRow(id, i)}</li>)}
        </motion.ul>
      </div>
      {ids.length > visible && (
        <p aria-hidden className="pointer-events-none absolute right-11 text-[19px] font-medium text-white/50 tabular-nums" style={{ top: top + listHeight + 8 }}>
          {next > 0 ? "↑ " : ""}{next + 1}–{next + visible} of {ids.length}{next + visible < ids.length ? " ↓" : ""}
        </p>
      )}
    </>
  );
}

/** A text field on the lens. Selecting it opens the composer (the glasses can't type directly). */
export function LensField({ id, placeholder, className }: { id: string; placeholder: string; className?: string }) {
  const { state } = useLens();
  const { action } = useAction(id);
  if (!action) return null;
  const value = state.composer && state.composer.field === action.field ? state.composer.value : action.label !== placeholder ? action.label : "";
  return (
    <Act id={id} label={placeholder} className={clsx("flex h-[76px] w-full items-center rounded-full px-8 text-left text-[30px] ring-[3px] ring-white/40", className)}>
      <span className={clsx("truncate", !value && "text-white/45")}>{value || placeholder}</span>
    </Act>
  );
}

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={clsx("glance-skeleton block rounded-full bg-white/[0.09]", className)} style={style} />;
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx("text-[26px] font-medium tracking-[-0.005em]", className)} style={{ color: BLUE }}>{children}</p>;
}

export function Spinner({ small = false, purpose = "wait" }: { small?: boolean; purpose?: "wait" | "scan" }) {
  const { instant } = useUi();
  if (instant) {
    const Icon = purpose === "scan" ? ScanLine : Hourglass;
    return <Icon className={clsx("shrink-0", small ? "size-[34px]" : "size-[84px]")} style={{ color: BLUE }} strokeWidth={1.8} aria-hidden />;
  }
  return (
    <span className={clsx("relative block shrink-0", small ? "size-[34px]" : "size-[84px]")} aria-hidden>
      <span className={clsx("absolute inset-0 rounded-full border-white/18", small ? "border-[4px]" : "border-[6px]")} />
      <span className={clsx("glance-spin absolute inset-0 rounded-full border-transparent", small ? "border-[4px]" : "border-[6px]")} style={{ borderTopColor: BLUE }} />
    </span>
  );
}

export function Center({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={clsx("absolute inset-x-11 top-[100px] bottom-[150px] flex flex-col items-center justify-center text-center", className)}>{children}</div>;
}

export function BottomRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("absolute right-11 bottom-11 left-11 flex items-center justify-center gap-5", className)}>{children}</div>;
}

const BAR_BUTTON = "flex h-[40px] items-center rounded-full ring-2 ring-white/55";

/**
 * The top bar above every screen inside a mode: Back and Modes in the same place everywhere,
 * one quiet status (which mode, and whether this is a sample), then the wallet, Online
 * listings and, in Glimpse, the cart.
 */
export function TopBar() {
  const { actions, state } = useLens();
  if (!actions.some((a) => a.id === "hdr-modes")) return null;
  const sample = state.capture === "sample";
  const live = state.capture === "webcam" || state.pairing.status === "connected" || state.pairing.status === "camera-starting";
  const count = state.glimpse.saved.length;
  const has = (id: string) => actions.some((a) => a.id === id);
  const walletReady = state.wallet.status === "ready";
  return (
    <nav aria-label="Lens navigation" className="absolute top-[14px] right-11 left-11 z-20 flex h-[40px] items-center gap-2.5 text-[19px] font-semibold">
      <Act id="hdr-back" label="Back" className={clsx(BAR_BUTTON, "gap-1.5 pr-4 pl-3 text-white")}>
        <ArrowLeft className="size-[20px]" aria-hidden /> Back
      </Act>
      <Act id="hdr-modes" label="Modes: choose Glimpse, Grocery or Gourmet" className={clsx(BAR_BUTTON, "gap-2 bg-white/[0.12] px-4 text-white")}>
        <LayoutGrid className="size-[19px]" aria-hidden /> Modes
      </Act>
      <span className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-white/55" data-status>
        {(sample || live) && <span className="size-[9px] shrink-0 rounded-full" style={{ background: sample ? "rgb(255 255 255 / 0.4)" : BLUE }} aria-hidden />}
        <span className="truncate">{MODE_META[state.mode].label}{sample && " · Sample"}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2.5">
        {has("hdr-wallet") && (
          <Act id="hdr-wallet" className={clsx(BAR_BUTTON, "w-[40px] justify-center", walletReady ? "text-[#A9CDF5] ring-[#A9CDF5]/55" : "text-white")}>
            <Wallet className="size-[19px]" strokeWidth={2.2} aria-hidden />
          </Act>
        )}
        {has("hdr-search") && (
          <Act id="hdr-search" label="Online listings" className={clsx(BAR_BUTTON, "w-[40px] justify-center text-[#A9CDF5] ring-[#A9CDF5]/55")}>
            <Search className="size-[20px]" strokeWidth={2.4} aria-hidden />
          </Act>
        )}
        {has("hdr-cart") && (
          <Act id="hdr-cart" className={clsx(BAR_BUTTON, "gap-1.5 px-3 text-white", count === 0 && "w-[40px] justify-center px-0")}>
            <ShoppingCart className="size-[20px]" strokeWidth={2.2} aria-hidden />
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </Act>
        )}
      </span>
    </nav>
  );
}

export function Toast() {
  const { state } = useLens();
  const text = state.grocery.acknowledgement ?? state.toast?.text;
  // While typing, the field sits where toasts appear.
  if (!text || state.composer) return null;
  return (
    <div className="pointer-events-none absolute top-[70px] right-0 left-0 z-10 flex justify-center">
      <span key={text} className="glance-rise rounded-full px-6 py-2.5 text-[24px] font-semibold text-[#0d1a2a]" style={{ background: BLUE }} role="status">{text}</span>
    </div>
  );
}

/* ── Offer card ───────────────────────────────────────────────────────────── */

const MATCH_LABEL = { exact: "Exact match", possible: "Possible match", similar: "Similar" } as const;

/** The item as the wearer saw it: cropped from the analysed frame, tight to its box. */
export function FrameCrop({ src, box, size, radius = 26 }: { src: string; box?: NormalizedBox; size: number; radius?: number }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  let style: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
  if (natural && box) {
    const cx = (box.x + box.width / 2) * natural.w;
    const cy = (box.y + box.height / 2) * natural.h;
    const side = Math.min(Math.max(box.width * natural.w, box.height * natural.h) * 1.1, natural.w, natural.h);
    const scale = size / side;
    const left = Math.min(0, Math.max(size - natural.w * scale, size / 2 - cx * scale));
    const top = Math.min(0, Math.max(size - natural.h * scale, size / 2 - cy * scale));
    style = { position: "absolute", width: natural.w * scale, height: natural.h * scale, left, top, maxWidth: "none" };
  }
  return (
    <div className="relative shrink-0 overflow-hidden bg-white/5" style={{ width: size, height: size, borderRadius: radius }} data-frame-crop>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" style={style} onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} />
    </div>
  );
}

/** The listing's photo; without one (or if it fails), the item as the wearer saw it. */
export function OfferPhoto({ image, snapshot, box, size }: { image?: string | null; snapshot?: string | null; box?: NormalizedBox; size: number }) {
  const [failed, setFailed] = useState(false);
  // Store product shots are usually on white, so they're shown whole.
  const web = Boolean(image && /^https?:|^\/api\//.test(image));
  if (image && !failed) {
    return (
      <div className={clsx("relative shrink-0 overflow-hidden rounded-[26px]", web ? "bg-white" : "bg-white/5")} style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" referrerPolicy="no-referrer" className={clsx("size-full", web ? "object-contain p-2" : "object-cover")} onError={() => setFailed(true)} />
      </div>
    );
  }
  if (snapshot) return <FrameCrop src={snapshot} box={box} size={size} />;
  return (
    <div className="flex shrink-0 items-center justify-center rounded-[26px] bg-white/[0.07]" style={{ width: size, height: size }} aria-hidden>
      <ShoppingBag className="size-[56px] text-white/30" strokeWidth={1.6} />
    </div>
  );
}

export interface CardLayout { top: number; photo: number }

/** Photo + store, name and price (the "open listing" action), one match chip and badge, and position dots. */
export function OfferCard({ offers, offer, arriving, layout, snapshot, box, note }: { offers: Offer[]; offer: Offer; arriving: boolean; layout: CardLayout; snapshot?: string | null; box?: NormalizedBox; note?: ReactNode }) {
  const index = Math.max(0, offers.findIndex((o) => o.id === offer.id));
  const chipsTop = layout.top + layout.photo + 18;
  const dotsTop = chipsTop + 58;
  const buyInLens = offer.kind === "connect_merchant";
  return (
    <>
      <div className="absolute right-11 left-11" style={{ top: layout.top }} data-offer-card={offer.id}>
        <Act id="open-listing" label="Open listing" className="flex w-full gap-6 rounded-[28px] text-left">
          <OfferPhoto key={`${offer.id}:${offer.imageUrl ?? ""}`} image={offer.imageUrl} snapshot={snapshot} box={box} size={layout.photo} />
          <div className="min-w-0 flex-1 pt-1">
            <p className="flex items-center gap-2 text-[24px] font-medium text-white/70">
              <span className="truncate">{offer.retailer}</span>
              {!buyInLens && <ExternalLink className="size-[20px] shrink-0 text-white/40" aria-hidden />}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[27px] leading-[1.15] font-medium">{offer.name}</p>
            {offer.priceCents === null
              ? <p className="mt-3 text-[34px] leading-none font-semibold text-white/70">See price</p>
              : <p className="mt-2 text-[62px] leading-none font-bold tracking-[-0.04em] tabular-nums">{formatCents(offer.priceCents)}</p>}
          </div>
        </Act>
      </div>
      <div className="absolute right-11 left-11 flex items-center gap-2.5" style={{ top: chipsTop }}>
        <span className="shrink-0 rounded-full px-4 py-1 text-[21px] font-semibold" style={{ color: BLUE, boxShadow: `inset 0 0 0 2px ${BLUE}99` }}>
          {buyInLens ? "Buy in lens" : MATCH_LABEL[offer.match]}
        </span>
        {offer.sponsored ? <span className="shrink-0 rounded-full px-4 py-1 text-[21px] font-semibold text-white/80 ring-2 ring-white/40">Sponsored</span>
          : offer.badge && !(buyInLens && /buy in lens/i.test(offer.badge)) && <span className="shrink-0 rounded-full bg-white px-4 py-1 text-[21px] font-semibold text-black">★ {offer.badge}</span>}
      </div>
      <div className="absolute right-11 left-11 flex items-center justify-center gap-3 text-[18px] text-white/45" style={{ top: dotsTop }}>
        <Dots count={offers.length} index={index} />
        {arriving ? <span className="flex items-center gap-2" role="status"><Spinner small /> More coming</span>
          : note ? note
          : offer.origin === "sample" ? <span>sample price</span>
          : !buyInLens && offer.priceCents !== null && <span>web price</span>}
      </div>
    </>
  );
}

function Dots({ count, index }: { count: number; index: number }) {
  if (count < 2) return null;
  if (count > 7) return <span className="tabular-nums">{index + 1} of {count}</span>;
  return (
    <span className="inline-flex gap-2" aria-label={`${index + 1} of ${count}`}>
      {Array.from({ length: count }, (_, i) => <span key={i} className={clsx("size-[10px] rounded-full", i === index ? "bg-white" : "bg-white/30")} />)}
    </span>
  );
}

export function CardSkeleton({ layout, snapshot, box }: { layout: CardLayout; snapshot?: string | null; box?: NormalizedBox }) {
  return (
    <div className="absolute right-11 left-11 flex gap-6" style={{ top: layout.top }} aria-hidden>
      {snapshot ? <FrameCrop src={snapshot} box={box} size={layout.photo} /> : <Skeleton style={{ width: layout.photo, height: layout.photo, borderRadius: 26 }} />}
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-2">
        <Skeleton className="h-[22px] w-[45%]" />
        <Skeleton className="h-[26px] w-[90%]" />
        <Skeleton className="h-[26px] w-[65%]" />
        <Skeleton className="mt-2 h-[54px] w-[55%] rounded-[18px]" />
      </div>
    </div>
  );
}

/** ‹ Buy [Add to cart | Remove] › — the same bottom row on every card screen. */
export function CardButtons({ secondary, single }: { secondary: "cart-add" | "cart-remove"; single: boolean }) {
  return (
    <div className="absolute right-6 bottom-11 left-6 flex items-center gap-3.5">
      <StepButton id="offer-prev" dim={single}><ChevronLeft className="size-[38px]" aria-hidden /></StepButton>
      <Pill id="buy" className="flex-1 px-4" />
      <Pill
        id={secondary}
        className="flex-[1.6] px-4 text-[28px]"
        icon={secondary === "cart-add" ? <ShoppingCart className="size-[28px]" strokeWidth={2.2} aria-hidden /> : <Trash2 className="size-[26px]" strokeWidth={2.2} aria-hidden />}
      />
      <StepButton id="offer-next" dim={single}><ChevronRight className="size-[38px]" aria-hidden /></StepButton>
    </div>
  );
}

function StepButton({ id, dim, children }: { id: string; dim: boolean; children: ReactNode }) {
  return (
    <Act id={id} label={id === "offer-prev" ? "Previous offer" : "Next offer"} className={clsx("flex size-[64px] shrink-0 items-center justify-center rounded-full ring-2 ring-white/25", dim ? "text-white/25" : "text-white/80")}>
      {children}
    </Act>
  );
}
