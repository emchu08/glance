"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { Check, CreditCard, Glasses, ShieldCheck, Wallet } from "lucide-react";
import { DEMO_CATALOG, DEMO_MERCHANT_ID } from "@/data/merchant";
import { formatCents } from "@/domain/money";

interface WalletView { status: "signed-out" | "not-ready" | "ready"; brand: string | null; last4: string | null; autoBuy: "off" | "on" | "paused"; ruleSummary: string | null; email: string | null }

const CONSENT_VERSION = "saved-card-2026-10-v1";

async function api<T>(url: string, body?: unknown, method = body ? "POST" : "GET"): Promise<T> {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export function WalletSetup({ initialUser, initialWallet, publishableKey, sandbox }: { initialUser: { email: string | null } | null; initialWallet: WalletView | null; publishableKey: string; sandbox: boolean }) {
  const [user, setUser] = useState(initialUser);
  const [wallet, setWallet] = useState<WalletView | null>(initialWallet);
  const [error, setError] = useState<string | null>(null);
  const step = !user ? 1 : wallet?.status === "ready" ? 3 : 2;

  const refresh = async () => { try { setWallet(await api<WalletView>("/api/wallet")); } catch { /* signed out */ } };

  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-xl px-6 py-10">
        <header className="mb-8 flex items-center justify-between">
          <Link href="/" className="font-serif text-2xl text-fg">glance</Link>
          <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-muted">{sandbox ? "Sandbox · Payments by Stripe" : "Live"}</span>
        </header>

        <h1 className="text-3xl font-semibold tracking-tight">Set up your Glance wallet</h1>
        <p className="mt-2 text-muted">One-time setup. After this, eligible purchases happen with a single Buy on your glasses. Card details stay with Stripe; Glance keeps only a masked reference.</p>

        <ol className="mt-8 grid gap-3">
          <StepCard n={1} title="Glance account" done={step > 1} active={step === 1} icon={<Glasses size={18} />}>
            {user ? <p className="text-sm text-muted">Signed in as <span className="text-fg">{user.email}</span>. <button className="underline" onClick={async () => { await api("/api/auth", { action: "sign-out" }); setUser(null); setWallet(null); }}>Sign out</button></p> : <AuthForm onDone={async (email) => { setUser({ email }); await refresh(); }} onError={setError} />}
          </StepCard>

          <StepCard n={2} title="Saved card" done={step > 2} active={step === 2} icon={<CreditCard size={18} />}>
            {wallet?.status === "ready" ? (
              <div className="flex items-center justify-between text-sm">
                <span>{wallet.brand} •• {wallet.last4} · ready</span>
                <button className="text-muted underline" onClick={async () => { await api("/api/wallet", undefined, "DELETE"); await refresh(); }}>Remove</button>
              </div>
            ) : user ? (
              <CardSetup publishableKey={publishableKey} sandbox={sandbox} onSaved={(w) => setWallet(w)} onError={setError} />
            ) : <p className="text-sm text-subtle">Sign in first.</p>}
          </StepCard>

          <StepCard n={3} title="Delivery and Auto-buy (optional)" done={false} active={step === 3} icon={<ShieldCheck size={18} />}>
            {wallet?.status === "ready" ? <RuleForm wallet={wallet} onChange={setWallet} onError={setError} /> : <p className="text-sm text-subtle">Available after a card is saved.</p>}
          </StepCard>
        </ol>

        {error && <p className="mt-4 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">{error}</p>}

        {wallet?.status === "ready" && (
          <div className="mt-8 rounded-2xl border border-best/30 bg-best/10 p-5">
            <div className="flex items-center gap-2 font-medium text-best"><Check size={18} /> Ready to shop</div>
            <p className="mt-1 text-sm text-muted">Open the lens and the wallet chip shows <b className="text-fg">{wallet.brand} •• {wallet.last4}</b>. Eligible offers show <b className="text-fg">Buy $X</b>.</p>
            <div className="mt-3 flex gap-2 text-sm">
              <Link href="/glasses" className="rounded-full bg-fg px-4 py-2 font-medium text-canvas">Open glasses view</Link>
              <Link href="/demo" className="rounded-full border border-white/20 px-4 py-2">Presenter</Link>
            </div>
          </div>
        )}

        <p className="mt-10 text-xs text-subtle">
          <Wallet size={12} className="mr-1 inline" /> Saved-card consent {CONSENT_VERSION}. Removing your card pauses Auto-buy; pending orders keep their records. A saved card cannot guarantee your bank will never ask to verify a payment; when it does, the lens sends you here to finish. See <Link className="underline" href="/privacy">Privacy</Link> and <Link className="underline" href="/terms">Terms</Link>.
        </p>
      </div>
    </main>
  );
}

function StepCard({ n, title, done, active, icon, children }: { n: number; title: string; done: boolean; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className={clsx("rounded-2xl border p-5", active ? "border-wearer/50 bg-surface" : "border-white/10 bg-surface/50")}>
      <div className="mb-3 flex items-center gap-3">
        <span className={clsx("grid h-7 w-7 place-items-center rounded-full text-xs font-semibold", done ? "bg-best text-canvas" : active ? "bg-wearer text-canvas" : "bg-white/10 text-muted")}>{done ? <Check size={14} /> : n}</span>
        <span className="font-medium">{title}</span>
        <span className="ml-auto text-muted">{icon}</span>
      </div>
      {children}
    </li>
  );
}

function AuthForm({ onDone, onError }: { onDone: (email: string) => void; onError: (e: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [busy, setBusy] = useState(false);
  return (
    <form className="grid gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); onError(null); try { await api("/api/auth", { action: mode, email, password }); onDone(email); } catch (err) { onError((err as Error).message); } finally { setBusy(false); } }}>
      <input className="rounded-xl border border-white/15 bg-canvas px-3 py-2 text-sm" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      <input className="rounded-xl border border-white/15 bg-canvas px-3 py-2 text-sm" type="password" required minLength={8} placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} />
      <div className="flex items-center gap-3">
        <button disabled={busy} className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas disabled:opacity-60">{busy ? "…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
        <button type="button" className="text-sm text-muted underline" onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}>{mode === "sign-up" ? "I have an account" : "Create an account"}</button>
      </div>
    </form>
  );
}

function CardSetup({ publishableKey, sandbox, onSaved, onError }: { publishableKey: string; sandbox: boolean; onSaved: (w: WalletView) => void; onError: (e: string | null) => void }) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => (publishableKey ? loadStripe(publishableKey) : null), [publishableKey]);
  useEffect(() => {
    api<{ clientSecret: string }>("/api/wallet/setup", { action: "setup-intent" }).then((r) => setClientSecret(r.clientSecret)).catch((e) => onError((e as Error).message));
  }, [onError]);
  return (
    <div className="grid gap-4">
      {sandbox && (
        <button disabled={busy} className="flex items-center justify-between rounded-xl border border-stripe/60 bg-stripe/10 px-4 py-3 text-left text-sm hover:bg-stripe/20 disabled:opacity-60" onClick={async () => { setBusy(true); onError(null); try { onSaved(await api<WalletView>("/api/wallet/setup", { action: "use-test-visa", consentVersion: CONSENT_VERSION })); } catch (e) { onError((e as Error).message); } finally { setBusy(false); } }}>
          <span><b>Use Stripe’s test Visa •• 4242</b><br /><span className="text-muted">Attaches Stripe’s sandbox test card as a real saved method. Fastest for the demo.</span></span>
          <span className="rounded-full bg-stripe px-3 py-1 text-xs font-medium text-white">{busy ? "Saving…" : "Use"}</span>
        </button>
      )}
      <div className="text-xs uppercase tracking-wide text-subtle">or enter a card</div>
      {clientSecret && stripePromise ? (
        <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "night", variables: { colorPrimary: "#635bff", colorBackground: "#16132b", borderRadius: "12px", fontFamily: "Geist, system-ui, sans-serif" } } }}>
          <ElementsForm onSaved={onSaved} onError={onError} />
        </Elements>
      ) : <p className="text-sm text-subtle">Loading secure card form…</p>}
    </div>
  );
}

function ElementsForm({ onSaved, onError }: { onSaved: (w: WalletView) => void; onError: (e: string | null) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  return (
    <form className="grid gap-3" onSubmit={async (e) => {
      e.preventDefault();
      if (!stripe || !elements) return;
      setBusy(true); onError(null);
      try {
        const { error, setupIntent } = await stripe.confirmSetup({ elements, redirect: "if_required", confirmParams: { return_url: `${window.location.origin}/wallet/setup` } });
        if (error) throw new Error(error.message);
        const pm = typeof setupIntent?.payment_method === "string" ? setupIntent.payment_method : setupIntent?.payment_method?.id;
        if (!pm) throw new Error("No payment method returned");
        onSaved(await api<WalletView>("/api/wallet/setup", { action: "save", paymentMethodId: pm, consentVersion: CONSENT_VERSION }));
      } catch (err) { onError((err as Error).message); } finally { setBusy(false); }
    }}>
      <PaymentElement options={{ layout: "tabs" }} />
      <label className="flex items-start gap-2 text-xs text-muted"><input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} required /> Save this card for purchases I start on my Glance glasses. I can remove it any time.</label>
      <button disabled={!stripe || busy || !consent} className="rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas disabled:opacity-60">{busy ? "Saving…" : "Save card"}</button>
    </form>
  );
}

function RuleForm({ wallet, onChange, onError }: { wallet: WalletView; onChange: (w: WalletView) => void; onError: (e: string | null) => void }) {
  const [sku, setSku] = useState(DEMO_CATALOG[1].sku);
  const [perOrder, setPerOrder] = useState(10);
  const [total, setTotal] = useState(40);
  const [busy, setBusy] = useState(false);
  const [delivery, setDelivery] = useState("");
  if (wallet.autoBuy !== "off") {
    return (
      <div className="text-sm">
        <p>Auto-buy is <b>{wallet.autoBuy}</b> · {wallet.ruleSummary}</p>
        <div className="mt-2 flex gap-2">
          <button className="rounded-full border border-white/20 px-3 py-1.5" onClick={async () => { try { onChange(await api<WalletView>("/api/purchase-rules/pause", { pause: wallet.autoBuy === "on" })); } catch (e) { onError((e as Error).message); } }}>{wallet.autoBuy === "on" ? "Pause" : "Resume"}</button>
        </div>
        <p className="mt-2 text-xs text-subtle">Pausing blocks new attempts; it never undoes a completed charge. Rules expire in 30 days and are versioned.</p>
      </div>
    );
  }
  return (
    <form className="grid gap-3 text-sm" onSubmit={async (e) => { e.preventDefault(); setBusy(true); onError(null); try { const r = await api<{ wallet: WalletView }>("/api/purchase-rules", { merchantId: DEMO_MERCHANT_ID, skus: [sku], perOrderLimitCents: perOrder * 100, cumulativeLimitCents: total * 100, maxQuantity: 1, expiresInDays: 30, terms: { delivery, trigger: "recognized exact item on approved list" } }); onChange(r.wallet); } catch (err) { onError((err as Error).message); } finally { setBusy(false); } }}>
      <p className="text-muted">Optional. Lets Glance buy one specific item from one seller without a second confirmation, within limits you set. Off until you turn it on.</p>
      <label className="grid gap-1">Delivery address (demo, stored privately)<input className="rounded-xl border border-white/15 bg-canvas px-3 py-2" value={delivery} onChange={(e) => setDelivery(e.target.value)} placeholder="1234 NE 45th St, Seattle" /></label>
      <label className="grid gap-1">Item (Glance Demo Market)<select className="rounded-xl border border-white/15 bg-canvas px-3 py-2" value={sku} onChange={(e) => setSku(e.target.value)}>{DEMO_CATALOG.map((i) => <option key={i.sku} value={i.sku}>{i.name} · {formatCents(i.unitPriceCents)}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">Per order limit ($)<input type="number" min={1} max={500} className="rounded-xl border border-white/15 bg-canvas px-3 py-2" value={perOrder} onChange={(e) => setPerOrder(Number(e.target.value))} /></label>
        <label className="grid gap-1">Total budget ($)<input type="number" min={perOrder} max={5000} className="rounded-xl border border-white/15 bg-canvas px-3 py-2" value={total} onChange={(e) => setTotal(Number(e.target.value))} /></label>
      </div>
      <button disabled={busy} className="justify-self-start rounded-full border border-wearer/60 px-4 py-2 font-medium text-wearer disabled:opacity-60">{busy ? "Saving…" : "Enable Auto-buy"}</button>
    </form>
  );
}
