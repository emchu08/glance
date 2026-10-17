"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";

export function Recover({ orderId, clientSecret, publishableKey, paymentStatus }: { orderId: string; clientSecret: string | null; publishableKey: string; paymentStatus: string }) {
  const [status, setStatus] = useState<string>(paymentStatus);
  const [msg, setMsg] = useState<string | null>(null);
  const stripePromise = useMemo(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);

  useEffect(() => {
    if (!clientSecret || !stripePromise) return;
    (async () => {
      const stripe = await stripePromise;
      if (!stripe) return;
      const { error, paymentIntent } = await stripe.handleNextAction({ clientSecret });
      if (error) { setMsg(error.message ?? "Verification failed"); return; }
      setStatus(paymentIntent?.status ?? "processing");
      // Reconcile with the server (authoritative state comes from Stripe + webhooks, never this redirect).
      const r = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
      if (r.ok) { const d = await r.json(); setStatus(d.order.paymentStatus); }
    })();
  }, [clientSecret, stripePromise, orderId]);

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-surface p-5 text-sm">
      {clientSecret ? <p>Your bank asked for a quick verification. Follow the prompt from your bank; this page will update when the server confirms.</p> : <p>No verification is pending for this order.</p>}
      <p className="mt-3">Status: <b>{status}</b></p>
      {msg && <p className="mt-2 text-warn">{msg}</p>}
      <div className="mt-4 flex gap-2">
        <Link href={`/orders/${orderId}`} className="rounded-full bg-fg px-4 py-2 font-medium text-canvas">View receipt</Link>
        <Link href="/glasses" className="rounded-full border border-white/20 px-4 py-2">Back to glasses</Link>
      </div>
      <p className="mt-4 text-xs text-subtle">Your selection and order are preserved. The lens shows the result once payment is verified.</p>
    </div>
  );
}
