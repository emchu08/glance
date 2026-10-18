import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/marketing/Brand";
import { FloatingCta } from "@/components/marketing/FloatingCta";
import { GlassesStage } from "@/components/marketing/GlassesStage";

export const metadata: Metadata = { title: { absolute: "Glance — Buy with your eyes" } };
export const viewport: Viewport = { themeColor: "#14120c", colorScheme: "dark" };

/** Offers as they appear in src/data/glimpse.ts, so the page shows what the lens actually returns. */
const SWEATER_OFFERS = [
  { retailer: "Temu", price: "$10.99", note: "gray, knit" },
  { retailer: "Target", price: "$25.00", note: "gray, crew neck" },
  { retailer: "Uniqlo", price: "$29.90", note: "gray, crew neck, knit" },
  { retailer: "Gap", price: "$49.95", note: "heather gray, crew neck" },
];

/** The connected sandbox seller from src/data/merchant.ts — the only in-lens checkout path. */
const BUYABLE = [
  { name: "Gray canvas tote", price: "$12.00" },
  { name: "Tomatoes, 300 g", price: "$3.20" },
  { name: "Rigatoni, 500 g", price: "$2.80" },
];

const MODES = [
  {
    name: "Glimpse",
    tint: "var(--color-glimpse)",
    job: "Look at something and get a price.",
    body: "Linger on a product and Glance names it, then lines up what it costs elsewhere. In the sample street frame it reads a gray crewneck sweater at 90% confidence and returns four sellers, cheapest first.",
  },
  {
    name: "Grocery",
    tint: "var(--color-grocery)",
    job: "Watch the cart fill and keep the total honest.",
    body: "It samples the cart every three seconds while scanning is on, ticks items off your list as they go in, and flags the unit price, the aisle, and what the nutrition label says before you commit.",
  },
  {
    name: "Gourmet",
    tint: "var(--color-gourmet)",
    job: "Turn a dish into a shoppable list.",
    body: "Point at a plate of fettuccine and get three recipes you can actually cook. Pick one and its ingredients land on a shared list, deduplicated against what the Grocery mode already saw in your cart.",
  },
];

const STATUS = [
  { what: "Buying in the lens with a saved card", state: "Working", detail: "End to end in the Stripe sandbox, with the test Visa" },
  { what: "Accounts, wallet, and order history", state: "Working", detail: "Supabase, with row-level security applied in migrations" },
  { what: "Seller commission on each order", state: "Working", detail: "Booked per order at 10% of the item subtotal" },
  { what: "Auto-buy rules with a spending cap", state: "Built", detail: "Set a ceiling and Glance stops asking under it" },
  { what: "Sponsored listings and attribution", state: "Built", detail: "Signed attribution tokens, sandbox billing only" },
  { what: "Recognition on live camera frames", state: "Built", detail: "Runs server-side; sample mode never calls a paid model" },
  { what: "Native iOS companion app", state: "Scaffolded", detail: "Builds from ios/, not yet verified on real glasses" },
];

export default function Home() {
  return (
    <main className="optical-page">
      {/* ── Hero: the frame itself, lit from the left ───────────────────── */}
      <section className="relative isolate min-h-[92svh] overflow-hidden bg-obsidian">
        <GlassesStage />

        <div className="relative z-10 mx-auto flex min-h-[92svh] max-w-[1180px] flex-col px-6">
          <nav className="flex h-20 items-center justify-between">
            <Link href="/" aria-label="Glance home" className="text-bone">
              <Wordmark light />
            </Link>
            <div className="hidden items-center gap-8 text-[15px] text-bone/70 md:flex">
              <Link href="/demo" className="hover:text-bone">Live demo</Link>
              <Link href="/glasses" className="hover:text-bone">Wearer preview</Link>
              <Link href="#status" className="hover:text-bone">What&rsquo;s built</Link>
            </div>
          </nav>

          {/* Clears the phone-only model band above; from md up the model is beside this. */}
          <div className="flex flex-1 items-center pb-14 pt-[244px] md:py-20 md:pt-20">
            <div className="max-w-[42rem]">
              <h1 className="display text-bone">Buy with your eyes</h1>
              <p className="measure-tight mt-7 text-[19px] leading-relaxed text-bone/75">
                Glance runs in the right lens of your glasses. Look at something, see
                what it costs, and pay with a saved card without taking out your phone.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link id="hero-cta" href="/demo" className="cta-lit rounded-full px-7 py-3.5 text-[15px] font-semibold">
                  Open the live demo
                </Link>
                <Link href="/connect" className="cta-quiet rounded-full px-7 py-3.5 text-[15px] font-medium">
                  Connect your glasses
                </Link>
              </div>
              <p className="mt-6 text-[14px] text-bone/60">
                Payments run in the Stripe sandbox. Nothing on this page charges a real card.
              </p>
            </div>
          </div>

          {/* The lens is square and small; stating its real size sets expectations. */}
          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-3 border-t border-graphite-soft py-6 text-[14px] text-bone/55">
            <span className="readout">600 × 600 lens, one eye</span>
            <span className="readout">Recognition in about 600 ms</span>
            <span className="readout">Three modes, one wallet</span>
            <span className="readout">Built at DubHacks 2026</span>
          </div>
        </div>
      </section>

      <FloatingCta />

      {/* ── A single purchase, in the four steps it actually takes ──────── */}
      <section className="mx-auto max-w-[1180px] px-6 pb-20 pt-20 md:pb-28 md:pt-28">
        <div className="max-w-[46rem]">
          <h2 className="headline text-warm-ink">One purchase, start to finish</h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-warm-muted">
            This is the gray canvas tote from the seeded sandbox seller, bought without
            leaving the lens. Four steps, in the order they happen.
          </p>
        </div>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-lg bg-bone-deep sm:grid-cols-2 lg:grid-cols-4">
          <Step n={1} title="You linger" caption="Recognised, 90% confident">
            <LensTile>
              {/* The box is the candidate's real frame coordinates from src/data/glimpse.ts. */}
              <div
                className="absolute rounded-sm border border-waveguide"
                style={{ left: "43%", top: "56%", width: "20%", height: "30%" }}
              />
              <div className="absolute left-5 right-5 top-5">
                <span className="readout text-[11px] text-waveguide">90%</span>
                <p className="mt-1 text-[13px] leading-snug text-bone/85">Gray crewneck sweater</p>
              </div>
            </LensTile>
          </Step>

          <Step n={2} title="It prices it" caption="Four sellers, cheapest first">
            <LensTile>
              <ul className="absolute inset-5 flex flex-col justify-center gap-2">
                {SWEATER_OFFERS.map((o, i) => (
                  <li key={o.retailer} className="flex items-baseline justify-between text-[12px]">
                    <span className={i === 0 ? "text-waveguide" : "text-bone/55"}>{o.retailer}</span>
                    <span className={`readout ${i === 0 ? "text-waveguide" : "text-bone/55"}`}>{o.price}</span>
                  </li>
                ))}
              </ul>
            </LensTile>
          </Step>

          <Step n={3} title="You confirm" caption="One quote, held for 90 seconds">
            <LensTile>
              <div className="absolute inset-5 flex flex-col justify-center">
                <span className="text-[12px] text-bone/50">Gray canvas tote</span>
                <span className="readout mt-1 text-[30px] font-semibold leading-none text-bone">$12.00</span>
                <span className="mt-4 inline-flex w-fit rounded-full bg-waveguide px-4 py-1.5 text-[12px] font-semibold text-obsidian">
                  Buy $12.00
                </span>
              </div>
            </LensTile>
          </Step>

          <Step n={4} title="It&rsquo;s charged" caption="Saved Visa, 10% to Glance">
            <LensTile>
              <div className="absolute inset-5 flex flex-col justify-center gap-2">
                <span className="readout text-[13px] text-coating">Paid · Visa 4242</span>
                <span className="text-[12px] leading-relaxed text-bone/55">
                  Order written, commission booked, receipt in your history.
                </span>
              </div>
            </LensTile>
          </Step>
        </ol>

        <p className="mt-6 text-[14px] text-warm-subtle">
          Only the connected sandbox seller can be bought in the lens: {BUYABLE.map((b) => `${b.name} at ${b.price}`).join(", ")}.
          Everything else opens as a link on your phone.
        </p>
      </section>

      {/* ── Three modes: a parallel set, so no step numbers ─────────────── */}
      <section className="border-y border-bone-deep bg-bone">
        <div className="mx-auto max-w-[1180px] px-6 py-20 md:py-28">
          <h2 className="headline max-w-[34rem] text-warm-ink">Three ways of looking</h2>
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {MODES.map((mode) => (
              <article key={mode.name} className="border-t-2 pt-5" style={{ borderColor: mode.tint }}>
                <h3 className="text-[22px] font-semibold tracking-tight text-warm-ink">{mode.name}</h3>
                <p className="mt-1.5 text-[17px] font-medium text-warm-ink">{mode.job}</p>
                <p className="mt-3 text-[15px] leading-relaxed text-warm-muted">{mode.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── The honest list ────────────────────────────────────────────── */}
      <section id="status" className="mx-auto max-w-[1180px] px-6 py-20 md:py-28">
        <div className="max-w-[46rem]">
          <h2 className="headline text-warm-ink">What&rsquo;s actually built</h2>
          <p className="measure mt-4 text-[17px] leading-relaxed text-warm-muted">
            A hackathon demo is easy to oversell, so here is the real state of it.
            Working means it runs end to end in the sandbox. Scaffolded means the code
            exists and the hardware check does not.
          </p>
        </div>

        <table className="mt-12 w-full border-collapse text-left">
          <caption className="sr-only">Glance capabilities and their current state</caption>
          <tbody>
            {STATUS.map((row) => (
              <tr key={row.what} className="border-t border-bone-deep align-baseline">
                <th scope="row" className="py-5 pr-6 text-[16px] font-medium text-warm-ink">
                  {row.what}
                </th>
                <td className="w-[8.5rem] py-5 pr-6">
                  <StateBadge state={row.state} />
                </td>
                <td className="hidden py-5 text-[15px] leading-relaxed text-warm-muted md:table-cell">
                  {row.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Hardware ───────────────────────────────────────────────────── */}
      <section className="bg-obsidian">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-6 py-20 md:grid-cols-[1fr_1fr] md:py-28">
          <div>
            <h2 className="headline text-bone">Which glasses work</h2>
            <p className="measure mt-4 text-[17px] leading-relaxed text-bone/65">
              Glance was written for Meta Ray-Ban Display, where the lens runs on the
              glasses themselves. On camera-only frames it still works: the glasses send
              frames and your phone or this browser shows the lens.
            </p>
            <Link href="/connect" className="cta-lit mt-8 inline-flex rounded-full px-7 py-3.5 text-[15px] font-semibold">
              Connect your glasses
            </Link>
          </div>
          <dl className="divide-y divide-graphite-soft border-y border-graphite-soft">
            <div className="py-5">
              <dt className="text-[16px] font-medium text-bone">Meta Ray-Ban Display</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-bone/60">
                The full in-lens experience, with temple input. Not yet verified on
                physical hardware.
              </dd>
            </div>
            <div className="py-5">
              <dt className="text-[16px] font-medium text-bone">Ray-Ban Meta and Oakley Meta</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-bone/60">
                Camera-only frames. Recognition works; the lens itself appears on your
                phone or laptop.
              </dd>
            </div>
            <div className="py-5">
              <dt className="text-[16px] font-medium text-bone">No glasses at hand</dt>
              <dd className="mt-1.5 text-[15px] leading-relaxed text-bone/60">
                The demo runs on sample frames, or on your webcam if you allow it.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <footer className="bg-obsidian">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-6 border-t border-graphite-soft px-6 py-10 text-[14px] text-bone/55 md:flex-row md:items-center md:justify-between">
          <Link href="/" aria-label="Glance home" className="text-bone"><Wordmark light /></Link>
          <p className="max-w-[26rem]">
            A concept built at DubHacks 2026. Not affiliated with Meta, Ray-Ban, or Visa.
          </p>
          <div className="flex flex-wrap gap-5">
            <Link href="/demo" className="hover:text-bone">Demo</Link>
            <Link href="/glasses" className="hover:text-bone">Wearer preview</Link>
            <Link href="/privacy" className="hover:text-bone">Privacy</Link>
            <Link href="/terms" className="hover:text-bone">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

/** A step in the purchase sequence. Numbered because this genuinely is an order. */
function Step({ n, title, caption, children }: { n: number; title: string; caption: string; children: React.ReactNode }) {
  return (
    <li className="bg-bone p-5">
      {children}
      <div className="mt-5 flex gap-3">
        <span className="readout shrink-0 text-[13px] font-semibold text-warm-subtle">{n}</span>
        <div>
          <h3 className="text-[16px] font-semibold tracking-tight text-warm-ink">{title}</h3>
          <p className="mt-1 text-[14px] leading-snug text-warm-muted">{caption}</p>
        </div>
      </div>
    </li>
  );
}

/** The lens is square at 600×600, so every preview keeps that ratio. */
function LensTile({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative aspect-square overflow-hidden rounded bg-obsidian">
      {children}
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const tone =
    state === "Working"
      ? "border-waveguide-deep/40 bg-waveguide/25 text-[#1d5d50]"
      : state === "Built"
        ? "border-bone-deep bg-bone-deep/60 text-warm-muted"
        : "border-coating/35 bg-coating/15 text-[#7a4f11]";
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-[13px] font-medium ${tone}`}>
      {state}
    </span>
  );
}
