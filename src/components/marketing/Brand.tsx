import clsx from "clsx";

/** Restrained eyeglasses/vision mark used across marketing, footer, and connect pages. */
export function GlanceMark({ className, stroke = "currentColor" }: { className?: string; stroke?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={clsx("h-6 w-6", className)} fill="none" stroke={stroke} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 44 Q12 34 24 34 H40 Q48 34 50 42 Q52 34 60 34 H76 Q88 34 92 44" />
      <rect x="12" y="40" width="34" height="24" rx="10" />
      <rect x="54" y="40" width="34" height="24" rx="10" />
      <circle cx="71" cy="52" r="4" fill="#a9cdf5" stroke="none" />
    </svg>
  );
}

export function Wordmark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <GlanceMark className={light ? "text-white" : "text-ink"} />
      <span className={clsx("font-serif text-[26px] leading-none tracking-tight", light ? "text-white" : "text-ink")}>Glance</span>
    </span>
  );
}
