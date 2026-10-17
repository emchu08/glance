import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/domain/money";
import { currentUser, supabaseAdmin } from "@/server/supabase";

export const metadata: Metadata = { title: "Merchant" };
export const dynamic = "force-dynamic";

/** Role-scoped merchant view: onboarding status, catalog, order status, commissions, payouts. Not reachable from the lens. */
export default async function MerchantPage() {
  const user = await currentUser().catch(() => null);
  const sb = supabaseAdmin();
  const membership = user ? (await sb.from("merchant_members").select("merchant_id, role").eq("user_id", user.id).limit(1).maybeSingle()).data : null;
  const { data: merchant } = await sb.from("merchants").select("*").eq("id", membership?.merchant_id ?? "glance-demo-market").maybeSingle();
  const { data: catalog } = await sb.from("merchant_catalog").select("*").eq("merchant_id", merchant?.id ?? "").order("sku");
  const scoped = !!membership;
  const orders = scoped ? (await sb.from("orders").select("id, reference, total_cents, commission_cents, payment_status, fulfillment_status, created_at").eq("merchant_id", membership!.merchant_id).order("created_at", { ascending: false }).limit(20)).data ?? [] : [];
  const ledger = scoped ? (await sb.from("ledger_entries").select("kind, amount_cents").eq("merchant_id", membership!.merchant_id)).data ?? [] : [];
  const sum = (k: string) => ledger.filter((l) => l.kind === k).reduce((s, l) => s + l.amount_cents, 0);
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/" className="font-serif text-2xl">glance</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{merchant?.name ?? "Merchant"}</h1>
        <p className="mt-1 text-muted">{merchant?.sandbox ? "Sandbox seller · demo merchandise · simulated fulfillment" : ""}</p>
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Stripe Connect" value={merchant?.stripe_account_id ? (merchant.charges_enabled ? "Destination charges" : "Account pending") : "Platform ledger"} note={merchant?.stripe_account_id ? merchant.stripe_account_id : "Complete the Connect platform profile in the Stripe Dashboard, then re-run npm run seed:sandbox"} />
          <Stat label="Commission" value={`${(merchant?.commission_bps ?? 0) / 100}% of item subtotal`} note={`Agreement ${merchant?.agreement_version} · sandbox example, not a production contract`} />
          <Stat label="Fulfillment" value={merchant?.fulfillment_adapter ?? "—"} note="Accepts paid orders and decrements demo stock" />
        </section>
        <h2 className="mt-10 text-lg font-medium">Catalog</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-muted"><tr><th className="py-1">SKU</th><th>Name</th><th>Price</th><th>Stock</th></tr></thead>
          <tbody>{(catalog ?? []).map((i) => <tr key={i.sku} id={i.sku} className="border-t border-white/10"><td className="py-2 font-mono text-xs">{i.sku}</td><td>{i.name}</td><td>{formatCents(i.unit_price_cents)}</td><td>{i.stock}</td></tr>)}</tbody>
        </table>
        {scoped ? (
          <>
            <h2 className="mt-10 text-lg font-medium">Orders</h2>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-muted"><tr><th className="py-1">Ref</th><th>Total</th><th>Commission</th><th>Payment</th><th>Fulfillment</th></tr></thead>
              <tbody>{orders.map((o) => <tr key={o.id} className="border-t border-white/10"><td className="py-2 font-mono text-xs">{o.reference}</td><td>{formatCents(o.total_cents)}</td><td>{formatCents(o.commission_cents)}</td><td>{o.payment_status}</td><td>{o.fulfillment_status}</td></tr>)}</tbody>
            </table>
            <h2 className="mt-10 text-lg font-medium">Ledger (sandbox)</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-4 text-sm">
              <Stat label="Gross commission" value={formatCents(sum("commission"))} /><Stat label="Merchant proceeds" value={formatCents(sum("merchant_proceeds"))} /><Stat label="Processor fees" value={formatCents(sum("processor_fee"))} /><Stat label="Refunds / reversals" value={formatCents(sum("refund") + sum("fee_reversal"))} />
            </div>
            <p className="mt-3 text-xs text-subtle">Gross commission is not profit: processor fees, refunds and disputes are separate entries. Payouts follow the Stripe account schedule when destination charges are enabled.</p>
          </>
        ) : (
          <p className="mt-10 rounded-2xl border border-white/10 p-4 text-sm text-muted">Order status, commissions and payouts require a merchant role on this account. Sign in with a merchant member account to see them. {user ? "" : <Link className="underline" href="/wallet/setup">Sign in</Link>}</p>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-surface p-4"><div className="text-xs uppercase tracking-wide text-subtle">{label}</div><div className="mt-1 font-medium">{value}</div>{note && <div className="mt-1 break-all text-xs text-muted">{note}</div>}</div>;
}
