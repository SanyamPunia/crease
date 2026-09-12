import Link from "next/link";
import { Mark } from "@/components/site/mark";
import { cn } from "@/lib/utils";

/** The mark is the device itself: two panels, one crease. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "focus-ring group flex items-center gap-2 rounded-full transition-opacity duration-150 coarse:min-h-11 hover:opacity-70",
        className,
      )}
    >
      <Mark className="size-5" />
      <span className="font-semibold text-ink text-label tracking-[-0.005em]">Crease</span>
    </Link>
  );
}
