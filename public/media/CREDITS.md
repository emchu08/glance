# Glance photographic assets

Downloaded and inspected for this project. All runtime assets are served locally; the site makes no requests to photo providers. The photographs are licensed for website use. They are displayed within an interactive demonstration, not redistributed as a photo library. Pictured people, products, and brands do not endorse Glance.

| Local files | Photographer | Source | License |
| --- | --- | --- | --- |
| drinks-900.webp, drinks-1800.webp | Nothing Ahead | https://www.pexels.com/photo/variety-of-drinks-3230214/ | Pexels |
| street-900.webp, street-1800.webp | Eddson Lens | https://www.pexels.com/photo/man-in-denim-jacket-looking-at-urban-street-29353588/ | Pexels |
| dinner-900.webp, dinner-1800.webp | mustafa türkeri | https://www.pexels.com/photo/tomato-pasta-on-a-black-plate-19805084/ | Pexels |
| aisle-900.webp, aisle-1800.webp | Nathália Rosa | https://unsplash.com/photos/grocery-store-aisle-with-stocked-shelves-rWMIbqmOxrY | Unsplash |
| denim-detail-600.webp | Mikael Monjour | https://www.pexels.com/photo/hanging-denim-jacket-in-close-up-photography-11096066/ | Pexels |
| denim-rack-600.webp | MART PRODUCTION | https://www.pexels.com/photo/hanged-denim-clothing-7679722/ | Pexels |
| denim-style-600.webp | Tuğba Sarıtaş | https://www.pexels.com/photo/man-in-denim-jacket-walking-on-the-street-14918505/ | Pexels |

Pexels license: https://www.pexels.com/license/ — permits free website use and modification; attribution appreciated. Do not imply endorsement or resell unaltered images as stock.
Unsplash license: https://unsplash.com/license — permits free commercial and noncommercial use, copying, modification, and distribution; do not recreate a competing image service.

Processing: downloaded compressed WebP variants at 900px/1800px widths for environments and 600px for clothing references. Photos have not been synthetically altered. Display crops and the product-detail crop are applied in CSS. The actual source dimensions and image-relative recognition rectangles are recorded in src/experience/photos.ts. Both the hero lens shader and the photographic viewport use the same layout function.

The drinks photograph contains real packaging. Two photographed cans are interactive anchors for **fictional** original and lower-sugar drink profiles. Values in src/data.ts are expressly mock data, not nutritional claims about those photographed brands. Denim thumbnails are illustrative style references, not a claim that the fictional retailer sells the pictured garment. The dinner image inspires a sample recipe; it does not establish ingredients or allergens. The aisle is a separate illustrative location with a fixed viewpoint and simulated directions, not a measured map of that store.

No video loops or detailed product models are used. The photographic interaction is intentional; no suitable matching, licensed rotatable product model was integrated. No additional assets are needed for these POV demos. The user-supplied Ray-Ban Meta hero GLB by mminharali is integrated under CC BY 4.0; see ../models/ray-ban-meta/ASSET-NOTES.md for its separate attribution and runtime adaptations.
