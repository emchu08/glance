# Glance — Buy with your eyes

A smart-glasses shopping concept built with React, TypeScript, Vite, React Three Fiber, Drei, and GSAP. A light-blue product hero leads through the wearer’s right lens into locally served photographic environments.

## Run locally

Use Node.js 22.12+ (or 20.19+):

```sh
cd /Users/danielz/Projects/Dubhacks
npm install
npm run dev
```

Open http://localhost:5173, or the Local URL Vite prints. On this Mac the temporary development runtime is available with `export PATH="/tmp/node-v22.14.0-darwin-arm64/bin:$PATH"`. Install Node normally for long-term use; `/tmp` may be cleared.

```sh
npm run build
npm run preview
```

## Experiences

- **Shop smarter:** select either photographed energy drink; inspect its packaging crop, compare sample prices, view fictional nutrition, enable lower-sugar preferences, choose an alternative, and add it to the shared cart. Other sample products remain available through the catalog.
- **Discover a jacket:** select the photographed denim jacket, browse possible matches with real reference photographs and sample buying options, and save a find.
- **Recreate a meal:** select the photographed plate, inspect a suggested recipe and dietary checks, and add ingredients to the shared shopping list. The recipe is inspiration; the photo cannot establish exact ingredients or allergens.
- **Find next item:** a separate fixed aisle photo shows animated floor arrows. Directions respond to the next list item and preference swaps. Aisle assignments are illustrative, not a map of the photographed store; the camera does not simulate walking.
- **Finish** shows cart quantities, totals, saved jackets, and remaining list items. Restart resets the session. Exit returns to the hero while preserving shopping state.
- The 58-second walkthrough supports pause, resume, and replay. Manual actions and tab hiding pause the walkthrough.

## Assets and transition

Real refrigerator, street, dinner, and aisle photos replace the procedural environments. Local WebP files have 900px and 1800px variants; garment reference images use 600px files. All photographic files total approximately 2.7 MB. Inactive scenes load on demand or when their controls are focused/hovered. Guided playback preloads its destinations.

Photo sources, creators, license links, processing notes, and mock-data limitations are documented in [public/media/CREDITS.md](public/media/CREDITS.md) and in the site’s credits. No stock photos need to be supplied by the user. Real packaging is decorative; nutrition, prices, offers, and recognition results are explicitly fictional. Pictured people and brands do not endorse Glance.

The destination is decoded before button-driven entry begins. The right lens previews that exact photo using the same crop calculation as the full-screen scene. Scroll and click drive one entry progress value. Reduced motion uses a simple fade. Recognition brackets use normalized image coordinates, so they follow responsive cropping. On mobile, photographs sit above a compact scrollable interface.

**The supplied Ray-Ban Meta GLB is integrated.** The model by mminharali is licensed CC BY 4.0. Its original geometry, proportions, camera details, hinges, logos, embedded textures, and license metadata are preserved. Runtime changes adjust black-frame materials, tinted lenses, lighting, and framing. The right-lens preview uses the model’s own lens geometry and measured center. See [ASSET-NOTES.md](public/models/ray-ban-meta/ASSET-NOTES.md) for attribution and inspection details. No additional model asset is needed. Glance’s display remains a concept, not a claim about Wayfarer Gen 2 display capabilities.

## Architecture and performance

- `src/App.tsx`: shared scroll/click entry controller, preloading, scenario controls, keyboard handling, loading recovery, and responsive layout.
- `src/Scene.tsx` and `src/scenes/Glasses.tsx`: lazy-loaded hero canvas, camera alignment, soft light fields, studio reflections, the supplied Ray-Ban GLB, and photo lens shader.
- `src/experience/photos.ts`: asset catalog, decoded-photo cache, normalized target bounds, and shared crop calculation.
- `src/experience/PhotoWorld.tsx`: photographic environments, accessible object targets, recognition animation, and perspective floor arrows.
- `src/experience/state.ts` and `useExperience.ts`: shared reducer, recognition timing, cart/list/preferences, navigation, and walkthrough scheduling.
- `src/experience/Display.tsx` and `src/data.ts`: compact interactive cards and structured sample shopping data.

Canvas pixel ratio is capped at 1.5. Continuous rendering pauses offscreen, in hidden tabs, under reduced motion, and after entry into the photographic demo. No video loops or large product-model downloads are needed. Vite reports a size advisory for the lazy Three.js chunk (approximately 282 KB gzip).

Controls have keyboard equivalents, tab navigation, Escape handling, and return focus. A failed WebGL renderer leaves the photo demos usable; Retry 3D recreates it. Failed photos show a retry message instead of entering a blank scene. Shopping data lasts for the page session. Fonts fall back to system fonts if unavailable.

## Verification

With the development server running:

```sh
npm run test:smoke
npm run test:photos
npm run test:visual
npm run test:model
FULL_WALKTHROUGH=1 npm run test:smoke
```

Tests use installed Google Chrome on macOS. Set `CHROME_PATH` for another browser executable and `BASE_URL` for another server. Browser coverage includes actual image loading, desktop/mobile target alignment, both drinks, comparison/nutrition/preferences, cart updates, jacket saves and thumbnails, recipe-to-list transfer, aisle navigation, enter/exit/replay, resize during a demo, reduced motion, and shopping without WebGL. Visual captures are written to `/tmp/glance-*.png` for inspection.

The model check verifies embedded attribution and textures, recovers from a failed GLB request, checks reduced-motion rendering, and confirms replay reuses the loaded model. The original GLB is 1.73 MB and is loaded only with the hero scene.
