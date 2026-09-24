"use client";

import { motion } from "framer-motion";

export default function PageTransition({
  children,
  className,
  fadeOnly = false,
}: {
  children: React.ReactNode;
  className?: string;
  /** Opacity only, no y/scale. Needed for pages with `position: fixed`
   *  content (the mobile chat panel): any transform on this wrapper makes
   *  it the containing block for fixed descendants, so they'd render
   *  offset/short for the length of the animation and then snap. */
  fadeOnly?: boolean;
}) {
  return (
    <motion.div
      className={className}
      initial={fadeOnly ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
      animate={fadeOnly ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={fadeOnly ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.995 }}
      transition={{
        duration: 0.35,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
