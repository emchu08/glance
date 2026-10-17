import type { Metadata } from "next";
import Link from "next/link";
import { getOrderView } from "@/server/commerce";
import { currentUser, supabaseAdmin } from "@/server/supabase";
import { stripe } from "@/server/stripe";
import { Recover } from "./Recover";

export const metadata: Metadata = { title: "Verify payment" };
export const dynamic = "force-dynamic";

/**
 * Exceptional issuer authentication (3DS) or payment-method repair, scoped to the owner's order.
 * The client secret is only handed to the authenticated owner of a requires_action order.
 */
export default async function RecoverPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await currentUser();
  if (!user) {
    return <Shell><h1 className="text-2xl font-semibold">Sign in to continue</h1><p className="mt-2 text-muted">Only the account that started this order can verify it.</p><Link href={`/wallet/setup?next=/payments/recover/${orderId}`} className="mt-4 inline-block rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas">Sign in</Link></Shell>;
  }
  let order; let clientSecret: string | null = null;
  try {
    order = await getOrderView(user.id, orderId);
    const { data } = await supabaseAdmin().from("orders").select("stripe_payment_intent_id, payment_status").eq("id", orderId).eq("owner_id", user.id).maybeSingle();
    if (data?.stripe_payment_intent_id && data.payment_status === "requires_action") {
      const pi = await stripe().paymentIntents.retrieve(data.stripe_payment_intent_id);
      clientSecret = pi.status === "requires_action" || pi.status === "requires_confirmation" ? pi.client_secret : null;
    }
  } catch {
    return <Shell><h1 className="text-2xl font-semibold">Order not found</h1></Shell>;
  }
  return (
    <Shell>
      <h1 className="text-2xl font-semibold">Verify your payment</h1>
      <p className="mt-2 text-muted">{order.merchantName} · Ref {order.reference} · {order.paymentStatus}</p>
      <Recover orderId={orderId} clientSecret={clientSecret} publishableKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""} paymentStatus={order.paymentStatus} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-dvh bg-canvas text-fg"><div className="mx-auto max-w-lg px-6 py-10"><Link href="/" className="font-serif text-2xl">glance</Link><div className="mt-6">{children}</div></div></main>;
}
