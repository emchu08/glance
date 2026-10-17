# Glance — standalone 3D site (website/)

Editorial, pale-sage design with a procedural glossy glasses model, three simulated scenarios (jacket, meal, grocery),
a shared simulated right-lens panel, and a 58-second guided walkthrough that dispatches the same reducer actions a
visitor would. No third-party 3D models or video; no real payments.

```bash
npm ci
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run test:smoke   # needs Chrome (CHROME_PATH optional, BASE_URL optional)
FULL_WALKTHROUGH=1 npm run test:smoke
```

`VITE_LIVE_APP_URL` points the "Try live demo" link at the root app.
