"use client";

import { useEffect, useState } from "react";

/**
 * Whether the viewer has asked for reduced motion.
 *
 * Needed as React state rather than a CSS media query because the fold's timing is written
 * as an inline style and the sweep's pacing lives in a rAF loop, neither of which a
 * stylesheet can reach.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const sync = () => setReduced(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reduced;
}
