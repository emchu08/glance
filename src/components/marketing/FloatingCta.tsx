"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Glasses } from "lucide-react";

/** Smaller primary CTA that floats top-right once the hero CTA leaves the viewport. */
export function FloatingCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById("hero-cta");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div initial={{ opacity: 0, y: -12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ type: "spring", duration: 0.4, bounce: 0 }} className="fixed right-4 top-4 z-50">
          <Link href="/connect" className="cta-blue inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[14px] font-semibold shadow-lg"><Glasses size={16} /> Connect glasses</Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
