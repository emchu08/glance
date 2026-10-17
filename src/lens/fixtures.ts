import { SAMPLE_RECIPES } from "@/data/gourmet";
import { CATALOG_BY_ID } from "@/data/grocery";
import type { Offer } from "@/data/types";
import { buildTripSummary } from "@/domain/grocery/exit";
import { sampleInsight } from "@/domain/grocery/insights";
import { rankCandidates } from "@/domain/glimpse/interest";
import { STREET_CANDIDATES } from "@/data/glimpse";
import { sampleOffersForLabel } from "@/domain/sample";
import { buildQuote } from "@/domain/commerce/quote";
import type { LensState, OrderSummary } from "./types";

/**
 * Deterministic fixture states for the development gallery (/demo/screens) and
 * /lens?screen=<id>&source=sample|live. Fixture views never create payment objects,
 * send purchase requests, or consume budgets — effects are disabled in fixture mode.
 */

export const FIXTURE_IDS = [
  "looking-empty", "looking", "candidates", "offers-loading", "offers-streaming", "offers-photo", "offers-no-photo", "offers-no-price",
  "offers-empty", "offers-error", "cart", "cart-item", "cart-empty", "done-sent", "done-queued", "done-sending", "done-failed",
  "listings-loading", "listings-ready", "listings-empty", "listings-error",
] as const;

export const PAYMENT_FIXTURE_IDS = [
  "wallet-not-ready", "payment-ready", "payment-pending", "payment-needs-action", "payment-confirmed", "payment-error", "order-accepted", "order-recovery",
  "sponsored-offer", "external-offer", "autobuy-on", "autobuy-paused", "refunded", "disconnected", "grocery-cart", "grocery-item", "grocery-checkout", "gourmet-recipe", "overflow-long-labels",
] as const;

export type FixtureId = (typeof FIXTURE_IDS)[number] | (typeof PAYMENT_FIXTURE_IDS)[number];

const ranked = rankCandidates(Object.values(STREET_CANDIDATES), { seenCounts: { "gray-sweater": 3, "black-backpack": 3, "red-shoulder-bag": 1 } });

/** Live-shaped offers: same component, different formatting (real-looking URLs/photos/prices). */
function liveOffers(variant: "photo" | "no-photo" | "no-price" | "streaming" = "photo"): Offer[] {
  const base: Offer[] = [
    { id: "live-1", candidateId: "gray-sweater", query: "gray crew neck knit sweater", name: "Men's Washable Crew Neck Long-Sleeve Sweater, Gray", retailer: "Uniqlo", url: "https://www.uniqlo.com/us/en/products/E470157-000", imageUrl: variant === "no-photo" ? null : "/samples/sweater.svg", priceCents: variant === "no-price" ? null : 3990, match: "possible", evidence: "crew neck · gray · knit", kind: "external_link", origin: "live" },
    { id: "live-2", candidateId: "gray-sweater", query: "gray crew neck knit sweater", name: "Soft Crewneck Sweater in Heather Grey", retailer: "Everlane", url: "https://www.everlane.com/products/mens-cashmere-crew-heather-grey", imageUrl: variant === "no-photo" ? null : "/samples/sweater.svg", priceCents: 9800, match: "similar", kind: "external_link", origin: "live" },
    { id: "live-3", candidateId: "gray-sweater", query: "gray crew neck knit sweater", name: "Gray canvas tote", retailer: "Glance Demo Market", url: "/merchant#demo-gray-tote", imageUrl: "/samples/demo-gray-tote.svg", priceCents: 1200, match: "similar", badge: "Buy in lens", kind: "connect_merchant", merchantId: "glance-demo-market", sku: "demo-gray-tote", variant: "Standard", origin: "live" },
  ];
  return variant === "streaming" ? base.slice(0, 1) : base;
}

const readyWallet = { status: "ready" as const, brand: "Visa", last4: "4242", autoBuy: "off" as const, ruleSummary: null, orders: [], email: "demo@glance.shop" };

function order(status: OrderSummary["paymentStatus"], fulfillment: OrderSummary["fulfillmentStatus"]): OrderSummary {
  return { id: "ord_fixture", merchantName: "Glance Demo Market", totalCents: 1200, currency: "USD", status: fulfillment === "accepted" ? "accepted" : status, paymentStatus: status, fulfillmentStatus: fulfillment, createdAt: "2026-10-17T18:00:00Z", lines: [{ name: "Gray canvas tote", quantity: 1, lineTotalCents: 1200 }], reference: "GL-7F3K2", cardSummary: "Visa •• 4242" };
}

export function fixtureState(id: string, live: boolean, base: LensState): LensState {
  const s: LensState = { ...base, intro: "done", capture: live ? "webcam" : "sample", wallet: { ...base.wallet, status: "unknown" } };
  const offers = live ? liveOffers() : sampleOffersForLabel("Gray crewneck sweater", "gray-sweater");
  const withOffers = (list: Offer[], status: LensState["glimpse"]["offersStatus"]): LensState => ({
    ...s, mode: "glimpse", screen: { id: "glimpse-offers" }, stack: [{ id: "glimpse" }],
    glimpse: { ...s.glimpse, scan: "result", candidates: ranked, chosenId: "gray-sweater", offers: list, offersStatus: status, offersQuery: "Gray crewneck sweater", offerId: list[0]?.id ?? null },
  });
  const payable = offers.find((o) => o.kind === "connect_merchant") ?? liveOffers()[2];
  const payState = (status: LensState["payment"]["status"], o?: OrderSummary | null, error?: string): LensState => {
    const st = withOffers([payable, ...offers.filter((x) => x.id !== payable.id)], "ready");
    return { ...st, wallet: { ...st.wallet, ...readyWallet }, payment: { status, offerId: payable.id, quote: buildQuote([{ sku: payable.sku!, quantity: 1 }], { now: 1760724000000 }), orderId: o?.id ?? null, order: o ?? null, error: error ?? null, attemptKey: null, originMode: "glimpse" } };
  };

  switch (id) {
    case "looking-empty": return { ...s, mode: "glimpse", screen: { id: "glimpse" } };
    case "looking": return { ...s, mode: "glimpse", screen: { id: "glimpse" }, glimpse: { ...s.glimpse, scan: "result", candidates: ranked, chosenId: "gray-sweater" } };
    case "candidates": return { ...s, mode: "glimpse", screen: { id: "glimpse-candidates" }, stack: [{ id: "glimpse" }], glimpse: { ...s.glimpse, scan: "result", candidates: ranked, frozenCandidates: ranked, chosenId: "gray-sweater" } };
    case "offers-loading": return withOffers([], "loading");
    case "offers-streaming": return withOffers(live ? liveOffers("streaming") : offers.slice(0, 1), "loading");
    case "offers-photo": return withOffers(offers, "ready");
    case "offers-no-photo": return withOffers(live ? liveOffers("no-photo") : offers.map((o) => ({ ...o, imageUrl: null })), "ready");
    case "offers-no-price": return withOffers(live ? liveOffers("no-price") : offers.map((o, i) => (i === 0 ? { ...o, priceCents: null } : o)), "ready");
    case "offers-empty": return withOffers([], "empty");
    case "offers-error": return { ...withOffers([], "error"), glimpse: { ...withOffers([], "error").glimpse, error: live ? "Search service returned 503" : "Sample error state" } };
    case "cart": return { ...s, mode: "glimpse", screen: { id: "glimpse-cart" }, stack: [{ id: "glimpse" }], glimpse: { ...s.glimpse, saved: offers.slice(0, 3).map((o) => ({ ...o, savedAt: 1760724000000, candidateLabel: "Gray crewneck sweater" })) } };
    case "cart-item": { const saved = offers.slice(0, 3).map((o) => ({ ...o, savedAt: 1760724000000, candidateLabel: "Gray crewneck sweater" })); return { ...s, mode: "glimpse", screen: { id: "glimpse-cart-item", params: { offerId: saved[0].id } }, stack: [{ id: "glimpse" }, { id: "glimpse-cart" }], glimpse: { ...s.glimpse, saved, offerId: saved[0].id } }; }
    case "cart-empty": return { ...s, mode: "glimpse", screen: { id: "glimpse-cart" }, stack: [{ id: "glimpse" }] };
    case "done-sent": return { ...s, screen: { id: "handoff" }, stack: [{ id: "glimpse" }], pairing: { status: "connected", code: "K7P2QX" }, handoff: { status: "sent", kind: "view", title: offers[0].name, url: offers[0].url, error: null } };
    case "done-queued": return { ...s, screen: { id: "handoff" }, stack: [{ id: "glimpse" }], pairing: { status: "waiting", code: "K7P2QX" }, handoff: { status: "queued", kind: "view", title: offers[0].name, url: offers[0].url, error: null } };
    case "done-sending": return { ...s, screen: { id: "handoff" }, stack: [{ id: "glimpse" }], handoff: { status: "sending", kind: "view", title: offers[0].name, url: offers[0].url, error: null } };
    case "done-failed": return { ...s, screen: { id: "handoff" }, stack: [{ id: "glimpse" }], handoff: { status: "failed", kind: "view", title: offers[0].name, url: offers[0].url, error: "Relay unavailable" } };
    case "listings-loading": return { ...s, screen: { id: "online-listings" }, stack: [{ id: "glimpse" }], listings: { query: "gray crew neck sweater", status: "loading", offers: [], offerId: null, error: null } };
    case "listings-ready": { const l = liveOffers(); return { ...s, screen: { id: "online-listings" }, stack: [{ id: "glimpse" }], listings: { query: "gray crew neck sweater", status: "ready", offers: l, offerId: l[0].id, error: null } }; }
    case "listings-empty": return { ...s, screen: { id: "online-listings" }, stack: [{ id: "glimpse" }], listings: { query: "qzx widget", status: "empty", offers: [], offerId: null, error: null } };
    case "listings-error": return { ...s, screen: { id: "online-listings" }, stack: [{ id: "glimpse" }], listings: { query: "gray crew neck sweater", status: "error", offers: [], offerId: null, error: "Search service unavailable" } };

    case "wallet-not-ready": return { ...s, screen: { id: "wallet" }, stack: [{ id: "glimpse" }], wallet: { ...s.wallet, status: "not-ready" } };
    case "payment-ready": return payState("ready");
    case "payment-pending": return payState("pending", order("processing", "pending"));
    case "payment-needs-action": return payState("needs-action", order("requires_action", "pending"));
    case "payment-confirmed": return payState("confirmed", order("succeeded", "pending"));
    case "payment-error": return payState("error", order("failed", "pending"), "Your card was declined (sandbox)");
    case "order-accepted": return payState("accepted", order("succeeded", "accepted"));
    case "order-recovery": return payState("recovery", null, "The seller's price changed. Review the new total.");
    case "sponsored-offer": { const sp: Offer = { ...offers[0], id: "sponsored-1", name: "Crewneck knit sweater, stone gray", retailer: "Form Studio", sponsored: { campaignId: "camp_demo", disclosure: "Sponsored", attributionToken: "fixture", model: "cpc" }, badge: undefined }; return withOffers([sp, ...offers], "ready"); }
    case "external-offer": return withOffers(offers.filter((o) => o.kind === "external_link"), "ready");
    case "autobuy-on": return { ...s, screen: { id: "wallet" }, stack: [{ id: "glimpse" }], wallet: { ...s.wallet, ...readyWallet, autoBuy: "on", ruleSummary: "Glance Demo Market · tomatoes · $10/order" } };
    case "autobuy-paused": return { ...s, screen: { id: "wallet" }, stack: [{ id: "glimpse" }], wallet: { ...s.wallet, ...readyWallet, autoBuy: "paused", ruleSummary: "Glance Demo Market · tomatoes · $10/order" } };
    case "refunded": { const o = order("refunded", "canceled"); return { ...s, screen: { id: "wallet-order", params: { orderId: o.id } }, stack: [{ id: "glimpse" }, { id: "wallet" }, { id: "wallet-orders" }], wallet: { ...s.wallet, ...readyWallet, orders: [o] } }; }
    case "disconnected": return { ...s, screen: { id: "picker" }, capture: "native", pairing: { status: "stale", code: "K7P2QX" } };
    case "grocery-cart": {
      const cart = [
        { productKey: "greek-yogurt-vanilla-32oz", label: "Greek yogurt, vanilla", packageSize: "32 oz", quantity: 1, unitPriceCents: 549, currency: "USD" as const, priceSource: "catalog" as const, confirmed: true, events: ["greek-yogurt-vanilla-32oz#1"] },
        { productKey: "bananas-lb", label: "Bananas", packageSize: "per lb", quantity: 2, unitPriceCents: 69, currency: "USD" as const, priceSource: "catalog" as const, confirmed: true, events: ["bananas-lb#1", "bananas-lb#2"] },
        { productKey: "custom-local-honey", label: "Local honey", packageSize: null, quantity: 1, unitPriceCents: null, currency: "USD" as const, priceSource: "unknown" as const, confirmed: true, events: ["custom#1"] },
      ];
      return { ...s, mode: "grocery", screen: { id: "grocery" }, grocery: { ...s.grocery, cart, scanning: !live } };
    }
    case "grocery-item": return { ...s, mode: "grocery", screen: { id: "grocery-item", params: { productKey: "lemonade-59oz" } }, stack: [{ id: "grocery" }], grocery: { ...s.grocery, heldKey: "lemonade-59oz", heldLabel: "Lemonade", heldSize: "59 oz", insights: { "lemonade-59oz": { status: "ready", data: sampleInsight("lemonade-59oz") } } } };
    case "grocery-checkout": { const cart = [{ productKey: "greek-yogurt-vanilla-32oz", label: CATALOG_BY_ID["greek-yogurt-vanilla-32oz"].name, packageSize: "32 oz", quantity: 1, unitPriceCents: 549, currency: "USD" as const, priceSource: "catalog" as const, confirmed: true, events: ["e1"] }]; return { ...s, mode: "grocery", screen: { id: "grocery-checkout" }, stack: [{ id: "grocery" }], grocery: { ...s.grocery, summary: buildTripSummary(cart, 449) } }; }
    case "gourmet-recipe": { const r = SAMPLE_RECIPES["fettuccine alfredo"]; return { ...s, mode: "gourmet", screen: { id: "gourmet-recipe", params: { recipeId: r[0].id } }, stack: [{ id: "gourmet" }, { id: "gourmet-recipes" }], gourmet: { ...s.gourmet, scan: "result", dish: "Fettuccine Alfredo", recipes: r, recipesStatus: "ready", recipeId: r[0].id } }; }
    case "overflow-long-labels": return withOffers([{ ...offers[0], name: "Extraordinarily long product name designed to test wrapping behaviour of the two-line offer title in a 600 by 600 display without clipping", retailer: "A Retailer With An Unusually Long Name Inc." }], "ready");
    default: return s;
  }
}
