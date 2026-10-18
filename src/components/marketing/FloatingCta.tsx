"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Repeats the hero's primary action, under the same name, once that button scrolls away. */
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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.22, ease: "easeOut" }} className="fixed bottom-5 right-5 z-50">
          <Link href="/demo" className="cta-lit inline-flex rounded-full px-5 py-2.5 text-[14px] font-semibold">
            Open the live demo
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
