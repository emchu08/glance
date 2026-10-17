import type { Metadata } from "next";
import Link from "next/link";
import { formatCents } from "@/domain/money";
import { currentUser, supabaseAdmin } from "@/server/supabase";

export const metadata: Metadata = { title: "Advertiser" };
export const dynamic = "force-dynamic";

/** Role-scoped campaign reporting: qualified clicks, verified conversions, attributed order value, fees, balances. */
export default async function AdvertiserPage() {
  const user = await currentUser().catch(() => null);
  const sb = supabaseAdmin();
  const membership = user ? (await sb.from("advertiser_members").select("advertiser_id").eq("user_id", user.id).limit(1).maybeSingle()).data : null;
  if (!membership) {
    return <Shell><h1 className="text-3xl font-semibold tracking-tight">Advertiser</h1><p className="mt-2 text-muted">Campaign controls and reporting require an advertiser role. Sponsored listings are always labeled, never purchase authority, and billed only for qualified clicks or verified conversions under a signed agreement.</p>{!user && <Link className="mt-4 inline-block underline" href="/wallet/setup">Sign in</Link>}</Shell>;
  }
  const { data: campaigns } = await sb.from("campaigns").select("*").eq("advertiser_id", membership.advertiser_id);
  const { data: events } = await sb.from("ad_events").select("campaign_id, kind, billable, amount_cents, order_id").in("campaign_id", (campaigns ?? []).map((c) => c.id));
  const { data: invoices } = await sb.from("ad_invoices").select("*").eq("advertiser_id", membership.advertiser_id);
  return (
    <Shell>
      <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
      <div className="mt-6 grid gap-4">
        {(campaigns ?? []).map((c) => {
          const ev = (events ?? []).filter((e) => e.campaign_id === c.id);
          const clicks = ev.filter((e) => e.kind === "click" && e.billable).length;
          const conv = ev.filter((e) => e.kind === "conversion" && e.billable).length;
          const fees = ev.filter((e) => e.billable).reduce((s, e) => s + e.amount_cents, 0);
          return (
            <div key={c.id} className="rounded-2xl border border-white/10 bg-surface p-5 text-sm">
              <div className="flex items-center justify-between"><span className="font-medium">{c.title}</span><span className="rounded-full border border-white/20 px-2 py-0.5 text-xs">{c.model.toUpperCase()} · {c.status}</span></div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <K k="Impressions" v={String(ev.filter((e) => e.kind === "impression").length)} /><K k="Qualified clicks" v={String(clicks)} /><K k="Verified conversions" v={String(conv)} /><K k="Gross fees" v={formatCents(fees)} /><K k="Budget" v={`${formatCents(c.spent_cents)} / ${formatCents(c.budget_cents)}`} />
              </div>
              <p className="mt-2 text-xs text-subtle">Sandbox campaign · labeled test ledger entries · not earned revenue.</p>
            </div>
          );
        })}
      </div>
      <h2 className="mt-10 text-lg font-medium">Invoices</h2>
      {(invoices ?? []).length ? invoices!.map((i) => <div key={i.id} className="mt-2 text-sm">{i.period_start} → {i.period_end} · {formatCents(i.total_cents)} · {i.status}</div>) : <p className="mt-2 text-sm text-muted">Invoices aggregate qualified entries per billing period through a separate Stripe customer. None yet.</p>}
    </Shell>
  );
}

function K({ k, v }: { k: string; v: string }) { return <div><div className="text-xs text-subtle">{k}</div><div className="font-medium">{v}</div></div>; }
function Shell({ children }: { children: React.ReactNode }) { return <main className="min-h-dvh bg-canvas text-fg"><div className="mx-auto max-w-3xl px-6 py-10"><Link href="/" className="font-serif text-2xl">glance</Link><div className="mt-6">{children}</div></div></main>; }
