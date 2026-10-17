# Change log (implementation notes)

- **Purchase effect read stale reducer state** — Buy dispatched `payment/submit` and ran the effect in the same tick;
  the effect checked `status === "pending"` from a pre-render snapshot and bailed. Fixed by reading the quote from the
  snapshot and guarding re-entry with the attempt key (`src/lens/LensProvider.tsx`). Verified by a real sandbox order.
- **Offer prev/next had no visible affordance** — D-pad focus landed on invisible actions. Added chevrons around the
  position dots (`views.tsx` Position) so the focus ring always has a target.
- **Held-item card persisted after a camera-confirmed add** — the reducer now returns to the cart when the tracker
  emits `add` for the card's product, so the next hold opens its own card.
- **Held tie-break** — `currentlyHeld` prefers the most recently observed hold, then confidence (sparkling water vs lemonade).
- **Node 26 strips types but rejects parameter properties** — classes use explicit fields; tests/scripts run through
  `tests/register-hooks.mjs` (alias + strip) so no build step is needed.
- **Stripe SDK v23** — `payment_method_types` was removed; `allowed_payment_method_types` is used for SetupIntent/PaymentIntent.
- **Connect account creation blocked by platform profile** — documented fallback to platform-managed ledger; re-run seed after completing the Dashboard step.
- **Lens title duplication on centered states** — screens with a centered status heading (added, bought, handoff, nav) no longer render a second title.
- **Container-query scaling of the lens failed inside blend layers** — replaced with a ResizeObserver scale.
