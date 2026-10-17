import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Check, Glasses, Smartphone, Wallet, ShieldCheck } from "lucide-react";
import { currentUser } from "@/server/supabase";
import { getWalletView } from "@/server/commerce";
import { CopyUrl } from "./CopyUrl";

export const metadata: Metadata = { title: "Connect glasses" };
export const viewport: Viewport = { themeColor: "#16132b", colorScheme: "dark" };
export const dynamic = "force-dynamic";

export default async function ConnectPage() {
  const user = await currentUser().catch(() => null);
  const wallet = user ? await getWalletView(user.id, user.email).catch(() => null) : null;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const steps = [
    { icon: <Glasses size={18} />, title: "Glance sign-in", done: !!user, body: user ? `Signed in as ${user.email}` : "Create your Glance account. It owns your wallet, permissions and orders.", cta: user ? null : { href: "/wallet/setup", label: "Sign in" } },
    { icon: <Smartphone size={18} />, title: "Meta registration and device permissions", done: false, body: "Install the Glance iPhone companion (ios/ in the repository, built with Xcode) and complete Meta’s documented Wearables Device Access Toolkit registration. Grant camera, and for display glasses, display and input. A website button cannot do this step.", cta: null },
    { icon: <Glasses size={18} />, title: "Pair display and input", done: false, body: `The companion opens ${appUrl}/lens and mirrors it to the right-lens display. Camera-only glasses send frames to the lens running on your phone or laptop instead.`, cta: null },
    { icon: <Wallet size={18} />, title: "Saved wallet and delivery", done: wallet?.status === "ready", body: wallet?.status === "ready" ? `${wallet.brand} •• ${wallet.last4} ready` : "Save a card once with Stripe and set delivery preferences.", cta: wallet?.status === "ready" ? null : { href: "/wallet/setup", label: "Set up wallet" } },
    { icon: <ShieldCheck size={18} />, title: "Ready to shop", done: wallet?.status === "ready", body: "The lens shows your card and Buy $X on eligible offers. Normal eligible repeat purchases need no phone interaction; your bank may occasionally ask to verify, which the lens hands to your phone.", cta: { href: "/glasses", label: "Open glasses view" } },
  ];
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/" className="font-serif text-2xl">glance</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Connect your glasses</h1>
        <p className="mt-2 text-muted">Device registration, Glance sign-in, and wallet setup are three separate steps in one journey. Each has one primary action and a way back.</p>
        <ol className="mt-8 grid gap-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-white/10 bg-surface p-5">
              <div className="flex items-center gap-3"><span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${s.done ? "bg-best text-canvas" : "bg-white/10 text-muted"}`}>{s.done ? <Check size={14} /> : i + 1}</span><span className="font-medium">{s.title}</span><span className="ml-auto text-muted">{s.icon}</span></div>
              <p className="mt-2 text-sm text-muted">{s.body}</p>
              {s.cta && <Link href={s.cta.href} className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas">{s.cta.label}</Link>}
            </li>
          ))}
        </ol>
        <section className="mt-10 rounded-2xl border border-white/10 p-5 text-sm text-muted">
          <h2 className="font-medium text-fg">Supported hardware (verification status)</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><b className="text-fg">Browser / phone preview</b> — verified in this build (sample scenario and browser camera).</li>
            <li><b className="text-fg">Camera-only Meta glasses</b> via the companion relay — implemented; physical-device check pending.</li>
            <li><b className="text-fg">Meta display glasses</b> with supported display/input — companion scaffold implemented against the DAT SDK; physical-device verification pending. In-lens shopping requires an actual display.</li>
            <li><b className="text-fg">Other or untested models</b> — not supported.</li>
          </ul>
          <p className="mt-3">Recovery states: no Meta app, no device, denied permission, expired session, outdated SDK, canceled registration, reconnect. The companion documents each with one next step. The WKWebView snapshot transport needs the companion in the foreground; locked-phone operation is not claimed.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2"><span>Lens URL for the companion:</span><code className="rounded bg-white/10 px-2 py-1 text-fg">{appUrl}/lens</code><CopyUrl url={`${appUrl}/lens`} /></div>
        </section>
      </div>
    </main>
  );
}
