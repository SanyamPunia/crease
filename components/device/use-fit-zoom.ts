"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/lib/utils";

/** Largest whole-ish scale that fits a box of the given size, capped at 1. */
export function useFitZoom(boxWidth: number, boxHeight: number, padding = 56) {
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  const node = useRef<HTMLDivElement | null>(null);

  const ref = useCallback((element: HTMLDivElement | null) => {
    node.current = element;
  }, []);

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setAvailable({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit =
    available.width === 0
      ? 1
      : clamp(
          Math.min(
            (available.width - padding) / boxWidth,
            (available.height - padding) / boxHeight,
          ),
          0.2,
          1,
        );

  return { ref, fit: Math.round(fit * 100) / 100 };
}
