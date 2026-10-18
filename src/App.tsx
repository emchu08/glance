import { Component, lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Check, CircleHelp, ListChecks, Menu, Navigation, Pause, Play, RotateCcw, ScanLine, ShoppingBag, X } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { products, money } from './data';
import { reducer, walkthrough, type Action, type Scenario, type State } from './experience/state';
import { useExperience } from './experience/useExperience';
import Display from './experience/Display';
import PhotoWorld from './experience/PhotoWorld';
import { getLoadedPhoto, loadPhoto, photos, photoForState, warmPhoto, type LoadedPhoto } from './experience/photos';

gsap.registerPlugin(ScrollTrigger);
const World = lazy(() => import('./Scene'));
class WorldBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
const scenarios: { id: Scenario; title: string; name: string; place: string; prompt: string }[] = [
  { id: 'jacket', title: 'Discover a jacket', name: 'Good taste. At first sight.', place: '01 / THE EVERYDAY, RECONSIDERED', prompt: 'Select the jacket' },
  { id: 'meal', title: 'Recreate a meal', name: 'A little dinner inspiration.', place: '02 / AROUND THE TABLE', prompt: 'Select the dish' },
  { id: 'grocery', title: 'Shop smarter', name: 'Find your everyday good.', place: '03 / MARKET STREET', prompt: 'Select a drink in the refrigerator' },
];

export default function App() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const { state: s, dispatch, manual, elapsed, startWalkthrough, reset } = useExperience(reduced);
  const [progress, setProgress] = useState(0);
  const [worldError, setWorldError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [photoRetry, setPhotoRetry] = useState(0);
  const operation = useRef(0);
  const photoRecovery = useRef<(() => void) | null>(null);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const stage = useRef<HTMLElement>(null);
  const displayArea = useRef<HTMLDivElement>(null);
  const previouslyEntered = useRef(false);
  const entryButton = useRef<HTMLButtonElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const scrollTween = useRef<gsap.core.Tween | null>(null);
  const drag = useRef<{ x: number; y: number; rx: number; ry: number } | null>(null);
  const destination = photoForState(s);
  const activePhoto = photo?.id === destination ? photo : getLoadedPhoto(destination) ?? null;
  const photoReady = activePhoto?.id === destination;
  const entered = s.entry >= .999 && photoReady;
  const entering = s.entry > .005 && !entered;
  const scenario = scenarios.find(item => item.id === s.scenario)!;
  const count = Object.values(s.cart).reduce((a, b) => a + b, 0);
  const total = products.reduce((sum, p) => sum + (s.cart[p.id] ?? 0) * p.price, 0);
  const onProgress = useCallback((value: number) => setProgress(previous => Math.max(previous, value)), []);
  const onError = useCallback(() => { setWorldError(true); setProgress(100); }, []);
  const act = useCallback(async (action: Action) => {
    dispatch({ type: 'WALK_PAUSE' });
    const id = ++operation.current;
    const next = reducer(s, action);
    const nextPhoto = photoForState(next);
    if (nextPhoto !== photo?.id) {
      setLoadingPhoto(true); setPhotoError(false);
      try { const loaded = await loadPhoto(nextPhoto); if (id !== operation.current) return; setPhoto(loaded); }
      catch { if (id === operation.current) { photoRecovery.current = () => { void act(action); }; setPhotoError(true); setLoadingPhoto(false); } return; }
    }
    if (id === operation.current) { setLoadingPhoto(false); manual(action); }
  }, [s, photo?.id, manual, dispatch]);
  const select = useCallback((id: string) => { void act({ type: 'SELECT', id }); }, [act]);
  useEffect(() => {
    let cancelled = false; setPhotoError(false);
    void loadPhoto(destination).then(loaded => { if (!cancelled) setPhoto(loaded); }).catch(() => { if (!cancelled) setPhotoError(true); });
    return () => { cancelled = true; };
  }, [destination, photoRetry]);

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(query.matches);
    query.addEventListener('change', update); return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (progress >= 100) return;
    const timeout = setTimeout(onError, 20000); return () => clearTimeout(timeout);
  }, [onError, progress]);
  useEffect(() => {
    const trigger = ScrollTrigger.create({ trigger: stage.current, start: 'top top', end: 'bottom bottom', onUpdate: self => dispatch({ type: 'ENTRY', value: self.progress }), onRefresh: self => dispatch({ type: 'ENTRY', value: self.progress }) });
    const interrupt = () => scrollTween.current?.kill();
    const interruptKey = (e: KeyboardEvent) => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(e.key)) interrupt(); };
    window.addEventListener('keydown', interruptKey);
    window.addEventListener('wheel', interrupt, { passive: true }); window.addEventListener('touchstart', interrupt, { passive: true });
    return () => { trigger.kill(); scrollTween.current?.kill(); window.removeEventListener('keydown', interruptKey); window.removeEventListener('wheel', interrupt); window.removeEventListener('touchstart', interrupt); };
  }, [dispatch]);
  useLayoutEffect(() => {
    if (entered) displayArea.current?.focus({ preventScroll: true });
    else if (previouslyEntered.current) entryButton.current?.focus({ preventScroll: true });
    previouslyEntered.current = entered;
  }, [entered]);

  const endPosition = () => stage.current ? stage.current.offsetTop + stage.current.offsetHeight - window.innerHeight : 0;
  useEffect(() => {
    if (!entered) return;
    let frame = 0;
    const resize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        window.scrollTo({ top: endPosition(), behavior: 'instant' });
        ScrollTrigger.update();
      });
    };
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [entered]);
  const enter = async (guided = false, skip = false, requestedScenario: Scenario = s.scenario) => {
    setMenu(false); scrollTween.current?.kill();
    const id = ++operation.current;
    setLoadingPhoto(true); setPhotoError(false);
    const targetScenario = guided ? 'jacket' : requestedScenario;
    try {
      const loaded = await loadPhoto(targetScenario);
      if (guided) await Promise.all(['jacket', 'meal', 'grocery', 'aisle'].map(key => loadPhoto(key as keyof typeof photos)));
      if (id !== operation.current) return;
      setPhoto(loaded); setLoadingPhoto(false);
      if (targetScenario !== s.scenario) dispatch({ type: 'SCENARIO', scenario: targetScenario });
    } catch { if (id === operation.current) { photoRecovery.current = () => { void enter(guided, skip, requestedScenario); }; setPhotoError(true); setLoadingPhoto(false); } return; }
    const end = endPosition();
    const finish = () => { dispatch({ type: 'ENTRY', value: 1 }); if (guided) startWalkthrough(); ScrollTrigger.update(); };
    if (skip || reduced || entered) { window.scrollTo({ top: end, behavior: 'instant' }); finish(); return; }
    if (window.scrollY > end) window.scrollTo({ top: stage.current?.offsetTop ?? 0, behavior: 'instant' });
    const position = { y: window.scrollY };
    scrollTween.current = gsap.to(position, { y: end, duration: 2.6 * (1 - s.entry), ease: 'power2.inOut', onUpdate: () => { window.scrollTo({ top: position.y, behavior: 'instant' }); ScrollTrigger.update(); }, onComplete: finish });
  };
  const exit = () => { operation.current++; setLoadingPhoto(false); setPhotoError(false); photoRecovery.current = null; scrollTween.current?.kill(); dispatch({ type: 'EXIT' }); setHelp(false); window.scrollTo({ top: stage.current?.offsetTop ?? 0, behavior: 'instant' }); ScrollTrigger.update(); requestAnimationFrame(() => entryButton.current?.focus({ preventScroll: true })); };
  const restart = () => { operation.current++; setLoadingPhoto(false); setPhotoError(false); photoRecovery.current = null; scrollTween.current?.kill(); reset(); setHelp(false); setRotation({ x: 0, y: 0 }); window.scrollTo({ top: stage.current?.offsetTop ?? 0, behavior: 'instant' }); ScrollTrigger.update(); requestAnimationFrame(() => entryButton.current?.focus({ preventScroll: true })); };
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (menu) { setMenu(false); menuButton.current?.focus(); }
      else if (help) setHelp(false);
      else if (s.drawer) manual({ type: 'DRAWER', drawer: null });
      else if (entered || entering) exit();
    };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  });
  useEffect(() => {
    if (!menu) return;
    const panel = menuPanel.current; const elements = panel?.querySelectorAll<HTMLElement>('button, a'); elements?.[0]?.focus();
    const trap = (e: KeyboardEvent) => { if (e.key !== 'Tab' || !elements?.length) return; const first = elements[0], last = elements[elements.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } };
    panel?.addEventListener('keydown', trap); return () => panel?.removeEventListener('keydown', trap);
  }, [menu]);

  const visualState: State = { ...s, entry: reduced && !entered ? 0 : !photoReady ? Math.min(s.entry, .16) : s.entry };
  const playWalkthrough = async () => { const id = ++operation.current; setLoadingPhoto(true); try { await Promise.all(['jacket', 'meal', 'grocery', 'aisle'].map(key => loadPhoto(key as keyof typeof photos))); if (id !== operation.current) return; setLoadingPhoto(false); startWalkthrough(); } catch { if (id === operation.current) { setLoadingPhoto(false); setPhotoError(true); } } };
  const caption = s.phase === 'navigating' ? 'Follow the arrows to your next find.' : s.walk === 'playing' ? walkthrough[s.walkStep].caption : s.recognition === 'scanning' ? 'A little closer. Bringing it into focus.' : s.selected ? s.scenario === 'grocery' ? 'Swipe the display, or use the tabs.' : s.scenario === 'jacket' ? 'Similar styles. Your choice.' : 'Turn a little inspiration into dinner.' : scenario.prompt;
  return <div className={reduced ? 'app reduced-motion' : 'app'}>
    <a className="skip-link" href="#how-it-works">Skip to how it works</a>
    <div className={`loader ${progress >= 100 ? 'loaded' : ''}`} aria-hidden={progress >= 100} role="status"><div className="loader-wordmark">glance<span /> <i /></div><div className="loading-caption"><span>A FRESH PERSPECTIVE IS LOADING</span><strong>{String(progress).padStart(3, '0')}%</strong></div><div className="loading-track"><i style={{ width: `${progress}%` }} /></div></div>
    <main>
      <section className="experience-scroll" ref={stage} id="experience" aria-label="Glance interactive experience">
        <div className={`experience-viewport ${entered ? 'is-inside' : ''} ${entering ? 'is-entering' : ''}`}>
          {!worldError && <WorldBoundary key={retry} onError={onError}><Suspense fallback={null}><World photo={activePhoto} entry={visualState.entry} rotation={rotation} reduced={reduced} onProgress={onProgress} onError={onError} /></Suspense></WorldBoundary>}
          {worldError && !entered && <div className="world-fallback"><div className="fallback-art" aria-hidden="true"><div className="flat-glasses"><i/><i/><span/></div></div><div className="fallback-note"><span>3D glasses unavailable. The photo experiences still work.</span><button onClick={() => { setWorldError(false); setProgress(0); setRetry(n => n + 1); }}>Retry 3D <RotateCcw size={12}/></button></div></div>}
          <PhotoWorld photo={activePhoto} state={visualState} reduced={reduced} onSelect={select} />
          {(loadingPhoto || (!photoReady && s.entry > .005)) && !photoError && <div className="photo-loading" role="status"><ScanLine size={18}/> Preparing your perspective…</div>}
          {photoError && <div className="photo-loading photo-error" role="alert"><p>This photo couldn’t load. Your cart and list are safe.</p><button className="btn blue" onClick={() => { setPhotoError(false); const recover = photoRecovery.current; photoRecovery.current = null; if (recover) recover(); else setPhotoRetry(n => n + 1); }}>Retry photo</button></div>}
          {!entered && <>
            <header className="site-nav" style={{ opacity: Math.max(0, 1 - s.entry * 4), visibility: s.entry > .3 ? 'hidden' : 'visible' }}><a href="#" className="wordmark" aria-label="Glance home">glance<span /></a><nav aria-label="Main navigation"><button onClick={() => enter()}>Experience</button><a href="#how-it-works">How it works</a></nav><button className="btn dark nav-enter" onClick={() => enter()}>Try Glance <ArrowUpRight size={15}/></button><button className="icon-button mobile-toggle" ref={menuButton} aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></header>
            <div className="hero-content" style={{ opacity: Math.max(0, 1 - s.entry * 3), transform: reduced ? undefined : `translateY(${-s.entry * 70}px)`, visibility: s.entry > .4 ? 'hidden' : 'visible' }}>
              <span className="eyebrow"><i className="blue-dot"/> A NEW WAY TO SEE THE EVERYDAY</span><h1>Buy with<br/>your eyes<span>.</span></h1><div className="hero-aside"><p>Less looking down.<br/> More discovering what’s<br/> right in front of you.</p><span>AN AI ASSISTANT, IN YOUR FIELD OF VIEW.</span></div>
              <div className="hero-actions"><button ref={entryButton} className="btn blue" onClick={() => enter()}>Enter the experience <ArrowUpRight size={18}/></button><button className="walk-link" onClick={() => enter(true)}><Play size={13}/> Watch it in action <span>58 SEC</span></button></div>
            </div>
            {s.entry < .05 && <div className="glasses-interaction" role="group" tabIndex={0} aria-label="Rotate the Ray-Ban Meta smart glasses" aria-describedby="glasses-keyboard-help" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setRotation(r => ({ ...r, y: Math.max(-1.2, Math.min(1.2, r.y + (e.key === 'ArrowLeft' ? -.25 : .25))) })); } }} onPointerDown={e => { if ((e.target as HTMLElement).closest('button')) return; drag.current = { x: e.clientX, y: e.clientY, rx: rotation.x, ry: rotation.y }; e.currentTarget.setPointerCapture(e.pointerId); }} onPointerMove={e => { if (!drag.current) return; setRotation({ x: Math.max(-.5, Math.min(.5, drag.current.rx + (e.clientY - drag.current.y) * .005)), y: Math.max(-1.2, Math.min(1.2, drag.current.ry + (e.clientX - drag.current.x) * .008)) }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
              <span id="glasses-keyboard-help" className="sr-only">Use the left and right arrow keys to rotate the glasses.</span>
            </div>}
            <div className="hero-footer" style={{ opacity: Math.max(0, 1 - s.entry * 4), visibility: s.entry > .3 ? 'hidden' : 'visible' }}><button onClick={() => enter()}><ArrowDown size={15}/> SCROLL TO LOOK THROUGH</button><span>GLANCE / CONCEPT DISPLAY · RAY-BAN META</span><span>DUBHACKS · 2026</span></div>
          </>}
          {entering && <div className="transition-ui"><span className="transition-label">{s.entry < .4 ? 'A CHANGE IN PERSPECTIVE' : s.entry < .8 ? 'THROUGH YOUR RIGHT LENS' : 'WELCOME TO YOUR EVERYDAY'}</span><button className="btn glass" onClick={() => enter(false, true)}>Skip transition <ArrowRight size={15}/></button><div className="entry-progress"><i style={{width:`${s.entry*100}%`}}/></div></div>}
          <div className="lens-transition-wash" aria-hidden="true" style={{ opacity: reduced ? (entering ? s.entry : 0) : s.entry > .88 && s.entry < 1 ? Math.sin((s.entry - .88) / .12 * Math.PI) * .22 : 0 }} />
          {entered && <div className={`pov-ui ${s.selected ? 'is-inspecting' : ''}`} ref={displayArea} tabIndex={-1} aria-label="Interactive POV shopping demo">
            <div className="pov-header"><button className="exit-button" onClick={exit}><X size={16}/><span>Exit experience</span></button><div className="scenario-selector" role="group" aria-label="Choose a scenario">{scenarios.map(item=><button key={item.id} className={s.scenario===item.id?'selected':''} aria-pressed={s.scenario===item.id} onPointerEnter={()=>warmPhoto(item.id)} onFocus={()=>warmPhoto(item.id)} onClick={()=>void act({type:'SCENARIO',scenario:item.id})}>{item.title}</button>)}</div><button className={`cart-button ${s.adding?'cart-bump':''}`} aria-label={`Open cart, ${count} items, ${money(total)}`} onClick={()=>manual({type:'DRAWER',drawer:'cart'})}><ShoppingBag size={16}/><span className="cart-count">{count}</span><span className="cart-total">{money(total)}</span></button></div>
            <div className="world-caption"><span className="eyebrow">{scenario.place}</span><h2>{scenario.name}</h2><span className="scene-type">PHOTO EXPERIENCE · SIMULATED SUGGESTIONS</span></div>
            <div className="world-tools"><button className="small-tool" onClick={()=>manual({type:'DRAWER',drawer:'list'})}><ListChecks size={15}/><span>Shopping list</span><b>{s.list.filter(i=>!i.checked).length}</b></button>{s.saved.length>0&&<span className="saved-count"><Bookmark size={13}/>{s.saved.length} saved</span>}<button className="icon-button" aria-label="Show demo help" aria-expanded={help} onClick={()=>{dispatch({type:'WALK_PAUSE'});setHelp(!help);}}><CircleHelp size={16}/></button></div>
            <Display state={s} act={act} reset={restart}/>
            {help&&<div className="help-panel"><button className="icon-button" aria-label="Close help" onClick={()=>setHelp(false)}><X size={15}/></button><span className="micro-label">A LITTLE GUIDANCE</span><h3>Look. Select. Discover.</h3><p>Click a scene object or use its labeled control. The right-lens display brings your options into view.</p><p>Use the scenario buttons to change worlds. Your shopping list, cart, and saved finds come with you.</p><p>Any manual action pauses the walkthrough. Escape closes a panel or exits.</p></div>}
            <div className="context-caption" role="status">{caption}</div>
            {s.scenario==='grocery'&&s.phase!=='summary'&&<div className="product-dock"><span className="micro-label">TWO DRINKS TO DISCOVER</span><div>{products.filter(p=>['lemon','zero'].includes(p.id)).map(p=><button key={p.id} aria-pressed={s.selected===p.id} onClick={()=>select(p.id)}><i style={{background:p.color}}/>{p.id==='lemon'?'01 · Original':'02 · Lower sugar'}</button>)}<select id="catalog" aria-label="Choose any grocery product" value={s.selected&&products.some(p=>p.id===s.selected)?s.selected:''} onChange={e=>select(e.target.value)}><option value="" disabled>More finds</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><button className="find-next" onPointerEnter={()=>warmPhoto('aisle')} onFocus={()=>warmPhoto('aisle')} onClick={()=>void act({type:'NAVIGATE'})}><Navigation size={14}/><span>Find next item</span></button></div></div>}
            <div className="demo-bottom"><div className="walk-controls"><span className="website-label">DEMO CONTROLS</span>{s.walk==='off'?<><span className="explore-mode"><i/> Explore</span><button onClick={playWalkthrough}><Play size={12}/>Play walkthrough</button></>:<><button onClick={()=>dispatch({type:s.walk==='playing'?'WALK_PAUSE':'WALK_RESUME'})} disabled={s.walk==='done'}>{s.walk==='playing'?<Pause size={12}/>:<Play size={12}/>} {s.walk==='playing'?'Pause':s.walk==='done'?'Complete':'Resume'}</button><span className="walk-time">{String(Math.min(58,Math.floor(elapsed))).padStart(2,'0')} / 58s</span><button onClick={playWalkthrough} aria-label="Restart walkthrough"><RotateCcw size={13}/></button>{s.walk==='paused'&&<span className="paused-label">PAUSED</span>}</>}</div><span className="concept-note">CONCEPT ONLY · NO LIVE PURCHASES</span><div className="bottom-actions"><button onClick={()=>manual({type:'FINISH'})}>Finish <ArrowRight size={13}/></button><button aria-label="Restart complete experience" onClick={restart}><RotateCcw size={14}/></button></div></div>
            <span className="sr-only" aria-live="polite">{s.notice}</span>{s.notice&&<div className={`notice ${s.adding?'notice-added':''}`} key={s.notice}>{s.adding?<Check size={13}/>:null}{s.notice}</div>}
          </div>}
        </div>
      </section>
      <section className="perspective-story" id="how-it-works"><div className="story-intro"><span className="eyebrow"><i className="blue-dot"/> THE WORLD IS YOUR STOREFRONT</span><h2>Stay in the moment.<br/><span>We’ll handle the details.</span></h2><p>An AI shopping assistant imagined for smart glasses. A little useful information, right when curiosity strikes.</p></div><div className="story-grid">{scenarios.map((item,i)=><button key={item.id} className={`story-tile tile-${item.id}`} onPointerEnter={()=>warmPhoto(item.id)} onFocus={()=>warmPhoto(item.id)} onClick={()=>void enter(false,false,item.id)}><div className="tile-art" aria-hidden="true"><img src={`/media/${photos[item.id].file}-900.webp`} loading="lazy" alt="" style={{objectPosition: item.id==='grocery'?'center 30%':item.id==='jacket'?'center 62%':'center'}}/></div><div><span className="micro-label">0{i+1} / {['SEE IT.','MAKE IT YOURS.','KEEP MOVING.'][i]}</span><h3>{item.title}<ArrowUpRight size={22}/></h3><p>{['A passing moment. A new favorite.','From a great meal to your grocery list.','Your preferences. Your price. Your path.'][i]}</p></div></button>)}</div></section>
      <section className="closing"><span className="eyebrow">LESS FRICTION. MORE FINDING.</span><h2>A fresh perspective<br/>on the everyday<span>.</span></h2><button className="btn blue" onClick={()=>enter()}>Try the experience <ArrowUpRight size={18}/></button><p>Glance concept demo. Simulated recognition, prices, nutrition, and inventory.<br/>The in-lens display is imagined by Glance; it does not represent Wayfarer Gen 2 display capabilities.</p></section>
    </main>
    <details className="asset-credits"><summary>Credits & concept notes</summary><p>3D model: <a href="https://sketchfab.com/3d-models/ray-ban-meta-smart-glasses-3d-model-4da6290830774000bdab675a5663d666" target="_blank" rel="noreferrer">Ray-Ban Meta Smart Glasses 3D Model</a> by <a href="https://sketchfab.com/mminharali" target="_blank" rel="noreferrer">mminharali</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. User-supplied GLB, with original geometry and logos preserved. Glance adjusts framing, black-frame roughness, lens tint, and lighting; the shopping preview is an added concept overlay. POV scenes use locally served photography. Packaging and garment photos illustrate fictional sample offers; pictured people and brands do not endorse Glance. All shopping data is simulated. Glance’s display is a concept, not a hardware claim.</p><ul>{Object.values(photos).map(item=><li key={item.id}><a href={item.source} target="_blank" rel="noreferrer">{item.id === 'grocery' ? 'Drinks refrigerator' : item.id === 'jacket' ? 'Street scene' : item.id === 'meal' ? 'Dinner scene' : 'Grocery aisle'}</a> — {item.credit} · <a href={item.license === 'Pexels' ? 'https://www.pexels.com/license/' : 'https://unsplash.com/license'}>{item.license} license</a></li>)}</ul><p>Denim references: <a href="https://www.pexels.com/photo/hanging-denim-jacket-in-close-up-photography-11096066/">Mikael Monjour</a>, <a href="https://www.pexels.com/photo/hanged-denim-clothing-7679722/">MART PRODUCTION</a>, and <a href="https://www.pexels.com/photo/man-in-denim-jacket-walking-on-the-street-14918505/">Tuğba Sarıtaş</a>, via Pexels. <a href="/media/CREDITS.md">Full asset notes</a>.</p></details>
    <footer><a className="wordmark" href="#">glance<span/></a><span>BUY WITH YOUR EYES.</span><span>DUBHACKS PROJECT / 2026</span><a href="#">Back to top ↑</a></footer>
    {menu&&<div className="mobile-menu" id="mobile-menu" ref={menuPanel}><button onClick={()=>enter()}>Experience <ArrowUpRight/></button><a href="#how-it-works" onClick={()=>setMenu(false)}>How it works <ArrowUpRight/></a><button onClick={()=>{setMenu(false);menuButton.current?.focus();}}>Close menu <X/></button></div>}
  </div>;
}
