import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronLeft, ChevronRight, Menu, X } from "lucide-react";
import { SCENARIOS, WALKTHROUGH, type ScenarioId } from "./state/data";
import { initialState, reducer, walkAction } from "./state/reducer";
import { Glasses } from "./scenes/Glasses";
import { CameraDirector } from "./scenes/CameraDirector";
import { Grocery } from "./scenes/Grocery";
import { Pov } from "./ui/Pov";
import { useReducedMotion } from "./ui/hooks";

gsap.registerPlugin(ScrollTrigger);
const Jacket = lazy(() => import("./scenes/Jacket"));
const Meal = lazy(() => import("./scenes/Meal"));

const LIVE_APP = (import.meta.env.VITE_LIVE_APP_URL as string | undefined) ?? "https://glance-blue.vercel.app";

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(0); // scroll-driven entry 0..1
  const [ready, setReady] = useState({ module: true, renderer: false, scene: false });
  const [webglLost, setWebglLost] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [menu, setMenu] = useState(false);
  const [rot, setRot] = useState({ yaw: 0, pitch: 0 });
  const [visible, setVisible] = useState(true);
  const stageRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // One ScrollTrigger controls entry progress; the Enter button animates the same scroll position.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const st = ScrollTrigger.create({ trigger: el, start: "top top", end: "bottom bottom", onUpdate: (self) => { progressRef.current = self.progress; setProgress(self.progress); } });
    return () => st.kill();
  }, []);
  useEffect(() => { if (progress >= 0.985 && !state.entered) dispatch({ type: "enter" }); }, [progress, state.entered]);

  const enter = useCallback(() => {
    const el = stageRef.current; if (!el) return;
    const target = el.offsetTop + el.offsetHeight - window.innerHeight;
    if (reduced) { window.scrollTo({ top: target }); dispatch({ type: "enter" }); return; }
    tweenRef.current?.kill();
    const obj = { y: window.scrollY };
    tweenRef.current = gsap.to(obj, { y: target, duration: 2.2, ease: "power2.inOut", onUpdate: () => window.scrollTo(0, obj.y) });
    const stop = () => { tweenRef.current?.kill(); window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop); };
    window.addEventListener("wheel", stop, { passive: true }); window.addEventListener("touchstart", stop, { passive: true });
  }, [reduced]);
  const skip = useCallback(() => { const el = stageRef.current; if (!el) return; window.scrollTo({ top: el.offsetTop + el.offsetHeight - window.innerHeight }); dispatch({ type: "enter" }); }, []);
  const exit = useCallback(() => { dispatch({ type: "exit" }); window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }); document.getElementById("enter-btn")?.focus(); }, [reduced]);

  // Readiness timeouts: 7 s initial, 8 s secondary scene prep.
  useEffect(() => { const t = setTimeout(() => { if (!(ready.renderer && ready.scene)) setTimedOut(true); }, 7000); return () => clearTimeout(t); }, [ready.renderer, ready.scene, retryKey]);
  // Visibility-aware rendering.
  useEffect(() => { const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 }); if (stageRef.current) io.observe(stageRef.current); const onVis = () => setVisible(document.visibilityState === "visible"); document.addEventListener("visibilitychange", onVis); return () => { io.disconnect(); document.removeEventListener("visibilitychange", onVis); }; }, []);

  // Walkthrough clock: dispatches the same reducer actions used manually; never replays executed events.
  useEffect(() => {
    const w = state.walkthrough;
    if (!w.playing || w.complete) return;
    const id = setInterval(() => {
      const elapsed = (Date.now() - w.startedAt) / 1000;
      const next = WALKTHROUGH[w.index];
      if (next && elapsed >= next.t) {
        const a = walkAction(next.action, Date.now());
        if (a) dispatch(a);
        dispatch({ type: "walk/advance", index: w.index + 1, caption: next.caption });
      }
    }, 100);
    return () => clearInterval(id);
  }, [state.walkthrough]);
  useEffect(() => { const onVis = () => { if (document.visibilityState !== "visible") dispatch({ type: "walk/pause", now: Date.now() }); }; document.addEventListener("visibilitychange", onVis); return () => document.removeEventListener("visibilitychange", onVis); }, []);

  // Drag rotation (bounded) + accessible rotate buttons.
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { if (state.entered) return; drag.current = { x: e.clientX, y: e.clientY, yaw: rot.yaw, pitch: rot.pitch }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => { const d = drag.current; if (!d) return; setRot({ yaw: clamp(d.yaw + (e.clientX - d.x) * 0.006, -0.9, 0.9), pitch: clamp(d.pitch + (e.clientY - d.y) * 0.004, -0.35, 0.35) }); };
  const onPointerUp = () => { drag.current = null; };

  const allReady = ready.renderer && ready.scene;
  const pct = Math.round(((ready.module ? 1 : 0) + (ready.renderer ? 1 : 0) + (ready.scene ? 1 : 0)) / 3 * 100);
  const scenario = useMemo(() => SCENARIOS.find((s) => s.id === state.scene)!, [state.scene]);

  return (
    <>
      <header className="nav" role="banner">
        <a className="wordmark" href="#top" aria-label="glance home">glance<i /></a>
        <nav className="nav-links" aria-label="Site">
          <a href="#experience">Experience</a><a href="#how">How it works</a>
          <button className="btn is-dark" onClick={enter}>Try Glance</button>
        </nav>
        <button className="btn is-ghost menu-btn" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}><Menu size={16} /></button>
      </header>
      {menu && <MobileMenu onClose={() => setMenu(false)} onEnter={() => { setMenu(false); enter(); }} />}

      <div id="top" />
      <section ref={stageRef} className="stage" id="experience" aria-label="Glance experience">
        <div className="sticky" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <div className="canvas-wrap" aria-hidden={!state.entered}>
            {!webglLost ? (
              <Canvas key={retryKey} camera={{ fov: 34, near: 0.025, far: 70, position: [3.6, 3.5, 12.6] }} dpr={[1, 1.5]} frameloop={visible ? "always" : "never"} shadows
                onCreated={({ gl }) => { setReady((r) => ({ ...r, renderer: true })); gl.domElement.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setWebglLost(true); }); }}>
                <ambientLight intensity={1.1} />
                <directionalLight position={[-4, 8, 5]} intensity={3} color="#fff4e2" castShadow shadow-mapSize={[1024, 1024]} />
                <directionalLight position={[5, 3, -4]} intensity={1.5} />
                <CameraDirector progress={progress} entered={state.entered} scene={state.scene} route={state.route} dispatch={dispatch} reduced={reduced} />
                <Glasses progress={progress} rot={rot} reduced={reduced} onReady={() => setReady((r) => ({ ...r, scene: true }))} />
                {progress > 0.72 && (
                  <Suspense fallback={null}>
                    {state.scene === "grocery" && <Grocery state={state} dispatch={dispatch} reduced={reduced} />}
                    {state.scene === "jacket" && <Jacket state={state} dispatch={dispatch} />}
                    {state.scene === "meal" && <Meal state={state} dispatch={dispatch} />}
                  </Suspense>
                )}
              </Canvas>
            ) : null}
          </div>

          {(webglLost || (timedOut && !allReady)) && (
            <div className="fallback" role="alert">
              <div>
                <p className="label">3D unavailable</p>
                <h2 style={{ fontSize: 40 }}>The scene couldn’t start.</h2>
                <p style={{ color: "var(--muted)" }}>Your shopping state is kept. You can still use the product dock, list, and recipe below.</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                  <button className="btn is-blue" onClick={() => { setWebglLost(false); setTimedOut(false); setReady({ module: true, renderer: false, scene: false }); setRetryKey((k) => k + 1); }}>Retry 3D</button>
                  <button className="btn" onClick={() => window.location.reload()}>Reload page</button>
                  <button className="btn is-ghost" onClick={() => dispatch({ type: "enter" })}>Shop without 3D</button>
                </div>
              </div>
            </div>
          )}

          {!allReady && !timedOut && !webglLost && (
            <div className="loading" aria-live="polite">
              <div>
                <h2>glance<span className="scan" /></h2>
                <p className="label" style={{ marginTop: 16 }}>A fresh perspective is loading</p>
                <div style={{ fontFamily: "var(--head)", fontWeight: 700, marginTop: 6 }}>{pct}%</div>
                <div className="track"><i style={{ width: `${pct}%` }} /></div>
              </div>
            </div>
          )}

          {!state.entered && progress < 0.72 && (
            <div className="hero" style={{ opacity: 1 - progress / 0.72 }}>
              <div>
                <p className="label">A new way to see the everyday</p>
                <h1 style={{ marginTop: 14 }}>Buy with<br />your eyes<i>.</i></h1>
              </div>
              <div className="hero-right">
                <p>Less looking down. More discovering what’s right in front of you.</p>
                <p className="label">An AI assistant, in your field of view.</p>
              </div>
              <div className="hero-actions">
                <button id="enter-btn" className="btn is-blue" onClick={enter}>Enter the experience</button>
                <button className="btn" onClick={() => { skip(); dispatch({ type: "walk/start", now: Date.now() }); }}>Watch it in action <span className="label" style={{ marginLeft: 4 }}>58 sec</span></button>
                <button className="btn is-ghost" onClick={skip}>Skip transition</button>
                <span className="rotate" role="group" aria-label="Rotate the glasses">
                  <button aria-label="Rotate left" onClick={() => setRot((r) => ({ ...r, yaw: clamp(r.yaw - 0.25, -0.9, 0.9) }))}><ChevronLeft size={16} /></button>
                  <button aria-label="Rotate right" onClick={() => setRot((r) => ({ ...r, yaw: clamp(r.yaw + 0.25, -0.9, 0.9) }))}><ChevronRight size={16} /></button>
                </span>
              </div>
              <div className="hero-meta"><p className="label">Glance smart-glasses concept</p><p className="label">DubHacks 2026</p></div>
              <p className="scroll-hint label">Scroll to look through</p>
            </div>
          )}

          {state.entered && <Pov state={state} dispatch={dispatch} scenario={scenario} onExit={exit} liveApp={LIVE_APP} />}
        </div>
      </section>

      <section className="section" id="how">
        <p className="label">The world is your storefront</p>
        <h2>Stay in the moment. We’ll handle the details.</h2>
        <div className="tiles">
          {SCENARIOS.map((s) => (
            <article key={s.id} className={`tile ${s.id}`}>
              <div className="art" aria-hidden />
              <p className="label">{s.eyebrow}</p>
              <h3>{s.tile}</h3>
              <p>{s.blurb}</p>
              <button className="btn is-dark" style={{ justifySelf: "start" }} onClick={() => { skip(); dispatch({ type: "scene", scene: s.id as ScenarioId }); }}>Enter this scenario</button>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <p className="label">Less friction. More finding.</p>
        <h2>A fresh perspective on the everyday.</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn is-blue" onClick={enter}>Try the experience</button>
          <a className="btn" href={LIVE_APP} target="_blank" rel="noreferrer">Try live demo ↗</a>
        </div>
        <p style={{ color: "var(--muted)", maxWidth: 560, marginTop: 16 }}>Glance hardware concept with simulated recognition, prices, and inventory. Try the live app for supported device connection and labeled in-lens test purchases.</p>
      </section>
      <footer>
        <span className="wordmark">glance<i /></span>
        <span>Buy with your eyes. · A DubHacks 2026 project</span>
        <a href="#top">Back to top</a>
      </footer>
    </>
  );
}

function MobileMenu({ onClose, onEnter }: { onClose: () => void; onEnter: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "Tab") { const f = Array.from(document.querySelectorAll<HTMLElement>(".menu a, .menu button")); const i = f.indexOf(document.activeElement as HTMLElement); const n = e.shiftKey ? (i - 1 + f.length) % f.length : (i + 1) % f.length; f[n]?.focus(); e.preventDefault(); } };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);
  return (
    <div className="menu" role="dialog" aria-modal="true" aria-label="Menu">
      <button ref={first} className="btn is-ghost" style={{ position: "absolute", top: 18, right: 20 }} aria-label="Close menu" onClick={onClose}><X size={16} /></button>
      <nav><a href="#experience" onClick={onClose}>Experience</a><a href="#how" onClick={onClose}>How it works</a><button className="btn is-dark" onClick={onEnter}>Try Glance</button></nav>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
