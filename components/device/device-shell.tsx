"use client";

import type { ReactNode } from "react";
import { DUO } from "@/lib/device";
import { cn } from "@/lib/utils";

export type FoldAxis = "x" | "y";

interface DeviceShellProps {
  /** Screen size in CSS pixels, before the stage zoom. */
  width: number;
  height: number;
  /** The axis the fold opens along. Vertical crease when "x". */
  axis: FoldAxis;
  /** How far open, 0 to 1. Drives the crease and the hinge seams. */
  fold: number;
  animate: boolean;
  children: ReactNode;
}

const FOLD_MOTION = {
  transitionTimingFunction: "var(--ease-fold)",
  transitionDuration: "var(--duration-fold)",
} as const;

/**
 * The physical object: shell, bezel, screen, crease.
 *
 * The landing page draws the device as an elevation. Here it is solid, so the page inside
 * reads as the subject and the hardware stays out of the way.
 */
export function DeviceShell({
  width,
  height,
  axis,
  fold,
  animate,
  children,
}: DeviceShellProps) {
  const motion = animate ? FOLD_MOTION : { transitionDuration: "0ms" };
  const open = fold > 0.04;

  return (
    <div
      className="relative bg-shell shadow-[0_1px_2px_rgba(0,0,0,0.18),0_18px_44px_-18px_rgba(0,0,0,0.45)] ring-1 ring-shell-edge transition-[width,height]"
      style={{
        width: width + DUO.bezel * 2,
        height: height + DUO.bezel * 2,
        borderRadius: DUO.shellRadius,
        padding: DUO.bezel,
        ...motion,
      }}
    >
      <div
        className="relative size-full overflow-hidden bg-screen"
        style={{ borderRadius: DUO.screenRadius }}
      >
        {children}

        {/* The crease. A real one catches light down the middle of the panel. */}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute transition-opacity",
            axis === "x"
              ? "inset-y-0 left-1/2 w-3 -translate-x-1/2"
              : "inset-x-0 top-1/2 h-3 -translate-y-1/2",
          )}
          style={{
            opacity: open ? fold * 0.5 : 0,
            backgroundImage: `linear-gradient(to ${axis === "x" ? "right" : "bottom"}, transparent, rgba(0,0,0,0.07) 45%, rgba(0,0,0,0.07) 55%, transparent)`,
            ...motion,
          }}
        />
      </div>

      {/* Hinge seams, on the shell edge rather than across the screen. */}
      {[0, 1].map((end) => (
        <span
          key={end}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute bg-shell-edge transition-opacity",
            axis === "x"
              ? "h-2 w-px left-1/2 -translate-x-1/2"
              : "w-2 h-px top-1/2 -translate-y-1/2",
            axis === "x"
              ? end === 0
                ? "top-0"
                : "bottom-0"
              : end === 0
                ? "left-0"
                : "right-0",
          )}
          style={{ opacity: open ? 1 : 0, ...motion }}
        />
      ))}
    </div>
  );
}
