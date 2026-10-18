import { products, type Preference } from '../data';

export type Scenario = 'grocery' | 'jacket' | 'meal';
export type Phase = 'hero' | 'entering' | 'exploring' | 'navigating' | 'summary';
export type ListItem = { id: string; name: string; quantity: string; productId?: string; checked: boolean };
export const ingredients: ListItem[] = [
  { id: 'pasta', name: 'Rigatoni', quantity: '250 g', productId: 'pasta', checked: false },
  { id: 'tomatoes', name: 'Cherry tomatoes', quantity: '300 g', productId: 'tomatoes', checked: false },
  { id: 'milk', name: 'Whole dairy milk', quantity: '150 ml', productId: 'milk', checked: false },
  { id: 'basil', name: 'Fresh basil', quantity: '1 small bunch', productId: 'basil', checked: false },
];
export const jackets = [
  { id: 'field', name: 'Everyday denim jacket', brand: 'NORTH & COMMON', price: 89, retailer: 'Common Goods', color: 'Washed blue', detail: 'Denim · relaxed fit', image: '/media/denim-detail-600.webp', match: 'Closest silhouette' },
  { id: 'utility', name: 'Relaxed denim trucker', brand: 'FORM STUDIO', price: 115, retailer: 'Form Studio', color: 'Mid blue', detail: 'Denim · boxy fit', image: '/media/denim-rack-600.webp', match: 'Similar pockets & color' },
  { id: 'chore', name: 'Vintage denim overshirt', brand: 'OFF HOURS', price: 74, retailer: 'Off Hours', color: 'Light blue', detail: 'Denim · easy fit', image: '/media/denim-style-600.webp', match: 'Similar everyday style' },
];
export type State = {
  phase: Phase; entry: number; scenario: Scenario; selected: string | null;
  recognition: 'idle' | 'scanning' | 'ready'; tab: 'compare' | 'nutrition';
  preference: Preference; cart: Record<string, number>; list: ListItem[];
  jacketIndex: number; rejected: boolean; saved: string[]; mealStep: 'identify' | 'recipe' | 'ingredients';
  ingredientsAdded: boolean; destination: string; routeGuided: boolean; routeProgress: number; cameraZ: number; routeFrom: number;
  drawer: 'cart' | 'list' | null; notice: string; adding: string | null;
  walk: 'off' | 'playing' | 'paused' | 'done'; walkStep: number;
};
export const initialState: State = {
  phase: 'hero', entry: 0, scenario: 'grocery', selected: null, recognition: 'idle', tab: 'compare',
  preference: 'off', cart: {}, list: [{ id: 'milk', name: 'Whole dairy milk', quantity: '1 liter', productId: 'milk', checked: false }, { id: 'cereal', name: 'Honey oat cereal', quantity: '350 g', productId: 'cereal', checked: false }],
  jacketIndex: 0, rejected: false, saved: [], mealStep: 'identify', ingredientsAdded: false,
  destination: 'milk', routeGuided: false, routeProgress: 0, cameraZ: 4.8, routeFrom: 4.8, drawer: null, notice: '', adding: null,
  walk: 'off', walkStep: 0,
};
export type Action =
  | { type: 'ENTRY'; value: number } | { type: 'EXIT' } | { type: 'RESET' }
  | { type: 'SCENARIO'; scenario: Scenario } | { type: 'SELECT'; id: string } | { type: 'RECOGNIZED'; id: string }
  | { type: 'TAB'; tab: State['tab'] } | { type: 'PREFERENCE'; preference: Preference }
  | { type: 'ADD'; id: string } | { type: 'REMOVE'; id: string } | { type: 'ADDED' } | { type: 'PUT_BACK' }
  | { type: 'SWAP'; id: string } | { type: 'DRAWER'; drawer: State['drawer'] } | { type: 'TOGGLE_LIST'; id: string }
  | { type: 'NAVIGATE' } | { type: 'ROUTE'; value: number } | { type: 'ARRIVE' }
  | { type: 'JACKET'; direction: number } | { type: 'REJECT' } | { type: 'SAVE' }
  | { type: 'MEAL_STEP'; step: State['mealStep'] } | { type: 'INGREDIENTS' }
  | { type: 'FINISH' } | { type: 'CONTINUE' }
  | { type: 'WALK_START' } | { type: 'WALK_PAUSE' } | { type: 'WALK_RESUME' } | { type: 'WALK_STEP'; step: number } | { type: 'WALK_DONE' };

export const routeZ = (id: string) => { const aisle = products.find(p => p.id === id)?.aisle ?? 4; return aisle <= 4 ? 1.5 : aisle <= 6 ? -2.2 : -5.4; };
export function nextDestination(s: State) {
  return s.list.find(item => !item.checked && item.productId)?.productId ?? products.find(p => !s.cart[p.id])?.id ?? 'lemon';
}
export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'ENTRY': { if (s.entry >= .999 && !['hero', 'entering'].includes(s.phase)) return s; const value = Math.max(0, Math.min(1, a.value)); return { ...s, entry: value, phase: value >= .999 ? (['hero', 'entering'].includes(s.phase) ? 'exploring' : s.phase) : value > .005 ? 'entering' : 'hero', walk: value < .999 && s.walk === 'playing' ? 'paused' : s.walk }; }
    case 'EXIT': return { ...s, phase: 'hero', entry: 0, selected: null, recognition: 'idle', drawer: null, walk: s.walk === 'playing' ? 'paused' : s.walk, routeProgress: 0 };
    case 'RESET': return { ...initialState };
    case 'SCENARIO': return { ...s, scenario: a.scenario, selected: null, recognition: 'idle', phase: 'exploring', drawer: null, rejected: false, mealStep: 'identify', notice: '', routeProgress: 0 };
    case 'SELECT': return { ...s, selected: a.id, recognition: 'scanning', tab: 'compare', rejected: false, phase: 'exploring', drawer: null, mealStep: 'identify', notice: '', routeProgress: 0 };
    case 'RECOGNIZED': return s.selected === a.id ? { ...s, recognition: 'ready' } : s;
    case 'TAB': return { ...s, tab: a.tab };
    case 'PREFERENCE': return { ...s, preference: a.preference };
    case 'ADD': { if (s.adding) return s; const p = products.find(p => p.id === a.id); if (!p) return s; return { ...s, cart: { ...s.cart, [a.id]: (s.cart[a.id] ?? 0) + 1 }, list: s.list.map(i => i.productId === a.id ? { ...i, checked: true } : i), adding: a.id, notice: `${p.name} added to your cart.` }; }
    case 'ADDED': return { ...s, adding: null };
    case 'REMOVE': { const cart = { ...s.cart }; if (!cart[a.id]) return s; if (cart[a.id] > 1) cart[a.id]--; else delete cart[a.id]; return { ...s, cart, list: s.list.map(i => i.productId === a.id && !cart[a.id] ? { ...i, checked: false } : i), notice: 'Cart updated.' }; }
    case 'PUT_BACK': return { ...s, selected: null, recognition: 'idle', notice: 'Back on the shelf.' };
    case 'SWAP': { const p = products.find(p => p.id === a.id)!; return { ...s, selected: a.id, recognition: 'ready', tab: 'compare', destination: a.id, list: s.list.map(i => i.productId === s.selected || (s.preference === 'dairy' && i.productId === 'milk') ? { ...i, productId: a.id, name: p.name, checked: !!s.cart[a.id] } : i), notice: `Switched to ${p.name}. Your destination is now aisle ${p.aisle}.` }; }
    case 'DRAWER': return { ...s, drawer: s.drawer === a.drawer ? null : a.drawer };
    case 'TOGGLE_LIST': return { ...s, list: s.list.map(i => i.id === a.id ? { ...i, checked: !i.checked } : i) };
    case 'NAVIGATE': { const id = nextDestination(s); return { ...s, scenario: 'grocery', phase: 'navigating', selected: null, recognition: 'idle', drawer: null, destination: id, routeGuided: s.walk === 'playing', routeFrom: s.cameraZ, routeProgress: 0, notice: `Follow the floor arrows to ${products.find(p => p.id === id)?.name}.` }; }
    case 'ROUTE': return { ...s, routeProgress: a.value }; // Static photograph: animate the route, never the camera.
    case 'ARRIVE': return s.phase === 'navigating' ? { ...s, phase: 'exploring', cameraZ: routeZ(s.destination), selected: s.destination, recognition: 'scanning', tab: 'compare', notice: 'Sample route complete. Your next item is in the list.' } : s;
    case 'JACKET': return { ...s, jacketIndex: (s.jacketIndex + a.direction + jackets.length) % jackets.length, rejected: false };
    case 'REJECT': return { ...s, rejected: true, notice: 'No match saved. Try another angle or explore similar styles.' };
    case 'SAVE': { const id = jackets[s.jacketIndex].id; return { ...s, saved: s.saved.includes(id) ? s.saved.filter(x => x !== id) : [...s.saved, id], notice: s.saved.includes(id) ? 'Removed from saved finds.' : 'Jacket saved to your finds.' }; }
    case 'MEAL_STEP': return { ...s, mealStep: a.step };
    case 'INGREDIENTS': { const list = [...s.list]; for (const item of ingredients) if (!list.some(i => i.id === item.id)) list.push({ ...item }); return { ...s, ingredientsAdded: true, list, notice: 'Recipe ingredients are in your grocery list.' }; }
    case 'FINISH': return { ...s, phase: 'summary', drawer: null, selected: null, recognition: 'idle' };
    case 'CONTINUE': return { ...s, phase: 'exploring' };
    case 'WALK_START': return { ...initialState, phase: 'exploring', entry: 1, scenario: 'jacket', walk: 'playing' };
    case 'WALK_PAUSE': return s.walk === 'playing' ? { ...s, walk: 'paused' } : s;
    case 'WALK_RESUME': return { ...s, walk: 'playing' };
    case 'WALK_STEP': return { ...s, walkStep: a.step };
    case 'WALK_DONE': return { ...s, walk: 'done' };
  }
}

// Both the timer and the visible controls dispatch this same Action type.
export const walkthrough: { at: number; action: Action; caption: string }[] = [
  { at: 0, action: { type: 'SCENARIO', scenario: 'jacket' }, caption: 'A good jacket catches your eye.' },
  { at: 3, action: { type: 'SELECT', id: 'jacket' }, caption: 'Focus on the jacket. Discover possible matches.' },
  { at: 7, action: { type: 'JACKET', direction: 1 }, caption: 'Compare a similar cut, material, and price.' },
  { at: 10, action: { type: 'SAVE' }, caption: 'Save this find for later.' },
  { at: 13, action: { type: 'SCENARIO', scenario: 'meal' }, caption: 'Something delicious. A little inspiration.' },
  { at: 16, action: { type: 'SELECT', id: 'meal' }, caption: 'A suggested dish, with room for interpretation.' },
  { at: 20, action: { type: 'MEAL_STEP', step: 'recipe' }, caption: 'A simple recipe to make it your own.' },
  { at: 24, action: { type: 'MEAL_STEP', step: 'ingredients' }, caption: 'The ingredients, ready for your next shop.' },
  { at: 27, action: { type: 'INGREDIENTS' }, caption: 'One list, carried from dinner to the grocery aisle.' },
  { at: 30, action: { type: 'SCENARIO', scenario: 'grocery' }, caption: 'Now, shop with a little more perspective.' },
  { at: 33, action: { type: 'SELECT', id: 'lemon' }, caption: 'Pick up the lemonade. Compare the sample prices.' },
  { at: 37, action: { type: 'TAB', tab: 'nutrition' }, caption: 'A swipe brings nutrition into view.' },
  { at: 39, action: { type: 'ADD', id: 'lemon' }, caption: 'In your cart. Your total stays in sight.' },
  { at: 42, action: { type: 'SELECT', id: 'milk' }, caption: 'Looking for a dairy-free option?' },
  { at: 44, action: { type: 'PREFERENCE', preference: 'dairy' }, caption: 'Your preferences make the difference.' },
  { at: 46, action: { type: 'SWAP', id: 'oat' }, caption: 'Choose oat milk. Your destination updates, too.' },
  { at: 48, action: { type: 'NAVIGATE' }, caption: 'Follow a quiet path to your next find.' },
  { at: 53, action: { type: 'ADD', id: 'oat' }, caption: 'One more everyday good.' },
  { at: 56, action: { type: 'FINISH' }, caption: 'A clear picture of your shopping.' },
];
