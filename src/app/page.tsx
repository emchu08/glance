import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Glasses, Hand, Lock, Sparkles } from "lucide-react";
import { Wordmark } from "@/components/marketing/Brand";
import { FloatingCta } from "@/components/marketing/FloatingCta";
import { HeroViewport } from "@/components/marketing/HeroViewport";
import { SignalBars } from "@/components/marketing/SignalBars";

export const metadata: Metadata = { title: { absolute: "Glance — Buy with your eyes" } };
export const viewport: Viewport = { themeColor: "#3d7bd6", colorScheme: "light" };

const SAVES = [
  { name: "Nike Zoom Vomero 5", price: "$129", store: "StockX", when: "Today", where: "Capitol Hill, Seattle", tone: "bg-gradient-to-br from-stone-200 to-stone-400" },
  { name: "New Balance 530", price: "$74.99", store: "Zappos", when: "Today", where: "Capitol Hill, Seattle", tone: "bg-gradient-to-br from-slate-100 to-slate-300" },
  { name: "Arc'teryx Atom Hoody", price: "$280", store: "REI", when: "Sat", where: "Discovery Park", tone: "bg-gradient-to-br from-red-500 to-red-700" },
  { name: "RXBAR Chocolate Sea Salt", price: "$2.17", store: "Amazon", when: "Thu", where: "PCC Community Markets", tone: "bg-gradient-to-br from-amber-700 to-amber-900" },
];

export default function Home() {
  return (
    <main className="light-page bg-white text-ink">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: "linear-gradient(180deg,#3d7bd6 0%,#5f97e3 28%,#8dbdef 50%,#c9def6 68%,#eef4fc 82%,#ffffff 100%)" }}>
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-50 [mask-image:radial-gradient(60%_50%_at_50%_30%,#000,transparent)]" />
        <div className="pointer-events-none absolute left-0 right-0 top-[38%] h-24 bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute left-0 right-0 top-[52%] h-px bg-white/40" />
        <Brackets />
        <nav className="absolute inset-x-0 top-0 z-10 mx-auto flex h-20 max-w-[1152px] items-center justify-between px-6">
          <Link href="/" aria-label="Glance home"><Wordmark light /></Link>
          <div className="hidden items-center gap-7 text-[15px] font-medium text-white/90 md:flex">
            <Link href="/#how-it-helps" className="hover:text-white">How it works</Link>
            <Link href="/demo" className="hover:text-white">Live demo</Link>
            <Link href="/glasses" className="hover:text-white">Glasses view</Link>
          </div>
        </nav>
        <div className="relative mx-auto max-w-[1152px] px-6 pb-16 pt-[104px] md:min-h-[696px] md:pt-[150px]">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/15 px-4 py-1.5 text-[13px] font-medium text-white backdrop-blur"><span className="h-2 w-2 rounded-full bg-white" /> Made for Meta glasses</span>
            <h1 className="display mt-6 text-white">Buy with your eyes</h1>
            <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-white/90">See something you love. Compare it, choose it, and buy eligible items with your saved Visa card, right inside your glasses.</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link id="hero-cta" href="/connect" className="cta-blue inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold"><Glasses size={18} /> Connect glasses</Link>
              <Link href="/demo" className="inline-flex items-center rounded-full border border-white/50 bg-white/10 px-6 py-3.5 text-[15px] font-semibold text-white backdrop-blur hover:bg-white/20">Try the demo</Link>
            </div>
            <Link href="/glasses" className="mt-4 inline-block text-[14px] text-white/80 underline-offset-4 hover:underline">Preview the in-lens view</Link>
          </div>
          <HeroViewport />
        </div>
      </section>
      <FloatingCta />

      {/* ── 1. How Glance helps ──────────────────────────────────────────── */}
      <section id="how-it-helps" className="mx-auto max-w-[1152px] px-6 py-16 md:py-28">
        <h2 className="text-center font-serif text-4xl tracking-tight md:text-5xl">How Glance helps while you shop</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <article className="relative overflow-hidden rounded-[32px] p-8 text-white" style={{ background: "linear-gradient(160deg,#7f9cf3,#6488ee)" }}>
            <div className="rounded-[20px] border border-white/25 bg-black/15 p-5 backdrop-blur">
              <div className="flex items-center justify-between text-[12px] uppercase tracking-wider text-white/80"><span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-white/80" /> Identifying</span><span>94% signal</span></div>
              <div className="mt-4 text-[26px] font-semibold tracking-tight">Nike Zoom Vomero 5</div>
              <SignalBars />
            </div>
            <h3 className="mt-8 text-2xl font-semibold tracking-tight">Glance sees what you’re looking at</h3>
            <p className="mt-2 text-white/85">It recognizes products the moment you linger, so the answer is ready before you ask.</p>
          </article>
          <article className="rounded-[32px] bg-mist p-8">
            <div className="rounded-[20px] border border-rule bg-white p-5 shadow-sm">
              <div className="inline-flex items-center gap-2 rounded-full bg-mist px-3 py-1 text-[12px] font-medium text-ink-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-action" /> Listening</div>
              <p className="mt-3 text-[17px] font-medium">“Where is it cheapest?”</p>
              <ul className="mt-3 divide-y divide-rule text-[15px]">
                {[["StockX", "$129", true], ["GOAT", "$138"], ["Foot Locker", "$149.99"], ["Nike", "$160"]].map(([s, p, best]) => <li key={s as string} className="flex items-center justify-between py-2"><span>{s}</span><span className="font-medium">{p}{best ? <span className="ml-2 rounded-full bg-best/30 px-2 py-0.5 text-[11px] text-green-900">best</span> : null}</span></li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2 text-[13px]">{["Identify", "Similar", "Compare prices", "Save"].map((c) => <span key={c} className="rounded-full border border-rule px-3 py-1 text-ink-muted">{c}</span>)}</div>
              <p className="mt-3 text-[12px] text-ink-subtle">Ask about what you’re looking at, or pinch to save.</p>
            </div>
            <h3 className="mt-8 text-2xl font-semibold tracking-tight">When you want more, Glance shops for you</h3>
            <p className="mt-2 text-ink-muted">Ask out loud, like ‘under $80’ or ‘where is it cheapest?’, and the answer shows up in your lens.</p>
          </article>
        </div>
      </section>

      {/* ── 2. Your wardrobe, saved ──────────────────────────────────────── */}
      <section className="mx-auto max-w-[1152px] px-6 pb-16 md:pb-28">
        <div className="rounded-[36px] p-6 md:p-12" style={{ background: "linear-gradient(160deg,#c4cae6,#e6e9f5)" }}>
          <div className="text-center"><h2 className="font-serif text-4xl tracking-tight md:text-5xl">Your wardrobe, saved</h2><p className="mx-auto mt-3 max-w-xl text-ink-muted">Everything you save with a glance lands in the Glance app, with the best price attached.</p></div>
          <div className="relative mx-auto mt-10 max-w-3xl overflow-hidden rounded-[20px] border border-white/60 bg-white shadow-xl">
            <div className="flex items-center gap-2 border-b border-rule px-4 py-3"><span className="h-3 w-3 rounded-full bg-[#ff5f57]" /><span className="h-3 w-3 rounded-full bg-[#febc2e]" /><span className="h-3 w-3 rounded-full bg-[#28c840]" /><span className="ml-3 flex-1 rounded-md bg-mist px-3 py-1 text-[13px] text-ink-subtle">Search your saves</span><span className="rounded-full bg-best/30 px-2 py-0.5 text-[11px] font-medium text-green-900">Glance on</span></div>
            <div className="p-5">
              <div className="flex items-center justify-between"><div><div className="text-[12px] uppercase tracking-wider text-ink-subtle">This week</div><div className="text-lg font-semibold">Saved from your glasses</div></div><div className="flex gap-1 text-[12px]">{["All", "Sneakers", "Outerwear", "Food"].map((c, i) => <span key={c} className={i === 0 ? "rounded-full bg-ink px-2.5 py-1 text-white" : "rounded-full border border-rule px-2.5 py-1 text-ink-muted"}>{c}</span>)}</div></div>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">{SAVES.map((s) => <li key={s.name} className="flex items-center gap-3 rounded-2xl border border-rule p-3"><span className={`h-14 w-14 flex-none rounded-xl ${s.tone}`} /><div className="min-w-0"><div className="truncate font-medium">{s.name}</div><div className="text-[13px] text-ink-muted">{s.price} at {s.store}</div><div className="text-[12px] text-ink-subtle">{s.when} · {s.where}</div></div></li>)}</ul>
            </div>
            <div className="absolute bottom-4 right-4 flex gap-2 text-[13px]"><span className="rounded-full bg-ink px-3 py-1.5 text-white shadow">Resume shopping</span><span className="rounded-full border border-rule bg-white px-3 py-1.5 shadow">Ask Glance about your saves</span></div>
          </div>
        </div>
      </section>

      {/* ── 3. Built for the glasses you already wear ────────────────────── */}
      <section className="mx-auto max-w-[1152px] px-6 pb-16 md:pb-28">
        <h2 className="text-center font-serif text-4xl tracking-tight md:text-5xl">Built for the glasses you already wear</h2>
        <p className="mt-3 text-center text-ink-muted">Made for a screen that sits in your lens, not in your hand.</p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <Card icon={<Lock size={18} />} title="Private to you.">
            <div className="grid grid-cols-2 overflow-hidden rounded-2xl">
              <div className="relative aspect-[4/5] bg-[url('/samples/street.svg')] bg-cover bg-center"><span className="absolute left-[38%] top-[48%] h-[30%] w-[32%] rounded border-2 border-white" /><span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">96%</span><span className="absolute bottom-2 left-2 text-[11px] text-white/90">Wearer</span></div>
              <div className="relative aspect-[4/5] bg-[url('/samples/street.svg')] bg-cover bg-center"><span className="absolute bottom-2 left-2 text-[11px] text-white/90">Bystander</span></div>
            </div>
            <p className="mt-4 text-ink-muted">Only you see what Glance sees. No identity, no eye tracking, nothing saved unless you ask.</p>
          </Card>
          <Card icon={<Hand size={18} />} title="Hands-free by design.">
            <div className="rounded-2xl bg-mist p-4">
              <ul className="space-y-2 text-[15px] font-medium">{["Save", "Similar styles", "Compare prices"].map((m, i) => <li key={m} className={i === 0 ? "rounded-xl bg-white px-3 py-2 shadow-sm" : "px-3 py-2 text-ink-muted"}>{m}</li>)}</ul>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px] text-ink-subtle">{["Pinch", "Swipe", "Tap", "Voice"].map((g) => <span key={g}><span className="mx-auto mb-1 block h-8 w-8 rounded-full border border-rule bg-white" />{g}</span>)}</div>
            </div>
            <p className="mt-4 text-ink-muted">Temple swipes and a pinch do the work. Illustrative controls; the web app never asks for your microphone.</p>
          </Card>
          <Card icon={<Sparkles size={18} />} title="Remembers your taste.">
            <div className="rounded-2xl border border-rule p-4 text-[13px]">
              <div className="flex items-center justify-between"><span className="font-medium">Your taste profile</span><span className="text-ink-subtle">Learned from 24 saves</span></div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-ink-muted"><dt>Budget</dt><dd className="text-ink">$60–120</dd><dt>Shoe size</dt><dd className="text-ink">US 10</dd><dt>Top</dt><dd className="text-ink">M</dd><dt>Colors</dt><dd className="text-ink">Neutral, earth</dd><dt>Brands</dt><dd className="text-ink">New Balance, ASICS, Nike</dd><dt>Diet</dt><dd className="text-ink">Gluten-free</dd></dl>
              <p className="mt-3 rounded-xl bg-mist p-3 text-ink">New Balance 530 matches Alex’s size and neutral style, and fits the budget.</p>
            </div>
            <p className="mt-4 text-ink-muted">A sample profile, not an editable account page.</p>
          </Card>
        </div>
      </section>

      {/* ── 4. Connect supported Meta glasses ────────────────────────────── */}
      <section className="mx-auto max-w-[1152px] px-6 pb-16 md:pb-28">
        <div className="rounded-[32px] border border-rule p-8 md:p-12">
          <h2 className="font-serif text-3xl tracking-tight md:text-4xl">Connect supported Meta glasses</h2>
          <div className="mt-6 grid gap-6 text-[15px] text-ink-muted md:grid-cols-2">
            <div><p className="font-medium text-ink-subtle">Display glasses · in-lens shopping</p><p className="mt-1">Meta Ray-Ban Display (verification pending on physical hardware). Shows the 600×600 lens with the right-lens display and temple input through the Glance companion.</p></div>
            <div><p className="font-medium text-ink-subtle">Camera-only glasses · phone or laptop shows the lens</p><p className="mt-1">Ray-Ban Meta and Oakley Meta camera models send frames through the companion; the lens runs on your phone or in this browser.</p></div>
          </div>
          <p className="mt-5 text-[13px] text-ink-subtle">Tested in this build: browser preview with sample scenario and browser camera. Physical-device checks are listed in the connect page. A website button cannot install a native app; the companion is built from the repository with Xcode.</p>
          <Link href="/connect" className="cta-blue mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold"><Glasses size={18} /> Connect glasses</Link>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1152px] flex-col items-start gap-4 px-6 py-10 text-[14px] text-ink-muted md:flex-row md:items-center md:justify-between">
          <Wordmark />
          <p>Glance is a concept built at DubHacks 2026. Not affiliated with Meta.</p>
          <div className="flex gap-5"><Link href="/demo" className="hover:text-ink">Live demo</Link><Link href="/glasses" className="hover:text-ink">Glasses view</Link><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link></div>
        </div>
      </footer>
    </main>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <article className="rounded-[32px] border border-rule bg-white p-6"><div className="mb-4 flex items-center gap-2 text-ink-subtle">{icon}<h3 className="text-xl font-semibold tracking-tight text-ink">{title}</h3></div>{children}</article>;
}

function Brackets() {
  const c = "absolute h-[34px] w-[34px] border-white/70 md:h-14 md:w-14";
  return (
    <div className="pointer-events-none absolute left-1/2 top-[104px] h-[476px] w-[calc(100vw-32px)] max-w-[1020px] -translate-x-1/2 md:top-[150px] md:h-[546px]" aria-hidden>
      <span className={`${c} left-0 top-0 border-l-2 border-t-2`} /><span className={`${c} right-0 top-0 border-r-2 border-t-2`} /><span className={`${c} bottom-0 left-0 border-b-2 border-l-2`} /><span className={`${c} bottom-0 right-0 border-b-2 border-r-2`} />
    </div>
  );
}
