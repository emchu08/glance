"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Menu, Play, X } from "lucide-react";
import { Component, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TIMELINE, span } from "./heroTimeline";

const GlassesScene = dynamic(() => import("./GlassesScene"), { ssr: false, loading: () => null });

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const subscribeToMotion = (onChange: () => void) => {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const getMotionSnapshot = () => window.matchMedia(MOTION_QUERY).matches;
const getMotionServerSnapshot = () => false;

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    // Without WebGL the drawn frame below still carries the transition.
    return this.state.failed ? null : this.props.children;
  }
}

/* ── The drawn frame (viewBox 1600 × 700) ─────────────────────────────────────
   Front-on wayfarer, used once the 3D frame has turned to face the viewer.
   The camera flies through the wearer's right lens, the one the display uses,
   which sits on the viewer's left. */
const VB = { w: 1600, h: 700 };
const LENS_LEFT = "M215 175 C400 150 600 145 715 155 C735 157 742 175 738 200 L700 470 C690 530 650 555 560 560 L380 565 C300 567 262 535 250 480 L200 230 C193 195 200 177 215 175 Z";
const LENS_RIGHT = "M1385 175 C1200 150 1000 145 885 155 C865 157 858 175 862 200 L900 470 C910 530 950 555 1040 560 L1220 565 C1300 567 1338 535 1350 480 L1400 230 C1407 195 1400 177 1385 175 Z";
/** Centre and inner size of the zoom lens, in viewBox units. */
const LENS = { cx: 470, cy: 358, w: 470, h: 360 };
const PHOTO = "/media/drinks-1800.webp";

type Layout = "wide" | "narrow";
const layoutFor = (width: number): Layout => (width < 700 ? "narrow" : "wide");

export function HeroExperience() {
  const reduced = useSyncExternalStore(subscribeToMotion, getMotionSnapshot, getMotionServerSnapshot);
  const section = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const canvasLayer = useRef<HTMLDivElement>(null);
  const frameLayer = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const passage = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<Layout>("wide");
  const [active, setActive] = useState(true);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const vw = window.innerWidth;
      const vh = el.querySelector<HTMLElement>("[data-stage]")?.clientHeight ?? window.innerHeight;
      const rect = el.getBoundingClientRect();
      const p = span(-rect.top, 0, Math.max(1, rect.height - vh));
      progress.current = p;
      const narrow = vw < 700;

      // Hero copy leaves first, then the transition chrome arrives.
      if (copy.current) {
        const out = span(p, 0.02, 0.16);
        copy.current.style.opacity = String(1 - out);
        copy.current.style.transform = `translateY(${-out * 60}px)`;
        copy.current.style.visibility = out >= 1 ? "hidden" : "visible";
      }
      if (passage.current) {
        const show = span(p, 0.16, 0.24) * (1 - span(p, TIMELINE.zoomEnd - 0.02, 1));
        passage.current.style.opacity = String(show);
        passage.current.style.visibility = show <= 0 ? "hidden" : "visible";
      }
      if (bar.current) bar.current.style.transform = `scaleX(${span(p, 0.16, TIMELINE.zoomEnd)})`;

      // 3D frame hands over to the drawn one once it faces the viewer.
      const swap = span(p, TIMELINE.turnEnd - 0.02, TIMELINE.swapEnd);
      if (canvasLayer.current) canvasLayer.current.style.opacity = String(1 - swap);
      if (frameLayer.current) frameLayer.current.style.opacity = String(Math.min(1, swap * 1.6));

      // Fly through the lens: the frame scales about the lens, which drifts to centre,
      // while the photograph stays fixed to the screen so the far side matches exactly.
      const f = frame.current;
      if (f) {
        const W = narrow ? vw * 1.12 : Math.min(vw * 0.62, 1100);
        const H = (W * VB.h) / VB.w;
        const k = VB.w / W;
        const left = (vw - W) / 2;
        const top = (vh - H) / 2 + (narrow ? 0 : 10);
        const o = { x: LENS.cx / k, y: LENS.cy / k };
        const lensPx = { w: LENS.w / k, h: LENS.h / k };
        const maxScale = Math.max(vw / lensPx.w, vh / lensPx.h) * 1.35;
        const z = span(p, TIMELINE.swapEnd - 0.04, TIMELINE.zoomEnd);
        const s = 1 + (maxScale - 1) * Math.pow(z, 2.4);
        const d = { x: (vw / 2 - (left + o.x)) * z, y: (vh / 2 - (top + o.y)) * z };
        f.style.width = `${W}px`;
        f.style.height = `${H}px`;
        f.style.left = `${left}px`;
        f.style.top = `${top}px`;
        f.style.transformOrigin = `${o.x}px ${o.y}px`;
        f.style.transform = `translate(${d.x}px, ${d.y}px) scale(${s})`;
        // The photograph never scales: it is clipped by the lens outline carried to screen space,
        // so it stays sharp and the far side of the lens is exactly the section that follows.
        const img = photo.current;
        if (img) {
          const toScreen = (ux: number, uy: number) => `${(left + d.x + o.x + s * (ux / k - o.x)).toFixed(1)} ${(top + d.y + o.y + s * (uy / k - o.y)).toFixed(1)}`;
          img.style.clipPath = `path("${LENS_LEFT.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => toScreen(+x, +y))}")`;
          img.style.opacity = String(span(p, TIMELINE.turnEnd, TIMELINE.swapEnd + 0.06));
        }
      }
    };
    const request = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const resize = () => { setLayout(layoutFor(window.innerWidth)); request(); };
    resize();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", resize);
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { rootMargin: "100px 0px" });
    io.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", resize);
      io.disconnect();
    };
  }, []);

  const toLook = () => document.getElementById("look")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });

  return (
    <>
      <section ref={section} id="experience" aria-label="Glance" className="relative" style={{ height: "330svh" }}>
        <div data-stage className="sticky top-0 h-svh overflow-hidden" style={{ background: "var(--hero-sky)" }}>
          {/* 3D frame: turns once and comes to the centre as you scroll. */}
          <div ref={canvasLayer} className="pointer-events-none absolute inset-0 z-[3]" aria-hidden>
            <SceneBoundary>
              <GlassesScene progress={progress} reduced={reduced} active={active} layout={layout} />
            </SceneBoundary>
          </div>

          {/* Drawn frame and the world through its lens. */}
          <div ref={frameLayer} className="pointer-events-none absolute inset-0 z-[3] opacity-0" aria-hidden>
            <div ref={photo} className="absolute inset-0 opacity-0" style={{ clipPath: "inset(50%)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PHOTO} alt="" className="h-full w-full object-cover" />
            </div>
            <div ref={frame} className="absolute">
              <svg viewBox={`0 0 ${VB.w} ${VB.h}`} className="h-full w-full overflow-visible">
                <defs>
                  <linearGradient id="glance-glare" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
                    <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={LENS_RIGHT} fill="#a8cfe2" fillOpacity="0.28" />
                <path d={LENS_RIGHT} fill="url(#glance-glare)" />
                <g fill="none" stroke="#05080c" strokeLinecap="round" strokeLinejoin="round">
                  {/* Brow: heavy at the outer corners, thinning toward the bridge, as on a wayfarer. */}
                  <path d="M175 168 C420 128 640 126 790 158" strokeWidth="70" />
                  <path d="M1425 168 C1180 128 960 126 810 158" strokeWidth="70" />
                  <path d={LENS_LEFT} strokeWidth="52" />
                  <path d={LENS_RIGHT} strokeWidth="52" />
                  <path d="M742 212 C778 194 822 194 858 212" strokeWidth="36" />
                  <path d="M168 176 L128 170" strokeWidth="66" />
                  <path d="M1432 176 L1472 170" strokeWidth="66" />
                </g>
                {/* Camera and capture LED on the hinges */}
                <circle cx="190" cy="196" r="13" fill="#1d2731" stroke="#3a4652" strokeWidth="3" />
                <circle cx="1410" cy="196" r="9" fill="#1d2731" />
              </svg>
            </div>
          </div>

          {/* Hero copy */}
          <div ref={copy} className="absolute inset-0 z-[4] will-change-transform">
            <header className="absolute inset-x-[4.5%] top-0 flex h-[76px] items-center gap-9 border-b border-white/25 md:h-24">
              <Link href="/" aria-label="Glance home" className="pointer-events-auto"><DotWordmark className="text-white [&>i]:bg-[#d9f5ff]" /></Link>
              <nav aria-label="Main" className="ml-auto hidden items-center gap-8 text-[13px] text-white md:flex">
                <button type="button" onClick={toLook} className="py-2.5 hover:text-[#d9f5ff]">Experience</button>
                <a href="#how-it-works" className="py-2.5 hover:text-[#d9f5ff]">How it works</a>
              </nav>
              <Link href="/demo" className="pointer-events-auto ml-auto inline-flex min-h-[42px] items-center gap-7 rounded-[4px] bg-[#f4f8fd] px-[18px] py-[13px] text-[13px] font-medium text-[#203550] shadow-[0_5px_20px_rgba(15,60,110,0.12)] transition-transform hover:-translate-y-0.5 md:ml-0">
                Try Glance <ArrowUpRight className="size-4" aria-hidden />
              </Link>
              <button type="button" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="grid size-10 place-items-center text-white md:hidden">
                {menu ? <X className="size-6" /> : <Menu className="size-6" />}
              </button>
            </header>
            {menu && (
              <nav aria-label="Mobile" className="absolute inset-x-[4.5%] top-[84px] z-10 grid gap-1 rounded-[6px] bg-[#f4f8fd] p-3 text-[15px] text-[#203550] shadow-[0_12px_40px_rgba(15,60,110,0.2)] md:hidden">
                <button type="button" onClick={() => { setMenu(false); toLook(); }} className="rounded px-3 py-3 text-left hover:bg-white">Experience</button>
                <a href="#how-it-works" onClick={() => setMenu(false)} className="rounded px-3 py-3 hover:bg-white">How it works</a>
                <Link href="/glasses" className="rounded px-3 py-3 hover:bg-white">Glasses view</Link>
              </nav>
            )}

            <p className="eyebrow absolute left-[6%] top-[17%] text-white md:left-[5%] md:top-[16%]"><i className="blue-dot" style={{ background: "#d9f5ff" }} /> A NEW WAY TO SEE THE EVERYDAY</p>
            <h1 className="font-manrope absolute left-[5.4%] top-[22%] text-[clamp(65px,15.1vw,104px)] font-[550] leading-[0.96] tracking-[-0.073em] text-white [text-shadow:0_2px_24px_rgba(36,127,172,0.07)] md:left-[4.6%] md:top-[21%] md:text-[clamp(80px,9.2vw,148px)] md:leading-[0.95]">
              Buy with<br />your eyes<span className="text-[#d9f5ff]">.</span>
            </h1>
            <div className="absolute left-[6%] top-[39%] max-w-[285px] md:left-auto md:right-[5.3%] md:top-[24%] md:max-w-[225px]">
              <p className="text-[14px] leading-[1.6] tracking-[-0.4px] text-[#143e5b] md:text-[17px]">
                Less looking down.<br className="hidden md:block" /> More discovering what&rsquo;s right in front of you.
              </p>
              <span className="mt-6 hidden text-[8px] tracking-[1.1px] text-[#24536d] md:block">AN AI ASSISTANT, IN YOUR FIELD OF VIEW.</span>
            </div>

            <div className="pointer-events-auto absolute bottom-[15%] left-[6%] flex flex-col items-start gap-4 md:left-[5%]">
              <Link href="/demo" className="btn-site btn-site-blue min-w-[222px]">
                Enter the experience <ArrowUpRight className="size-4" aria-hidden />
              </Link>
              <button type="button" onClick={toLook} className="flex items-center gap-2 py-1 text-[12px] text-[#203550] hover:text-[var(--site-blue)]">
                <Play className="size-3.5" aria-hidden /> Look through the lens <span className="ml-2 text-[8px] tracking-[0.7px] text-[#4a6586]">SCROLL</span>
              </button>
            </div>

            <div className="absolute inset-x-[4.5%] bottom-0 flex h-[70px] items-center justify-between border-t border-[#46778d30] text-[8px] tracking-[1.25px] text-[#31566b]">
              <button type="button" onClick={toLook} className="pointer-events-auto flex items-center gap-2.5 py-3 tracking-[1px]">
                <ArrowDown className="size-3.5 text-[var(--site-blue)]" aria-hidden /> SCROLL TO LOOK THROUGH
              </button>
              <span className="hidden md:inline">GLANCE / CONCEPT DISPLAY · RAY-BAN META DISPLAY</span>
              <span className="hidden sm:inline">DUBHACKS · 2026</span>
            </div>
          </div>

          {/* Transition chrome */}
          <div ref={passage} className="pointer-events-none invisible absolute inset-0 z-[12] opacity-0">
            <DotWordmark className="absolute left-[4.5%] top-[30px] text-[#203550]" />
            <button type="button" onClick={toLook} className="pointer-events-auto absolute right-[4.5%] top-7 inline-flex min-h-[47px] items-center gap-7 rounded-[4px] border border-white/70 bg-[#f4f8fd]/90 px-5 text-[13px] text-[#203550] backdrop-blur-md">
              Skip transition <ArrowRight className="size-4" aria-hidden />
            </button>
            <p className="absolute bottom-[58px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[#f4f8fd]/80 px-[17px] py-3 text-[9px] tracking-[2px] text-[#203550] backdrop-blur-sm">THROUGH YOUR RIGHT LENS</p>
            <div className="absolute inset-x-[5%] bottom-[30px] h-0.5 bg-[#aeb8aa44]">
              <i ref={bar} className="block h-full origin-left bg-[var(--site-blue)]" style={{ transform: "scaleX(0)" }} />
            </div>
          </div>
        </div>
      </section>

      <LookThrough />
    </>
  );
}

export function DotWordmark({ className }: { className?: string }) {
  return (
    <span className={`font-manrope inline-flex items-baseline text-[30px] font-extrabold leading-none tracking-[-2px] md:text-[34px] ${className ?? ""}`}>
      glance<i className="ml-[3px] inline-block size-[7px] rounded-full bg-[var(--site-blue)]" aria-hidden />
    </span>
  );
}

/** The far side of the lens: the same photograph, now the world, with the lens's view laid over it. */
function LookThrough() {
  return (
    <section id="look" aria-label="Through the lens" className="relative h-svh min-h-[560px] overflow-hidden bg-[#0d1a22]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PHOTO} alt="A drinks refrigerator in a corner shop" className="absolute inset-0 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,14,23,0.45)_0%,rgba(8,14,23,0)_30%,rgba(8,14,23,0)_60%,rgba(8,14,23,0.55)_100%)]" />

      <div className="absolute left-[4%] top-[88px] max-w-[min(400px,92%)] text-white [text-shadow:0_1px_16px_rgba(8,14,23,0.6)] md:top-[108px]">
        <p className="eyebrow text-[#e0edfc]">03 / MARKET STREET</p>
        <h2 className="font-manrope mt-3 text-[30px] font-medium leading-[1.15] tracking-[-1.2px]">Find your everyday good.</h2>
        <span className="mt-3 block text-[8px] tracking-[1px] text-[#e0edfc]/85">GROCERY MODE · SAMPLE SCENE</span>
      </div>

      {/* Focus brackets on a shelf, as Grocery frames an item */}
      <Link href="/demo" aria-label="Select a drink in the live demo" className="group absolute left-[30%] top-[38%] hidden h-[220px] w-[150px] md:block">
        {["left-0 top-0 border-l-[1.5px] border-t-[1.5px]", "right-0 top-0 border-r-[1.5px] border-t-[1.5px]", "bottom-0 right-0 border-b-[1.5px] border-r-[1.5px]", "bottom-0 left-0 border-b-[1.5px] border-l-[1.5px]"].map((c) => (
          <i key={c} className={`absolute size-5 border-[#efffea] drop-shadow-[0_1px_3px_rgba(27,52,25,0.3)] transition-colors group-hover:border-[#a9cdf5] ${c}`} />
        ))}
        <span className="absolute left-1/2 top-[calc(100%+12px)] -translate-x-1/2 whitespace-nowrap rounded-[4px] bg-[#0b1520]/85 px-3.5 py-2.5 text-[12px] text-white backdrop-blur-md">Select a drink in the refrigerator</span>
      </Link>

      {/* What the right lens shows: the in-lens display, simulated */}
      <aside className="absolute inset-x-4 bottom-[86px] rounded-[18px] border border-white/10 bg-[#080e17]/90 p-5 text-white backdrop-blur-md md:inset-x-auto md:bottom-auto md:right-[3%] md:top-[96px] md:w-[340px]">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <span className="font-manrope flex items-center gap-1.5 text-[15px] font-extrabold tracking-[-0.7px]">glance<i className="size-1 rounded-full bg-[#a9cdf5]" /></span>
          <span className="text-[8px] tracking-[0.9px] text-[#a7b3c2]">GROCERY · SCANNING</span>
        </div>
        <p className="mt-4 text-[9px] tracking-[1px] text-[#a9cdf5]">IN YOUR CART · 3 ITEMS</p>
        <h3 className="font-manrope mt-2 text-[23px] font-semibold leading-[1.15] tracking-[-0.9px]">Hold up a drink to compare it.</h3>
        <p className="mt-2 text-[12px] leading-[1.6] text-white/60">Price, sugar, and a cheaper same-size option, before it goes in the basket.</p>
        <Link href="/demo" className="mt-4 flex items-center gap-3 rounded-[14px] border border-white/10 bg-white/[0.04] p-3 hover:bg-white/[0.08]">
          <ArrowUpRight className="size-4 text-[#a9cdf5]" aria-hidden />
          <span className="flex flex-col text-[10px] text-white/60">Next on your list<strong className="text-[13px] font-medium text-white">Whole milk, 1 gal</strong></span>
          <ArrowRight className="ml-auto size-4 text-white/70" aria-hidden />
        </Link>
        <p className="mt-4 border-t border-white/10 pt-3 text-center text-[8px] tracking-[0.85px] text-[#a7b3c2]">SIMULATED RESULTS · SAMPLE PRICES &amp; NUTRITION</p>
      </aside>

      <div className="absolute inset-x-[3%] bottom-5 flex items-center justify-between gap-3">
        <div className="flex min-h-[42px] items-center gap-3 rounded-[5px] border border-white/60 bg-[#f6f9fb]/95 px-3 text-[11px] text-[#203550]">
          <span className="hidden border-r border-[#c6d2be] pr-3 text-[7px] tracking-[1px] text-[#7c8ea3] sm:inline">DEMO CONTROLS</span>
          <Link href="/glasses" className="flex items-center gap-1.5 py-1 hover:text-[var(--site-blue)]"><i className="size-1 rounded-full bg-[var(--site-blue)]" /> Explore</Link>
          <Link href="/demo" className="flex items-center gap-1.5 whitespace-nowrap py-1 hover:text-[var(--site-blue)]"><Play className="size-3" aria-hidden /> Walkthrough</Link>
        </div>
        <span className="hidden rounded-[3px] bg-[#0b1520]/70 px-2 py-1.5 text-[7px] tracking-[1px] text-white/80 lg:inline">CONCEPT ONLY · SANDBOX PAYMENTS</span>
        <Link href="/demo" className="flex min-h-[42px] items-center gap-3 whitespace-nowrap rounded-[4px] border border-white/60 bg-[#f6f9fb]/95 px-4 text-[12px] text-[#203550] hover:bg-white">
          <span className="sm:hidden">Live demo</span><span className="hidden sm:inline">Open the live demo</span> <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
