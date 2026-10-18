"use client";

import Link from "next/link";
import { ScaledLens } from "@/components/lens/LensStage";
import { fixtureState } from "@/lens/fixtures";
import { LensProvider } from "@/lens/LensProvider";

export function FixtureTile({ id, live }: { id: string; live: boolean }) {
  return (
    <figure className="rounded-2xl border border-white/10 bg-surface p-3">
      <LensProvider capture="sample" fixture initial={(s) => fixtureState(id, live, s)}>
        <ScaledLens interactive={false} instant className="rounded-xl" />
      </LensProvider>
      <figcaption className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="font-mono">{id}</span>
        <Link className="underline" href={`/lens?screen=${id}&source=${live ? "live" : "sample"}`} target="_blank">{live ? "live-shaped" : "sample"} ↗</Link>
      </figcaption>
    </figure>
  );
}
