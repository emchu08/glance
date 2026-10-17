import { useEffect, useMemo, useState, type Dispatch } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { JACKETS, EVERYDAY_SELECT_MARKUP, MEAL, PRODUCT_BY_ID, SCENARIOS, WALKTHROUGH, type ScenarioId } from "../state/data";
import { cartCount, cartTotal, effectiveAlternative, nextRouteTarget, type Action, type State } from "../state/reducer";

export function Pov({ state, dispatch, scenario, onExit, liveApp }: { state: State; dispatch: Dispatch<Action>; scenario: (typeof SCENARIOS)[number]; onExit: () => void; liveApp: string }) {
  const [announce, setAnnounce] = useState("");
  useEffect(() => { if (state.walkthrough.caption) setAnnounce(state.walkthrough.caption); }, [state.walkthrough.caption]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (state.drawer !== "none") dispatch({ type: "drawer", drawer: "none" }); else if (state.selected) dispatch({ type: "grocery/putback" }); else onExit(); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [state.drawer, state.selected, dispatch, onExit]);
  const count = cartCount(state); const total = cartTotal(state);
  const w = state.walkthrough;
  return (
    <div className="pov" id="pov">
      <div className="pov-top">
        <button className="btn is-ghost" onClick={onExit}>Exit experience</button>
        <div className="seg" role="group" aria-label="Scenario">
          {SCENARIOS.map((s) => <button key={s.id} aria-pressed={state.scene === s.id} onClick={() => dispatch({ type: "scene", scene: s.id as ScenarioId })}>{s.tile}</button>)}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="btn is-ghost" aria-pressed={state.drawer === "list"} onClick={() => dispatch({ type: "drawer", drawer: state.drawer === "list" ? "none" : "list" })}>List · {state.list.filter((i) => !i.checked).length}</button>
          <span className="btn is-dark" aria-live="polite">{count} · ${total.toFixed(2)}</span>
          <button className="btn is-ghost" aria-label="Help" aria-pressed={state.drawer === "help"} onClick={() => dispatch({ type: "drawer", drawer: state.drawer === "help" ? "none" : "help" })}>?</button>
        </div>
      </div>
      <div className="pov-title"><p className="label">{scenario.eyebrow}</p><h2>{scenario.title}</h2>{state.savedJackets.length > 0 && <p className="label" style={{ marginTop: 6 }}>{state.savedJackets.length} saved</p>}</div>

      {state.scene === "grocery" && <GroceryPanel state={state} dispatch={dispatch} />}
      {state.scene === "jacket" && <JacketPanel state={state} dispatch={dispatch} />}
      {state.scene === "meal" && <MealPanel state={state} dispatch={dispatch} />}

      {state.drawer === "list" && (
        <aside className="drawer" aria-label="Shopping list">
          <h3>Shopping list</h3>
          {state.list.map((i) => <label key={i.productId} className={`check ${i.checked ? "is-done" : ""}`}><input type="checkbox" checked={i.checked} onChange={() => dispatch({ type: "list/toggle", productId: i.productId })} /><span>{i.label}</span></label>)}
          <div className="actions" style={{ display: "flex", gap: 6, marginTop: 12 }}><button className="btn is-blue" onClick={() => dispatch({ type: "grocery/navigate" })} disabled={!nextRouteTarget(state)}>Find next item</button><button className="btn is-ghost" onClick={() => dispatch({ type: "drawer", drawer: "none" })}>Close</button></div>
        </aside>
      )}
      {state.drawer === "help" && (
        <aside className="drawer" aria-label="Help">
          <h3>How this works</h3>
          <p style={{ fontSize: 14, color: "var(--muted)" }}>Click or select a shelf item, the jacket, or the plate. Use the product dock when 3D is unavailable. Tabs respond to ← →. Everything here is simulated: recognition, prices, and inventory are sample data. <a href={liveApp} target="_blank" rel="noreferrer">Try the live app</a> for real device connection and labeled test purchases.</p>
          <button className="btn is-ghost" onClick={() => dispatch({ type: "drawer", drawer: "none" })}>Close</button>
        </aside>
      )}

      <p className="pov-status" aria-live="polite">{status(state)}</p>
      {state.scene === "grocery" && (
        <div className="dock" role="group" aria-label="Products on the shelf">
          {Object.values(PRODUCT_BY_ID).map((p) => <button key={p.id} aria-pressed={state.selected === p.id} onClick={() => dispatch({ type: "grocery/select", productId: p.id })}>{p.name}</button>)}
          <span className="label" style={{ alignSelf: "center" }}>More finds</span>
        </div>
      )}
      <div className="walk" role="group" aria-label="Walkthrough">
        {!w.complete && (w.playing ? <button className="btn is-ghost" onClick={() => dispatch({ type: "walk/pause", now: Date.now() })}><Pause size={14} /> Pause</button> : w.startedAt ? <button className="btn is-ghost" onClick={() => dispatch({ type: "walk/resume", now: Date.now() })}><Play size={14} /> Resume</button> : <button className="btn is-ghost" onClick={() => dispatch({ type: "walk/start", now: Date.now() })}><Play size={14} /> Walkthrough</button>)}
        <button className="btn is-ghost" onClick={() => dispatch({ type: "walk/start", now: Date.now() })}><RotateCcw size={14} /> Restart</button>
        <button className="btn is-dark" onClick={() => dispatch({ type: "finish" })}>Finish</button>
      </div>
      {w.caption && w.playing && <div className="caption" role="status">{w.caption}</div>}
      <div aria-live="polite" style={{ position: "absolute", left: -9999 }}>{announce}</div>
      {state.finished && <Summary state={state} dispatch={dispatch} />}
    </div>
  );
}

function status(s: State): string {
  if (s.walkthrough.playing) return `Guided walkthrough · step ${s.walkthrough.index} of ${WALKTHROUGH.length}`;
  if (s.scene === "grocery") { if (s.route && s.route.progress < 1) return `Heading to aisle ${PRODUCT_BY_ID[s.route.productId].aisle} for ${PRODUCT_BY_ID[s.route.productId].name} · ${Math.round(s.route.progress * 100)}%`; if (s.recognizing) return "Recognizing…"; if (s.selected) return "Simulated results · sample prices"; return "Select a shelf item, or use the product dock."; }
  if (s.scene === "jacket") return s.jacketRejected ? "No match saved. Try another angle or exit." : s.jacketSelected ? "Possible matches based on the jacket’s visible shape, color, and details. Exact identity is not confirmed." : "Select the jacket to see possible matches.";
  return s.mealStep === "none" ? "Select the plate to get a suggested recipe." : MEAL.limits;
}

function Chrome({ children, foot = "Simulated results · sample prices" }: { children: React.ReactNode; foot?: string }) {
  return <section className="lens" aria-label="Right lens"><div className="lens-chrome"><b>glance</b><span>RIGHT LENS / CONCEPT</span></div>{children}<div className="foot">{foot.toUpperCase()}</div></section>;
}

function GroceryPanel({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const p = state.selected ? PRODUCT_BY_ID[state.selected] : null;
  const alt = effectiveAlternative(state);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (!p) return; if (e.key === "ArrowLeft") dispatch({ type: "grocery/tab", tab: "compare" }); if (e.key === "ArrowRight") dispatch({ type: "grocery/tab", tab: "nutrition" }); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [p, dispatch]);
  const [touchX, setTouchX] = useState<number | null>(null);
  if (!p) return <Chrome><h3>Looking…</h3><p style={{ color: "var(--muted)", fontSize: 14 }}>Pick something up to compare prices and read nutrition.</p></Chrome>;
  if (state.recognizing) return <Chrome><h3>Recognizing…</h3><p className="label">Simulated · 750 ms</p></Chrome>;
  const rows = [["Market St.", p.thisStore], ["Corner Market (0.8mi)", p.nearby], ["Pantry Online (delivery extra)", p.online]] as const;
  const min = Math.min(p.thisStore, p.nearby, p.online);
  return (
    <Chrome>
      <div onTouchStart={(e) => setTouchX(e.touches[0].clientX)} onTouchEnd={(e) => { if (touchX !== null) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 40) dispatch({ type: "grocery/tab", tab: dx < 0 ? "nutrition" : "compare" }); } setTouchX(null); }}>
        <div className="brand">{p.brand}</div>
        <h3>{p.name}</h3>
        <div className="price">${p.thisStore.toFixed(2)}<small>{p.size} · Market St.</small></div>
        <div className="tabs" role="tablist"><button role="tab" aria-selected={state.tab === "compare"} onClick={() => dispatch({ type: "grocery/tab", tab: "compare" })}>Compare prices</button><button role="tab" aria-selected={state.tab === "nutrition"} onClick={() => dispatch({ type: "grocery/tab", tab: "nutrition" })}>Nutrition</button></div>
        {state.tab === "compare" ? <div className="rows" role="tabpanel">{rows.map(([n, v]) => <div key={n}><span>{n}</span><span className={v === min ? "best" : undefined}>${v.toFixed(2)}{v === min ? " · lowest" : ""}</span></div>)}</div>
          : <div className="rows" role="tabpanel"><div><span>Sugar</span><span>{p.sugar} g per serving</span></div><div><span>Calories</span><span>{p.calories}</span></div><div><span>Type</span><span>{p.dairy === "dairy" ? "Dairy" : p.dairy === "plant" ? "Plant-based" : "—"}</span></div></div>}
        <div className="actions" role="group" aria-label="Preference">
          {(["none", "lower-sugar", "dairy-free"] as const).map((pref) => <button key={pref} className="pill" aria-pressed={state.pref === pref} onClick={() => dispatch({ type: "grocery/pref", pref })}>{pref === "none" ? "No preference" : pref === "lower-sugar" ? "Lower sugar" : "Dairy-free"}</button>)}
        </div>
        {alt && <div className="alt"><span><b>{PRODUCT_BY_ID[alt].name}</b> · ${PRODUCT_BY_ID[alt].thisStore.toFixed(2)} · {PRODUCT_BY_ID[alt].sugar} g sugar</span><button className="btn is-ghost" onClick={() => dispatch({ type: "grocery/choose", productId: alt })}>Choose</button></div>}
        <div className="actions"><button className="btn is-blue" onClick={() => dispatch({ type: "grocery/add", now: Date.now() })}>Add to cart</button><button className="btn is-ghost" onClick={() => dispatch({ type: "grocery/putback" })}>Put back</button>{state.cart[p.id] ? <button className="btn is-ghost" onClick={() => dispatch({ type: "grocery/remove", productId: p.id })}>Remove one</button> : null}</div>
      </div>
    </Chrome>
  );
}

function JacketPanel({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const [touchX, setTouchX] = useState<number | null>(null);
  if (!state.jacketSelected) return <Chrome foot="Simulated recognition · clothing, not identity"><h3>{state.jacketRejected ? "No match." : "Looking…"}</h3><p style={{ color: "var(--muted)", fontSize: 14 }}>{state.jacketRejected ? "Nothing was saved. Select the jacket again to retry." : "Select the jacket to see possible matches."}</p></Chrome>;
  const j = JACKETS[state.jacketIndex];
  const saved = state.savedJackets.includes(j.id);
  return (
    <Chrome foot="Simulated results · sample prices">
      <div onTouchStart={(e) => setTouchX(e.touches[0].clientX)} onTouchEnd={(e) => { if (touchX !== null) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 40) dispatch({ type: dx < 0 ? "jacket/next" : "jacket/prev" }); } setTouchX(null); }}>
        <h3 style={{ fontSize: 20 }}>Possible matches.</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>Possible matches based on the jacket’s visible shape, color, and details. Exact identity is not confirmed.</p>
        <div className="mini-jacket" aria-hidden><span className="sleeve l" style={{ background: j.swatch }} /><span className="sleeve r" style={{ background: j.swatch }} /><span className="torso" style={{ background: j.swatch }} /><span className="collar" /><span className="seam" /><span className="pocket l" /><span className="pocket r" /></div>
        <div className="brand">{j.brand}</div>
        <h3 style={{ margin: "2px 0" }}>{j.name}</h3>
        <div className="price">${j.price}<small>{j.store} · {j.color}</small></div>
        <p style={{ fontSize: 13, margin: 0 }}>{j.fit} · <b>{j.why}</b></p>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>Also at Everyday Select for ${j.price + EVERYDAY_SELECT_MARKUP}.</p>
        <div className="actions"><button className="btn is-ghost" aria-label="Previous match" onClick={() => dispatch({ type: "jacket/prev" })}>‹</button><span className="counter">{String(state.jacketIndex + 1).padStart(2, "0")} / {String(JACKETS.length).padStart(2, "0")}</span><button className="btn is-ghost" aria-label="Next match" onClick={() => dispatch({ type: "jacket/next" })}>›</button><button className="btn is-blue" aria-pressed={saved} onClick={() => dispatch({ type: "jacket/save" })}>{saved ? "Saved" : "Save"}</button><button className="btn is-ghost" onClick={() => dispatch({ type: "jacket/none" })}>None of these</button></div>
      </div>
    </Chrome>
  );
}

function MealPanel({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  if (state.mealStep === "none") return <Chrome foot="Simulated recognition · suggested recipe"><h3>Looking…</h3><p style={{ color: "var(--muted)", fontSize: 14 }}>Select the plate.</p></Chrome>;
  const steps = ["dish", "recipe", "list"] as const;
  return (
    <Chrome foot="Simulated recognition · suggested recipe">
      <div className="tabs" role="tablist">{steps.map((s) => <button key={s} role="tab" aria-selected={state.mealStep === s} onClick={() => dispatch({ type: "meal/step", step: s })}>{s === "dish" ? "Dish" : s === "recipe" ? "Recipe" : "List"}</button>)}</div>
      {state.mealStep === "dish" && <><h3 style={{ fontSize: 22 }}>{MEAL.title}</h3><p className="label" style={{ marginTop: 6 }}>{MEAL.minutes} min · {MEAL.servings} servings · {MEAL.diet}</p><p style={{ fontSize: 13, color: "var(--muted)" }}>{MEAL.limits}</p><div className="actions"><button className="btn is-blue" onClick={() => dispatch({ type: "meal/step", step: "recipe" })}>See recipe</button></div></>}
      {state.mealStep === "recipe" && <><h3 style={{ fontSize: 20 }}>Suggested recipe</h3><ol style={{ paddingLeft: 18, fontSize: 14, margin: "6px 0" }}>{MEAL.steps.map((s) => <li key={s}>{s}</li>)}</ol><div className="actions"><button className="btn is-blue" onClick={() => dispatch({ type: "meal/step", step: "list" })}>Ingredients</button></div></>}
      {state.mealStep === "list" && <><h3 style={{ fontSize: 20 }}>Ingredients</h3><ul style={{ paddingLeft: 18, fontSize: 14, margin: "6px 0" }}>{MEAL.ingredients.map((i) => <li key={i.productId}>{i.label}</li>)}</ul><p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>{MEAL.pantry}</p><p style={{ fontSize: 12, margin: "6px 0 0" }}>⚠ {MEAL.warning}</p><div className="actions">{state.mealAdded ? <button className="btn is-blue" onClick={() => dispatch({ type: "grocery/navigate" })}>Take my list to the aisle</button> : <button className="btn is-blue" onClick={() => dispatch({ type: "meal/add" })}>Add ingredients to list</button>}</div></>}
    </Chrome>
  );
}

function Summary({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  const rows = Object.entries(state.cart).map(([id, q]) => ({ p: PRODUCT_BY_ID[id], q }));
  const total = cartTotal(state);
  const cats = useMemo(() => { const m: Record<string, number> = { Drinks: 0, "Dairy & alternatives": 0, Pantry: 0, Produce: 0 }; for (const r of rows) m[r.p.category] += r.p.thisStore * r.q; return m; }, [rows]);
  const max = Math.max(1, ...Object.values(cats));
  return (
    <div className="summary" role="dialog" aria-modal="true" aria-label="Trip summary">
      <div className="summary-card">
        <p className="label">Finish</p>
        <h2>A good little haul.</h2>
        {rows.length ? <div className="rows" style={{ marginTop: 12 }}>{rows.map((r) => <div key={r.p.id}><span>{r.q} × {r.p.name}</span><span>${(r.p.thisStore * r.q).toFixed(2)}</span></div>)}<div><b>Subtotal</b><b>${total.toFixed(2)}</b></div></div> : <p style={{ color: "var(--muted)" }}>Your cart is empty. Nothing was charged; this is a concept.</p>}
        <div className="bars">{Object.entries(cats).map(([k, v]) => <div key={k}><span>{k}</span><i style={{ width: `${(v / max) * 100}%` }} /><span>${v.toFixed(2)}</span></div>)}</div>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>{state.savedJackets.length} jacket{state.savedJackets.length === 1 ? "" : "s"} saved · {state.list.filter((i) => !i.checked).length} list item{state.list.filter((i) => !i.checked).length === 1 ? "" : "s"} unfinished</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="btn is-blue" onClick={() => dispatch({ type: "restart" })}>Restart experience</button><button className="btn" onClick={() => dispatch({ type: "scene", scene: state.scene })}>Continue exploring</button></div>
      </div>
    </div>
  );
}
