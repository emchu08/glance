import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronLeft, ChevronRight, CookingPot, LayoutGrid, Leaf, Minus, Navigation, Plus, ScanLine, ShoppingBag, X } from 'lucide-react';
import { products, recommendation, money, type Preference } from '../data';
import { ingredients, jackets, nextDestination, type Action, type State } from './state';

import { photoTargets } from './photos';
import './lens.css';

function DrinkPhoto({ id }: { id: string }) {
  const target = photoTargets.grocery?.find(t => t.id === id);
  if (!target) return null;
  const [x,y,w,h] = target.rect;
  return <div className="drink-photo" style={{ aspectRatio: `${w * 1200} / ${h * 1800}` }}><img src="/media/drinks-1800.webp" loading="lazy" alt="Detail of the selected can in the refrigerator; illustrative packaging" style={{ width: `${100/w}%`, height: `${100/h}%`, left: `${-x/w*100}%`, top: `${-y/h*100}%` }}/></div>;
}

type Props = { state: State; act: (action: Action) => void; reset: () => void };
export default function Display({ state: s, act, reset }: Props) {
  const swipe = useRef<number | null>(null);
  const [choosingMode, setChoosingMode] = useState(false);
  const mode = s.scenario === 'jacket' ? 'Glimpse' : s.scenario === 'meal' ? 'Gourmet' : 'Grocery';
  useEffect(() => { setChoosingMode(false); }, [s.scenario, s.selected, s.drawer, s.phase]);
  const back = () => {
    if (choosingMode) setChoosingMode(false);
    else if (s.drawer) act({ type: 'DRAWER', drawer: null });
    else if (s.phase === 'summary') act({ type: 'CONTINUE' });
    else if (s.phase === 'navigating') act({ type: 'SCENARIO', scenario: s.scenario });
    else if (s.scenario === 'meal' && s.selected && s.mealStep !== 'identify') act({ type: 'MEAL_STEP', step: s.mealStep === 'ingredients' ? 'recipe' : 'identify' });
    else if (s.selected) act({ type: 'PUT_BACK' });
    else setChoosingMode(true);
  };
  const p = products.find(p => p.id === s.selected);
  const rows = products.filter(p => s.cart[p.id]);
  const total = rows.reduce((sum, p) => sum + p.price * s.cart[p.id], 0);
  const alternative = p ? recommendation(p, s.preference) : null;
  const jacket = jackets[s.jacketIndex];
  const next = products.find(p => p.id === nextDestination(s))!;
  const onSwipe = (x: number) => {
    if (swipe.current === null || Math.abs(x - swipe.current) < 40) return;
    if (s.scenario === 'jacket') act({ type: 'JACKET', direction: x < swipe.current ? 1 : -1 });
    if (s.scenario === 'grocery') act({ type: 'TAB', tab: x < swipe.current ? 'nutrition' : 'compare' });
    swipe.current = null;
  };
  return <aside className={`sim-display lens-display ${s.phase === 'summary' ? 'summary-display' : ''}`} data-scenario={s.scenario} aria-label="Simulated right-lens display" onKeyDown={e => {
    if (e.key === 'Escape' && choosingMode) { e.preventDefault(); e.stopPropagation(); setChoosingMode(false); return; }
    if (!['ArrowDown', 'ArrowUp'].includes(e.key) || (e.target as HTMLElement).matches('input,select,textarea')) return;
    const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary,select,input')].filter(el => el.getClientRects().length);
    const current = controls.indexOf(document.activeElement as HTMLElement);
    if (controls.length) { e.preventDefault(); controls[(current + (e.key === 'ArrowDown' ? 1 : -1) + controls.length) % controls.length].focus(); }
  }} onTouchStart={e => { swipe.current = e.touches[0].clientX; }} onTouchEnd={e => onSwipe(e.changedTouches[0].clientX)}>
    <div className="lens-toolbar">
      <button type="button" onClick={back} aria-label="Back in lens interface"><ArrowLeft size={14}/> Back</button>
      <button type="button" onClick={() => { act({ type: 'WALK_PAUSE' }); setChoosingMode(value => !value); }} aria-expanded={choosingMode} aria-label="Choose lens mode"><LayoutGrid size={13}/> Modes</button>
      <span className="lens-mode-status"><i/>{mode} · Sample</span>
      <button type="button" className="lens-cart" aria-label="Open lens cart" onClick={() => act({ type: 'DRAWER', drawer: 'cart' })}><ShoppingBag size={16}/></button>
    </div>
    {choosingMode ? <div className="lens-mode-menu"><span className="micro-label">CHOOSE YOUR MODE</span>{([
      { id: 'jacket', name: 'Glimpse', caption: 'Shop what you see' },
      { id: 'grocery', name: 'Grocery', caption: 'Track your cart' },
      { id: 'meal', name: 'Gourmet', caption: 'Cook what you see' },
    ] as const).map(item => <button key={item.id} type="button" aria-pressed={s.scenario === item.id} onClick={() => { setChoosingMode(false); act({ type: 'SCENARIO', scenario: item.id }); }}><strong>{item.name}</strong><span>{item.caption}</span></button>)}<p>↑ ↓ to move · Enter to select</p></div> : <div className="lens-content">
    {s.phase === 'summary' ? <>
      <div className="display-heading"><span className="micro-label">ALL SET. EYES UP.</span><h2>A good little haul.</h2><p>Your finds, all accounted for.</p></div>
      <div className="summary-products">{rows.length ? rows.map(item => <div key={item.id}><span>{item.name}<small> ×{s.cart[item.id]}</small></span><strong>{money(item.price * s.cart[item.id])}</strong></div>) : <p>Your cart is empty. Head back to the aisle to add a find.</p>}</div>
      <div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div>
      <div className="spending">{['Drinks', 'Dairy & alternatives', 'Pantry', 'Produce'].map((category, i) => { const amount = rows.filter(p => p.category === category).reduce((sum, p) => sum + p.price * s.cart[p.id], 0); return amount > 0 ? <div key={category}><div><span>{category}</span><span>{money(amount)}</span></div><div className="spending-track"><i style={{ width: `${amount / total * 100}%`, background: ['#245cff', '#7b99ea', '#a8b6c8', '#839f72'][i] }} /></div></div> : null; })}</div>
      <div className="saved-summary"><Bookmark size={14} /><span>{s.saved.length} saved {s.saved.length === 1 ? 'jacket' : 'jackets'} · {s.list.filter(i => !i.checked).length} items left on your list</span></div>
      <button className="btn blue full" onClick={reset}>Restart experience <ArrowRight size={16} /></button><button className="quiet-button full" onClick={() => act({ type: 'CONTINUE' })}>Continue exploring</button>
    </> : s.drawer ? <>
      <div className="display-heading drawer-heading"><div><span className="micro-label">WITH YOU, EVERYWHERE</span><h2>{s.drawer === 'cart' ? 'Your cart.' : 'Your shopping list.'}</h2></div><button className="icon-button" onClick={() => act({ type: 'DRAWER', drawer: null })} aria-label="Close panel"><X size={17} /></button></div>
      {s.drawer === 'cart' ? <><div className="cart-rows">{rows.length ? rows.map(item => <div key={item.id}><span className="item-swatch" style={{ background: item.color }} /><div><strong>{item.name}</strong><small>{s.cart[item.id]} × {money(item.price)}</small></div><button className="icon-button" aria-label={`Remove one ${item.name}`} onClick={() => act({ type: 'REMOVE', id: item.id })}><Minus size={15} /></button></div>) : <p>Something catch your eye? Add it to your cart.</p>}</div><div className="summary-total"><span>Subtotal</span><strong>{money(total)}</strong></div><button className="btn blue full" onClick={() => act({ type: 'FINISH' })}>Finish shopping <ArrowRight size={15} /></button></> : <><div className="list-rows">{s.list.map(item => <label key={item.id}><input type="checkbox" checked={item.checked} onChange={() => act({ type: 'TOGGLE_LIST', id: item.id })} /><span><strong>{item.name}</strong><small>{item.quantity}{item.productId ? ` · Aisle ${products.find(p => p.id === item.productId)?.aisle}` : ''}</small></span></label>)}</div><p className="fine-print">{s.ingredientsAdded ? 'Includes ingredients from your dinner inspiration.' : 'A little list to get you started.'}</p><button className="btn blue full" onClick={() => act({ type: 'NAVIGATE' })}>Find next item <Navigation size={15} /></button></>}
      {!!s.saved.length && <div className="saved-mini"><span className="micro-label">SAVED FINDS</span>{s.saved.map(id => <span key={id}>{jackets.find(j => j.id === id)?.name}</span>)}</div>}
    </> : s.phase === 'navigating' ? <>
      <div className="display-heading"><span className="micro-label">A LITTLE DIRECTION</span><h2>Right this way.</h2></div><div className="route-card"><Navigation size={25} /><strong>Aisle {products.find(p => p.id === s.destination)?.aisle}</strong><span>{products.find(p => p.id === s.destination)?.name}</span></div><p className="display-copy">A sample route to your next item. The photograph stays fixed while the floor directions light up.</p><div className="route-track" role="progressbar" aria-label="Route progress" aria-valuenow={Math.round(s.routeProgress * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${s.routeProgress * 100}%` }} /></div><button className="quiet-button full" onClick={() => act({ type: 'ARRIVE' })}>Skip ahead <ArrowRight size={14} /></button>
    </> : s.recognition === 'scanning' ? <div className="recognition-state" role="status"><ScanLine size={32} /><span className="micro-label">LOOKING A LITTLE CLOSER</span><h2>{s.scenario === 'jacket' ? 'Finding the style…' : s.scenario === 'meal' ? 'A little food for thought…' : 'Bringing it into focus…'}</h2><div className="recognition-line" /><p>Simulated recognition</p></div> : s.recognition === 'ready' && s.selected ? <>
      {s.scenario === 'grocery' && p ? <>
        <div className="display-heading"><span className="micro-label"><ScanLine size={12} /> SAMPLE PRODUCT PROFILE</span><h2>{p.name}</h2><p>{p.brand} · {p.size}</p></div>
        {['lemon','zero'].includes(p.id) && <details className="product-inspection"><summary>Inspect packaging <ScanLine size={12}/></summary><DrinkPhoto id={p.id}/><p>Photo detail only. This sample profile is not the photographed brand’s nutrition or price.</p></details>}
        {!['lemon','zero'].includes(p.id) && <p className="fine-print">From your sample catalog · not identified in this photograph.</p>}
        <div className="product-price"><strong>{money(p.price)}</strong><span>at Market St.</span></div>
        <div className="display-tabs" role="tablist" aria-label="Product information" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const tab = s.tab === 'compare' ? 'nutrition' : 'compare'; act({ type: 'TAB', tab }); document.getElementById(`tab-${tab}`)?.focus(); } }}>
          <button id="tab-compare" role="tab" aria-selected={s.tab === 'compare'} aria-controls="product-info" tabIndex={s.tab === 'compare' ? 0 : -1} onClick={() => act({ type: 'TAB', tab: 'compare' })}>Compare prices</button><button id="tab-nutrition" role="tab" aria-selected={s.tab === 'nutrition'} aria-controls="product-info" tabIndex={s.tab === 'nutrition' ? 0 : -1} onClick={() => act({ type: 'TAB', tab: 'nutrition' })}>Nutrition</button>
        </div>
        <div id="product-info" role="tabpanel" aria-labelledby={`tab-${s.tab}`} className="product-info">{s.tab === 'compare' ? <div className="price-options">{[{ name: 'Market St.', price: p.price, note: 'You’re here' }, { name: 'Corner Market', price: p.nearby, note: '0.8 mi away' }, { name: 'Pantry Online', price: p.online, note: 'Delivery extra' }].map(row => <div key={row.name} className={row.price === Math.min(p.price, p.nearby, p.online) ? 'best-price' : ''}><span>{row.name}<small>{row.note}</small></span><strong>{money(row.price)}{row.price === Math.min(p.price, p.nearby, p.online) && <small>LOWEST</small>}</strong></div>)}</div> : <><div className="nutrition-grid"><div><strong>{p.sugar}<small>g</small></strong><span>Sugar</span></div><div><strong>{p.calories}</strong><span>Calories</span></div><div><strong>{p.dairy ? 'Dairy' : 'Plant'}</strong><span>{p.dairy ? 'Contains milk' : 'Dairy-free'}</span></div></div><p className="fine-print">Per serving · Fictional demo values, not packaging facts</p></>}</div>
        <div className="preference-row"><label htmlFor="preference"><Leaf size={13} /> For you</label><select id="preference" value={s.preference} onChange={e => act({ type: 'PREFERENCE', preference: e.target.value as Preference })}><option value="off">Personalization off</option><option value="sugar">Lower sugar</option><option value="dairy">Dairy-free</option></select></div>
        {alternative ? <div className="alternative"><span className="micro-label">A BETTER FIT</span><strong>{alternative.product.name} <span>{money(alternative.product.price)}</span></strong><p>{alternative.reason}</p><button onClick={() => act({ type: 'SWAP', id: alternative.product.id })}>Choose alternative <ArrowRight size={13} /></button></div> : s.preference !== 'off' ? <p className="fine-print preference-feedback">{s.preference === 'dairy' && !p.dairy ? 'Already a dairy-free choice.' : p.sugar === 0 ? 'Already a zero-sugar choice.' : 'No lower-sugar swap in this sample selection.'}</p> : null}
        <div className="lens-actions"><button className="btn blue full" disabled={!!s.adding} onClick={() => act({ type: 'ADD', id: p.id })}>{s.adding === p.id ? <>Added to cart <Check size={16} /></> : <>Add to cart <Plus size={16} /></>}</button><button className="quiet-button full" onClick={() => act({ type: 'PUT_BACK' })}>Put back <ArrowLeft size={13} /></button></div>
      </> : s.scenario === 'jacket' ? <>
        <div className="display-heading"><span className="micro-label">SIMULATED GARMENT SUGGESTIONS</span><h2>Possible matches.</h2><p>Similar denim, pockets, and silhouette. Illustrative photos and sample offers.</p></div>
        {s.rejected ? <div className="no-match"><ScanLine size={28} /><h3>Not quite the one?</h3><p>That’s okay. A different angle could help. No match has been added to your saved finds.</p><button className="btn blue full" onClick={() => act({ type: 'SELECT', id: 'jacket' })}>Try another look <ArrowRight size={15} /></button></div> : <>
          <div className="lens-match"><div className={`jacket-sample sample-${s.jacketIndex}`} key={jacket.id}><img src={jacket.image} alt={`Denim style reference for ${jacket.name}`} loading="lazy"/><span>STYLE REFERENCE · {String(s.jacketIndex + 1).padStart(2, '0')} / 03</span></div>
          <div className="match-heading"><span className="micro-label">{jacket.brand}</span><h3>{jacket.name}</h3><p>{jacket.detail}</p><span className="match-tag">{jacket.match}</span></div></div>
          <div className="retailer-row"><span>{jacket.retailer}<small>{jacket.color} · Sample offer</small></span><strong>{money(jacket.price)}</strong></div><div className="retailer-row"><span>Everyday Select<small>Alternate sample retailer</small></span><strong>{money(jacket.price + 12)}</strong></div>
          <div className="carousel-controls"><button className="icon-button" aria-label="Previous jacket" onClick={() => act({ type: 'JACKET', direction: -1 })}><ChevronLeft size={17} /></button><span>Swipe for similar styles</span><button className="icon-button" aria-label="Next jacket" onClick={() => act({ type: 'JACKET', direction: 1 })}><ChevronRight size={17} /></button></div>
          <div className="lens-actions"><button className="btn blue full" onClick={() => act({ type: 'SAVE' })}>{s.saved.includes(jacket.id) ? 'Saved to your finds' : 'Save this find'}{s.saved.includes(jacket.id) ? <Check size={15} /> : <Bookmark size={15} />}</button><button className="quiet-button full" onClick={() => act({ type: 'REJECT' })}>None of these</button></div>
        </>}
      </> : <>
        <div className="display-heading"><span className="micro-label"><CookingPot size={13} /> A LITTLE DINNER INSPIRATION</span><h2>A tomato pasta moment.</h2><p>Try creamy tomato rigatoni inspired by this dish. A suggestion, not an exact recipe match.</p></div>
        <div className="recipe-steps" aria-label="Recipe steps">{(['identify', 'recipe', 'ingredients'] as const).map((step, i) => <button key={step} aria-current={s.mealStep === step ? 'step' : undefined} onClick={() => act({ type: 'MEAL_STEP', step })}>{String(i + 1).padStart(2, '0')}<span>{['Dish', 'Recipe', 'List'][i]}</span></button>)}</div>
        {s.mealStep === 'identify' ? <><div className="dish-note"><span>25 min</span><span>2 servings</span><span>Vegetarian</span></div><p className="display-copy">A cozy bowl of pasta, sweet tomatoes, a creamy sauce, and fresh basil. Let’s make something like it.</p><button className="btn blue full" onClick={() => act({ type: 'MEAL_STEP', step: 'recipe' })}>See suggested recipe <ArrowRight size={15} /></button></> : s.mealStep === 'recipe' ? <><ol className="recipe-method"><li>Boil 250 g rigatoni in salted water. Reserve a cup of pasta water.</li><li>Soften 300 g tomatoes with a little olive oil, garlic, and salt.</li><li>Stir in 150 ml milk. Toss with pasta and a splash of pasta water.</li><li>Finish with torn basil. Taste and season.</li></ol><button className="btn blue full" onClick={() => act({ type: 'MEAL_STEP', step: 'ingredients' })}>See ingredients <ArrowRight size={15} /></button></> : <><div className="ingredient-list">{ingredients.map(item => <div key={item.id}><span>{item.name}</span><strong>{item.quantity}</strong></div>)}</div><p className="fine-print">Plus pantry staples: olive oil, garlic, salt, and pepper.</p><button className="btn blue full" disabled={s.ingredientsAdded} onClick={() => act({ type: 'INGREDIENTS' })}>{s.ingredientsAdded ? 'Added to your shopping list' : 'Add ingredients to my list'}{s.ingredientsAdded ? <Check size={15} /> : <Plus size={15} />}</button>{s.ingredientsAdded && <button className="quiet-button full" onClick={() => act({ type: 'SCENARIO', scenario: 'grocery' })}>Take my list to the aisle <ArrowRight size={14} /></button>}</>}
        <p className="dietary-note"><Leaf size={13} /><span>Suggested recipe contains wheat and milk. Oat milk is an optional swap. An image can’t verify allergens or the exact recipe; check ingredients.</span></p>
      </>}
    </> : <div className="display-idle"><ScanLine size={27} /><span className="micro-label">YOUR WORLD, IN FOCUS</span><h2>{s.scenario === 'jacket' ? 'Good style travels.' : s.scenario === 'meal' ? 'Bring a little inspiration home.' : 'A smarter kind of shopping.'}</h2><p>{s.scenario === 'jacket' ? 'Select the jacket to discover possible matches.' : s.scenario === 'meal' ? 'Select the dish to explore a recipe.' : 'Select a product in the aisle, or use the product controls below.'}</p>{s.scenario === 'grocery' && <button className="next-find" onClick={() => act({ type: 'NAVIGATE' })}><Navigation size={16} /><span>Next on your list<strong>{next.name}</strong></span><ArrowRight size={14} /></button>}</div>}
    </div>}
    <div className="display-footer">SIMULATED RESULTS · FICTIONAL PRICES & NUTRITION</div>
  </aside>;
}
