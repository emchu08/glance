import { useEffect, useState } from "react";

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const mq = window.matchMedia("(prefers-reduced-motion: reduce)"); const h = () => setR(mq.matches); mq.addEventListener("change", h); return () => mq.removeEventListener("change", h); }, []);
  return r;
}

export function useIsMobile(): boolean {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < 760);
  useEffect(() => { const h = () => setM(window.innerWidth < 760); window.addEventListener("resize", h); return () => window.removeEventListener("resize", h); }, []);
  return m;
}
