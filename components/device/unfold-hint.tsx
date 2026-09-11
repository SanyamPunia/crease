"use client";

import { cn } from "@/lib/utils";

/**
 * A hand-drawn arrow pointing at the fold grip.
 *
 * The grip is the one control on the bench whose purpose is not obvious from looking at
 * it, and a visitor now lands here with no page in front of it explaining anything. It
 * shows once and leaves the moment the fold moves, so it never becomes furniture.
 *
 * It is positioned from a zero-size anchor sitting exactly on the grip, so it follows the
 * grip on both axes rather than drifting to a corner of the stage when the device turns.
 */
export function UnfoldHint({ axis, visible }: { axis: "x" | "y"; visible: boolean }) {
  const horizontal = axis === "x";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute flex items-center gap-1.5 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0",
        horizontal
          ? "-translate-y-1/2 top-0 left-0 ml-5 flex-row"
          : "-translate-x-1/2 top-0 left-0 mt-5 flex-col",
      )}
    >
      <svg
        width="46"
        height="26"
        viewBox="0 0 46 26"
        fill="none"
        className={cn("shrink-0 text-crease", horizontal ? "" : "rotate-90")}
      >
        <title>Arrow pointing at the fold grip</title>
        {/* Two overlapping strokes so it reads as marker, not as a vector arrow. */}
        <path
          d="M44 13c-7.8-1.4-15.9-1.1-23.6.9-4.2 1.1-8.4 2.8-11.6 5.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M15.2 21.4c-2.3-.6-4.4-1.4-6.3-2.6.9-2 2.2-3.8 3.8-5.4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="whitespace-nowrap font-medium text-crease text-micro">
        Drag to unfold
      </span>
    </div>
  );
}
