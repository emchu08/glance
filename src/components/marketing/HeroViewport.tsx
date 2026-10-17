"use client";

import { motion, MotionConfig } from "motion/react";

/**
 * Hero product viewport: the street scene with detection disabled, a floating Looking pill,
 * and the assistant answer derived from the sample saves data (New Balance 530 at Zappos).
 */
export function HeroViewport() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative mx-auto mt-12 max-w-4xl">
        <div className="relative overflow-hidden rounded-t-[28px] border border-white/40 bg-[#0b0d12] shadow-2xl" style={{ aspectRatio: "16 / 10" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/samples/street.svg" alt="Street scene seen through the glasses" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent" />
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="glass-medium absolute left-4 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-medium text-white"><span className="h-2 w-2 rounded-full bg-wearer" /> Looking · Nike Zoom Vomero 5</motion.div>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.5 }} className="absolute bottom-10 right-4 w-[min(360px,80%)] rounded-2xl border border-white/30 bg-white/95 p-4 text-ink shadow-xl backdrop-blur md:bottom-6 md:right-6">
            <p className="text-[12px] font-medium text-ink-subtle">Something like these, under $80?</p>
            <p className="mt-1 text-[17px] font-semibold tracking-tight">New Balance 530 · $74.99 at Zappos</p>
            <p className="text-[13px] text-ink-muted">US 10 · neutral mesh and suede · similar low-profile silhouette</p>
            <div className="mt-3 flex gap-2 text-[12px]"><span className="rounded-full bg-ink px-3 py-1 text-white">Save</span><span className="rounded-full border border-rule px-3 py-1">Compare</span></div>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}
