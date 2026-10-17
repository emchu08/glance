/** 44 narrow waveform/signal bars for the identification illustration. Deterministic heights. */
export function SignalBars() {
  const bars = Array.from({ length: 44 }, (_, i) => 20 + Math.round(40 * Math.abs(Math.sin(i * 0.55)) + 20 * Math.abs(Math.cos(i * 1.3))));
  return (
    <div className="mt-4 flex h-16 items-end gap-[3px]" aria-hidden>
      {bars.map((h, i) => <span key={i} className="w-[4px] rounded-full bg-white/80" style={{ height: `${h}%`, opacity: 0.5 + (i % 3) * 0.2 }} />)}
    </div>
  );
}
