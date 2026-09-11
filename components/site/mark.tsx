import { cn } from "@/lib/utils";

/**
 * The mark is the thing the product measures: a sheet folded down the middle, seen at a
 * slight angle so the far panel recedes. Two planes of one surface, lit differently,
 * with the crease between them.
 *
 * It survives 16px because it is three shapes and one line, and it is drawn in the accent
 * rather than in ink so it holds on a dark browser tab as well as a light one.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Crease"
    >
      {/* Near panel, square to the viewer. */}
      <path
        d="M4 3.6A1.6 1.6 0 0 1 5.6 2H12v20H5.6A1.6 1.6 0 0 1 4 20.4V3.6Z"
        fill="var(--crease)"
      />
      {/* Far panel: a trapezoid, full height at the crease and shorter at its outer edge,
          which is what a panel folded away from the viewer does. A convex edge here reads
          as a bookmark rather than as perspective. */}
      <path
        d="M12 2h4.2a1.6 1.6 0 0 1 1.53 1.13l2.2 7.2a4 4 0 0 1 0 2.34l-2.2 7.2A1.6 1.6 0 0 1 16.2 22H12V2Z"
        fill="var(--crease-shade)"
      />
      {/* The crease. */}
      <path
        d="M12 2.6v18.8"
        stroke="var(--crease-light)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}
