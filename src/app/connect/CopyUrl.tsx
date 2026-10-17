"use client";

import { useState } from "react";

export function CopyUrl({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" className="rounded-full border border-white/20 px-3 py-1 text-xs text-fg" onClick={async () => { try { await navigator.clipboard.writeText(url); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>{done ? "Copied" : "Copy URL"}</button>;
}
