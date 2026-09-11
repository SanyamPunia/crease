"use client";

import { type RefObject, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { proxyPath } from "@/lib/url";
import { cn } from "@/lib/utils";

interface ScreenProps {
  url: string;
  /** Reload token. Changing it remounts the frame. */
  epoch: number;
  screenWidth: number;
  screenHeight: number;
  /** The width the document actually lays out at, which is not always the screen width. */
  layoutWidth: number;
  /** Alternates 0/1 on each settled fold change, or null while nothing is settling. */
  settle: 0 | 1 | null;
  /** The fold is being dragged, so the frame must not take the pointer. */
  dragging: boolean;
  /** The same timing the shell moves on, so the two read as one object. */
  motion: { transitionDuration: string; transitionTimingFunction?: string };
  loading: boolean;
  frameRef: RefObject<HTMLIFrameElement | null>;
  /** Called once the frame settles, with whether the probe is actually running in it. */
  onSettled: (alive: boolean) => void;
}

/**
 * The page under test.
 *
 * The frame is sized to the document's real layout width and then scaled to the screen,
 * which is what a phone does. A page with no viewport meta lays out at 980px and gets
 * zoomed out to fit, exactly as it would in Safari. A frame that is simply set to the
 * device width would silently reflow that page and pass it.
 */
export function Screen({
  url,
  epoch,
  screenWidth,
  screenHeight,
  layoutWidth,
  settle,
  dragging,
  motion,
  loading,
  frameRef,
  onSettled,
}: ScreenProps) {
  const scale = screenWidth / layoutWidth;

  /**
   * A crashed renderer swaps in Chrome's own error page, which is cross-origin and has no
   * probe. Without this check the last good measurement stays on screen and the rail
   * scores a page that is no longer there.
   */
  // The load event may already have fired by the time React attached its handler.
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch is the trigger, the frame is read imperatively.
  useEffect(() => {
    const timer = setTimeout(() => {
      const frame = frameRef.current;
      if (frame?.contentDocument?.readyState === "complete") checkAlive();
    }, 250);
    return () => clearTimeout(timer);
  }, [epoch]);

  function checkAlive() {
    try {
      const win = frameRef.current?.contentWindow as (Window & { __duoProbe?: true }) | null;
      onSettled(win?.__duoProbe === true);
    } catch {
      onSettled(false);
    }
  }

  return (
    <div
      className={cn(
        "relative size-full overflow-hidden bg-screen",
        settle === 0 && "fold-settle-a",
        settle === 1 && "fold-settle-b",
      )}
    >
      <iframe
        key={epoch}
        ref={frameRef}
        title="Page under test"
        src={proxyPath(url)}
        referrerPolicy="no-referrer"
        onLoad={checkAlive}
        onError={() => onSettled(false)}
        allow="clipboard-read; clipboard-write"
        className="block origin-top-left border-0 bg-screen transition-[width,height,transform]"
        style={{
          width: layoutWidth,
          height: screenHeight / scale,
          transform: `scale(${scale})`,
          pointerEvents: dragging ? "none" : undefined,
          // Without this the shell glides to its new size while the frame inside snaps to
          // it, and the gap between them paints as a band of empty screen. One timing for
          // both is what makes the device read as a single object rather than a box with
          // a page loose inside it.
          ...motion,
        }}
      />

      {loading ? (
        <div className="absolute inset-0 flex flex-col gap-4 bg-screen p-6">
          <Skeleton className="h-8 w-2/5 bg-screen-ghost" />
          <Skeleton className="h-3 w-4/5 bg-screen-ghost" />
          <Skeleton className="h-3 w-3/5 bg-screen-ghost" />
          <Skeleton className="mt-3 h-40 w-full bg-screen-ghost" />
          <Skeleton className="h-3 w-3/4 bg-screen-ghost" />
          <Skeleton className="h-3 w-1/2 bg-screen-ghost" />
        </div>
      ) : null}
    </div>
  );
}
