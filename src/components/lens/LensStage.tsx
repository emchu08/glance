"use client";

import clsx from "clsx";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Lens } from "@/lens/Lens";
import { useLens } from "@/lens/LensProvider";

/** Where the simulated right-lens display sits within a 16:10 wearer scene. */
export const DISPLAY_RECT = { x: 0.655, y: 0.13, width: 0.21, height: 0.336 } as const;

/** Scales the fixed 600×600 lens into any square container (ResizeObserver; works in WKWebView too). */
export function ScaledLens({ interactive, className, instant }: { interactive: boolean; className?: string; instant?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / 600);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={clsx("relative aspect-square w-full overflow-hidden bg-black", className)}>
      <div style={{ width: 600, height: 600, transformOrigin: "top left", transform: `scale(${scale})`, position: "absolute", left: 0, top: 0 }}>
        <Lens interactive={interactive} instant={instant} />
      </div>
    </div>
  );
}

/**
 * Wearer scene: the raw world image with the black-backed lens composited in the
 * right-lens placement using screen blending. Non-interactive by design.
 */
export function WearerScene({ showPlacement = true, className, children }: { showPlacement?: boolean; className?: string; children?: ReactNode }) {
  const { sceneUrl, sceneCaption } = useLens();
  const rect: CSSProperties = { left: `${DISPLAY_RECT.x * 100}%`, top: `${DISPLAY_RECT.y * 100}%`, width: `${DISPLAY_RECT.width * 100}%` };
  return (
    <div className={clsx("relative aspect-[16/10] w-full overflow-hidden rounded-[22px] bg-[#0b0d12]", className)}>
      {sceneUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sceneUrl} alt={sceneCaption ?? "Wearer view"} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Waiting for camera…</div>
      )}
      <div className="pointer-events-none absolute aspect-square" style={rect}>
        {showPlacement && <div className="absolute -inset-1 rounded-md border border-dashed border-white/50" />}
        <div className="absolute inset-0 overflow-hidden" style={{ mixBlendMode: "screen" }}>
          <ScaledLens interactive={false} />
        </div>
        {showPlacement && <div className="absolute -bottom-6 left-0 whitespace-nowrap text-[11px] tracking-wide text-white/70">Approx. display placement · right lens</div>}
      </div>
      {children}
    </div>
  );
}

/** Enlarged interactive lens with the dimmed, zoomed world behind it. */
export function EnlargedLens({ className }: { className?: string }) {
  const { sceneUrl } = useLens();
  const cx = (DISPLAY_RECT.x + DISPLAY_RECT.width / 2) * 100;
  const cy = (DISPLAY_RECT.y + DISPLAY_RECT.height / 2) * 100;
  return (
    <div className={clsx("relative aspect-square w-full overflow-hidden rounded-[22px] bg-black", className)}>
      {sceneUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sceneUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={{ transform: "scale(2.4)", transformOrigin: `${cx}% ${cy}%` }} />
      )}
      <div className="absolute inset-0" style={{ background: "rgb(8 10 14 / 0.72)" }} />
      <div className="absolute inset-0" style={{ mixBlendMode: "screen" }}>
        <ScaledLens interactive />
      </div>
    </div>
  );
}
