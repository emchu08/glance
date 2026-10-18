import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { DM_Sans, Manrope } from "next/font/google";
import { ArrowUp, ArrowUpRight } from "lucide-react";
import { DotWordmark, HeroExperience } from "@/components/marketing/HeroExperience";

export const metadata: Metadata = { title: { absolute: "Glance — Buy with your eyes." } };
export const viewport: Viewport = { themeColor: "#207bb9", colorScheme: "light" };

// Only the landing page uses these two faces, so they load here rather than in the root layout.
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", display: "swap" });

/** One tile per lens mode, each set in a real place. */
const STORIES = [
  { mode: "Glimpse", meta: "01 / SEE IT.", title: "Discover a jacket", body: "A passing moment. A new favorite.", photo: "/media/street-900.webp", position: "center 40%", alt: "A man in a denim jacket on a city street" },
  { mode: "Gourmet", meta: "02 / MAKE IT YOURS.", title: "Recreate a meal", body: "From a great meal to your grocery list.", photo: "/media/dinner-900.webp", position: "center 45%", alt: "Tomato pasta on a black plate" },
  { mode: "Grocery", meta: "03 / KEEP MOVING.", title: "Shop smarter", body: "Your preferences. Your price. Your path.", photo: "/media/drinks-900.webp", position: "center 30%", alt: "A drinks refrigerator in a corner shop" },
];

const STATUS = [
  { what: "Buying in the lens with a saved card", state: "Working", detail: "End to end in the Stripe sandbox, with the test Visa" },
  { what: "Accounts, wallet, and order history", state: "Working", detail: "Supabase, with row-level security" },
  { what: "Seller commission on each order", state: "Working", detail: "Booked per order at 10% of the item subtotal" },
  { what: "Auto-buy rules with a spending cap", state: "Built", detail: "Set a ceiling and Glance stops asking under it" },
  { what: "Recognition on live camera frames", state: "Built", detail: "Server-side; sample mode never calls a paid model" },
  { what: "Native iOS companion app", state: "Built", detail: "Mirrors the lens to Meta Ray-Ban Display through the Device Access Toolkit" },
];

const PHOTO_CREDITS = [
  { what: "Drinks refrigerator", who: "Nothing Ahead", href: "https://www.pexels.com/photo/variety-of-drinks-3230214/", license: "Pexels" },
  { what: "Street scene", who: "Eddson Lens", href: "https://www.pexels.com/photo/man-in-denim-jacket-looking-at-urban-street-29353588/", license: "Pexels" },
  { what: "Dinner scene", who: "mustafa türkeri", href: "https://www.pexels.com/photo/tomato-pasta-on-a-black-plate-19805084/", license: "Pexels" },
];

export default function Home() {
  return (
    <main className={`site-page ${manrope.variable} ${dmSans.variable}`}>
      <HeroExperience />

      {/* ── The world is your storefront ────────────────────────────────── */}
      <section id="how-it-works" className="px-[6%] pb-[60px] pt-[75px] md:pb-[90px] md:pt-[105px]" style={{ background: "linear-gradient(180deg,#edf4df,#eff8f5 24%,#e8f4fa)" }}>
        <div className="md:grid md:grid-cols-[1.3fr_1fr] md:gap-6">
          <p className="eyebrow col-span-full text-[#203550]"><i className="blue-dot" /> THE WORLD IS YOUR STOREFRONT</p>
          <h2 className="font-manrope my-6 text-[39px] font-medium leading-[1.12] tracking-[-1.8px] text-[#203550] md:my-0 md:mt-6 md:text-[clamp(36px,4.7vw,70px)] md:tracking-[-0.055em]">
            Stay in the moment.<br />
            <span className="text-[#809ab8]">We&rsquo;ll handle the details.</span>
          </h2>
          <p className="max-w-[290px] text-[13px] leading-[1.8] text-[#627c9a] md:max-w-[280px] md:self-end md:justify-self-end md:text-[14px]">
            An AI shopping assistant made for Meta Ray-Ban Display. A little useful information, right when curiosity strikes.
          </p>
        </div>

        <div className="mt-10 grid gap-8 md:mt-[65px] md:grid-cols-3 md:gap-[18px] lg:gap-[25px]">
          {STORIES.map((s) => (
            <Link key={s.title} href="/demo" className="group block text-left">
              <div className="aspect-[406/260] overflow-hidden rounded-[3px] bg-[#d9e6ee] transition-transform duration-300 group-hover:-translate-y-[5px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.photo} alt={s.alt} loading="lazy" className="h-full w-full object-cover" style={{ objectPosition: s.position }} />
              </div>
              <div className="border-b border-[#becfe7] pb-[22px] pt-5 md:pt-[23px]">
                <p className="eyebrow text-[#627c9a]">{s.meta} <span className="text-[#809ab8]">· {s.mode.toUpperCase()}</span></p>
                <h3 className="font-manrope mt-3 flex items-center justify-between text-[25px] font-medium tracking-[-0.8px] text-[#203550] md:text-[21px] lg:text-[24px]">
                  {s.title}
                  <ArrowUpRight className="size-5 text-[var(--site-blue)]" aria-hidden />
                </h3>
                <p className="mt-3 text-[12px] leading-[1.7] text-[#627c9a] md:text-[11px] lg:text-[12px]">{s.body}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Closing ─────────────────────────────────────────────────────── */}
      <section className="border-t border-[#becfe7] px-[6%] pb-[75px] pt-[60px] md:pb-[100px] md:pt-[80px]" style={{ background: "radial-gradient(ellipse at 80% 100%,#fff9e4aa,transparent 65%),linear-gradient(180deg,#e8f4fa,#c6e8f3)" }}>
        <p className="eyebrow text-[#203550]">LESS FRICTION. MORE FINDING.</p>
        <h2 className="font-manrope my-[26px] text-[clamp(40px,10.3vw,70px)] font-medium leading-[1.04] tracking-[-0.067em] text-[#203550] md:my-[32px] md:mb-[38px] md:text-[clamp(45px,7.8vw,114px)]">
          A fresh perspective<br />on the everyday<span className="text-[var(--site-blue)]">.</span>
        </h2>
        <Link href="/demo" className="btn-site btn-site-blue min-w-[215px] md:min-w-[225px]">
          Try the experience <ArrowUpRight className="size-4" aria-hidden />
        </Link>
        <p className="mt-[30px] max-w-[310px] text-[9px] leading-[1.7] text-[#627c9a] md:max-w-none md:text-[10px]">
          Glance concept demo, built at DubHacks 2026. Payments run in the Stripe sandbox; nothing here charges a real card.<br />
          The in-lens view is Glance&rsquo;s own 600 × 600 display, rendered for Meta Ray-Ban Display. Not affiliated with Meta, Ray-Ban, or Visa.
        </p>
      </section>

      <details className="mx-[6%] border-t border-[#becfe7] py-5 text-[10px] leading-[1.8] text-[#627c9a] md:text-[11px]">
        <summary className="w-max cursor-pointer">Credits &amp; concept notes</summary>
        <div className="max-w-[800px] pt-3">
          <p>Photographs:</p>
          <ul className="list-disc pl-[18px] leading-[2]">
            {PHOTO_CREDITS.map((c) => (
              <li key={c.what}>
                {c.what} — <a className="underline underline-offset-[3px]" href={c.href}>{c.who}</a> ·{" "}
                <a className="underline underline-offset-[3px]" href="https://www.pexels.com/license/">{c.license} license</a>
              </li>
            ))}
          </ul>
          <p className="mt-4">What is real in this build:</p>
          <ul className="list-disc pl-[18px] leading-[2]">
            {STATUS.map((s) => (
              <li key={s.what}><span className="text-[#203550]">{s.what}</span> — {s.state.toLowerCase()}. {s.detail}.</li>
            ))}
          </ul>
        </div>
      </details>

      <footer className="mx-[6%] flex flex-wrap items-center justify-between gap-5 border-t border-[#becfe7] py-[25px] md:mx-[5%] md:flex-nowrap md:gap-[25px] md:py-8">
        <DotWordmark className="text-[27px] text-[#203550] md:text-[29px]" />
        <span className="hidden text-[7px] tracking-[1px] text-[#627c9a] md:inline">BUY WITH YOUR EYES.</span>
        <span className="ml-auto text-[6px] tracking-[1px] text-[#627c9a] md:ml-0 md:text-[7px]">DUBHACKS PROJECT / 2026</span>
        <div className="flex w-full items-center gap-5 text-[9px] text-[#203550] md:w-auto md:text-[10px]">
          <Link href="/privacy" className="hover:text-[var(--site-blue)]">Privacy</Link>
          <Link href="/terms" className="hover:text-[var(--site-blue)]">Terms</Link>
          <a href="#experience" className="ml-auto inline-flex items-center gap-1 hover:text-[var(--site-blue)] md:ml-0">Back to top <ArrowUp className="size-3" aria-hidden /></a>
        </div>
      </footer>
    </main>
  );
}
