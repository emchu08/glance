import type { Scenario, State } from './state';

export type PhotoId = Scenario | 'aisle';
export type Rect = readonly [number, number, number, number];
export type Photo = { id: PhotoId; file: string; width: number; height: number; focal: readonly [number, number]; alt: string; credit: string; source: string; license: 'Pexels' | 'Unsplash' };
export const photos: Record<PhotoId, Photo> = {
  grocery: { id: 'grocery', file: 'drinks', width: 1200, height: 1800, focal: [.33, .30], alt: 'Glass-door drinks refrigerator with energy drink cans, bottled drinks, and dairy cartons on illuminated shelves.', credit: 'Nothing Ahead', source: 'https://www.pexels.com/photo/variety-of-drinks-3230214/', license: 'Pexels' },
  jacket: { id: 'jacket', file: 'street', width: 1200, height: 1800, focal: [.45, .60], alt: 'A person wearing a blue denim jacket beside a city bridge, with softly focused street architecture behind them.', credit: 'Eddson Lens', source: 'https://www.pexels.com/photo/man-in-denim-jacket-looking-at-urban-street-29353588/', license: 'Pexels' },
  meal: { id: 'meal', file: 'dinner', width: 1200, height: 800, focal: [.46, .55], alt: 'A black plate of tomato pasta and fresh greens on a wooden dinner table with a fork and pepper mill.', credit: 'mustafa türkeri', source: 'https://www.pexels.com/photo/tomato-pasta-on-a-black-plate-19805084/', license: 'Pexels' },
  aisle: { id: 'aisle', file: 'aisle', width: 1200, height: 900, focal: [.51, .64], alt: 'Eye-level view along a grocery aisle, with a clear floor between shelves of cereal and dairy products.', credit: 'Nathália Rosa', source: 'https://unsplash.com/photos/grocery-store-aisle-with-stocked-shelves-rWMIbqmOxrY', license: 'Unsplash' },
};
// Normalized bounds measured against the unmodified source photos, never viewport coordinates.
export const photoTargets: Partial<Record<PhotoId, { id: string; label: string; rect: Rect }[]>> = {
  grocery: [
    { id: 'lemon', label: 'Select original energy drink', rect: [.294, .266, .045, .068] },
    { id: 'zero', label: 'Select lower-sugar energy drink', rect: [.341, .267, .046, .068] },
  ],
  jacket: [{ id: 'jacket', label: 'Select the jacket', rect: [.285, .485, .325, .35] }],
  meal: [{ id: 'meal', label: 'Select the dish', rect: [.06, .135, .81, .855] }],
};
export function photoForState(s: State): PhotoId {
  return s.scenario === 'grocery' && (s.phase === 'navigating' || (s.selected && !['lemon', 'zero'].includes(s.selected))) ? 'aisle' : s.scenario;
}
export const photoUrl = (id: PhotoId, width = window.innerWidth) => `/media/${photos[id].file}-${width < 700 ? 900 : 1800}.webp`;
export type LoadedPhoto = { id: PhotoId; src: string; image: HTMLImageElement };
const cache = new Map<string, Promise<LoadedPhoto>>();
const decoded = new Map<PhotoId, LoadedPhoto>();
export const getLoadedPhoto = (id: PhotoId) => decoded.get(id);
export function loadPhoto(id: PhotoId): Promise<LoadedPhoto> {
  const src = photoUrl(id);
  let pending = cache.get(src);
  if (!pending) {
    pending = new Promise<LoadedPhoto>((resolve, reject) => {
      const image = new Image(); image.decoding = 'async';
      const timer = setTimeout(() => reject(new Error('Photo load timed out')), 15000);
      image.onload = async () => {
        try { await image.decode(); clearTimeout(timer); const loaded = { id, src, image }; decoded.set(id, loaded); resolve(loaded); }
        catch (error) { clearTimeout(timer); reject(error); }
      };
      image.onerror = () => { clearTimeout(timer); reject(new Error(`Could not load ${src}`)); };
      image.src = src;
    }).catch(error => { cache.delete(src); throw error; });
    cache.set(src, pending);
  }
  return pending;
}
export const warmPhoto = (id: PhotoId) => { void loadPhoto(id).catch(() => {}); };
export function photoRegion(width: number, height: number) {
  return width < 700 ? { left: 0, top: 160, width, height: Math.max(150, Math.min(height * .4, height - 500)) } : { left: 0, top: 0, width, height };
}
export function photoLayout(id: PhotoId, width: number, height: number) {
  const photo = photos[id]; const region = photoRegion(width, height);
  const scale = Math.max(region.width / photo.width, region.height / photo.height) * (width < 700 && id === 'grocery' ? Math.max(2.6, 44 / (region.width * .045)) : 1);
  const imageWidth = photo.width * scale, imageHeight = photo.height * scale;
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const left = clamp(region.width * .43 - imageWidth * photo.focal[0], region.width - imageWidth, 0);
  const top = clamp(region.height * .49 - imageHeight * photo.focal[1], region.height - imageHeight, 0);
  return { region, left, top, width: imageWidth, height: imageHeight };
}
export const smooth = (value: number, from: number, to: number) => { const p = Math.max(0, Math.min(1, (value - from) / (to - from))); return p * p * (3 - 2 * p); };
