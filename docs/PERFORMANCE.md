# Performance

Targets: 60 FPS active animation on the demo laptop; ≥30 FPS on declared mobile devices; input feedback <100 ms p95;
explicit AI scans (never per frame); Grocery sampling every 3 s; relay frames ≤768 px.

## How it is built for this

- One lens state source; mirrored presenter copies render the same state (no double timers).
- Screen transitions animate transform/opacity/filter only (0.34 s spring in, 0.14 s out); reduced motion → instant.
- Demand: static screens rest; the Grocery sampler is single-flight with dropped busy ticks and stale-session guards.
- 3D site: one Canvas, DPR capped 1.5, instanced shelf stock, lazy jacket/meal scenes, visibility-aware `frameloop`,
  geometry disposal on teardown, CSS/HTML fallback with Retry 3D that preserves shopping state.
- Native: event-driven coalesced WKWebView snapshots (~90 ms settle), never a 60 fps snapshot loop.

## Measure

```bash
npm run measure:performance          # uses website/node_modules/playwright; writes measurements/performance.local.json
MEASURE_DEVICE="MacBook Pro 14 M3, macOS 15, Chrome 141, 120Hz" npm run measure:performance
```

Reports median / p95 / p99 frame intervals, average FPS, and long frames per page after a 1.5 s warm-up.
Idle frame counters on static lens screens are expected and are not a failed benchmark.

## Results

Physical-device measurements for the team's demo laptop and iPhone are **pending**; run the command above on those
devices and commit the JSON next to this file. Camera delivery, AI latency (presenter Diagnostics → Inference), and
physical glasses display updates are reported separately; the snapshot bridge cannot establish 30–60 FPS and does not claim to.
