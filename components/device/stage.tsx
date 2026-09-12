"use client";

import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import type { SweepStep } from "@/lib/audit";
import { DETENTS, DUO, foldForWidth, heightForFold, widthForFold } from "@/lib/device";
import { rubberBand, type SpringHandle, springTo } from "@/lib/spring";
import { clamp, cn } from "@/lib/utils";
import { DeviceShell, type FoldAxis } from "./device-shell";
import { UnfoldHint } from "./unfold-hint";

interface StageProps {
  axis: FoldAxis;
  fold: number;
  onFoldChange: (fold: number) => void;
  onDragStateChange: (dragging: boolean) => void;
  zoom: number;
  animate: boolean;
  sweep: SweepStep[] | null;
  sweeping: boolean;
  /** Show the one-time pointer at the grip, until the fold is first moved. */
  hint: boolean;
  /** Degrees the device is rotated through while it turns. Settles at 0. */
  turnAngle: number;
  /** True while the device is moving on its own. The annotations stand down until it lands. */
  quiet: boolean;
  /** True only through a rotation, when nothing on the device can be aimed at. */
  turning: boolean;
  /** The stage is holding only what is on screen, so there is no room left to outline. */
  compact: boolean;
  children: ReactNode;
}

const BEZEL = DUO.bezel * 2;
const MIN_WIDTH = DUO.cover.width;
const MAX_WIDTH = DUO.unfolded.width;
/** The largest either axis ever reaches, so the stage and the ghost never resize. */
const MAX_ACROSS = Math.max(DUO.cover.height, DUO.unfolded.height);
/** Gutters the stage reserves outside the device: the dimension line on the leading edge,
    the travel ruler on the trailing one. Reserved rather than overflowed, so the device
    still lands in the optical centre of the stage. */
const LEAD_GUTTER = 40;
const TRAIL_GUTTER = 46;

const FOLD_MOTION = {
  transitionTimingFunction: "var(--ease-fold)",
  transitionDuration: "var(--duration-fold)",
} as const;

/** A deliberate throw toward an end, rather than a reposition. Points per second. */
const FLING = 900;
/** Released this close to a named stop, the fold settles into it. */
const DETENT_PULL = 14;

export function Stage({
  axis,
  fold,
  onFoldChange,
  onDragStateChange,
  zoom,
  animate,
  sweep,
  sweeping,
  hint,
  turnAngle,
  quiet,
  turning,
  compact,
  children,
}: StageProps) {
  const track = useRef<HTMLDivElement | null>(null);
  const settle = useRef<SpringHandle | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion.current = query.matches;
    const sync = () => {
      reducedMotion.current = query.matches;
    };
    query.addEventListener("change", sync);
    return () => {
      query.removeEventListener("change", sync);
      settle.current?.stop();
    };
  }, []);
  const foldSize = widthForFold(fold);
  const horizontal = axis === "x";

  // The fold moves one axis. The other is the device's constant long side.
  // Opening the device changes both dimensions, because the two panels are separate
  // screens at different densities. The fold still travels along one axis; the other is
  // no longer constant.
  const across = heightForFold(fold);
  const screen = horizontal ? { w: foldSize, h: across } : { w: across, h: foldSize };
  /**
   * The area the stage draws into.
   *
   * Normally the device at its widest, so opening the fold moves one edge and the grid
   * under it never resizes. Compact holds only what is on screen: the zoom is worked out
   * against the same box, and a stage still sized for the unfolded device would overflow
   * its container and strand the device in the corner of it.
   */
  const box = compact
    ? { w: screen.w + BEZEL, h: screen.h + BEZEL }
    : horizontal
      ? { w: MAX_WIDTH + BEZEL, h: MAX_ACROSS + BEZEL }
      : { w: MAX_ACROSS + BEZEL, h: MAX_WIDTH + BEZEL };

  const along = (horizontal ? screen.w : screen.h) + BEZEL;
  const alongMin = MIN_WIDTH + BEZEL;
  const alongMax = MAX_WIDTH + BEZEL;
  const motion = animate ? FOLD_MOTION : { transitionDuration: "0ms" };

  /** Where the pointer is, in points, before any limit is applied. */
  function pointsFromPointer(event: PointerEvent | ReactPointerEvent) {
    const rail = track.current;
    if (!rail) return foldSize;
    const rect = rail.getBoundingClientRect();
    const offset = horizontal ? event.clientX - rect.left : event.clientY - rect.top;
    return offset / zoom - BEZEL;
  }

  /** Past either end the fold moves a fraction of the distance rather than stopping dead. */
  function withResistance(points: number) {
    if (points < MIN_WIDTH) return MIN_WIDTH + rubberBand(points - MIN_WIDTH);
    if (points > MAX_WIDTH) return MAX_WIDTH + rubberBand(points - MAX_WIDTH);
    return points;
  }

  /**
   * Where the fold should come to rest.
   *
   * This is a reposition, not a fling, so momentum is deliberately absent: it stops where
   * the finger stopped. Velocity is read for one purpose only, to let a hard throw toward
   * an end complete, which is how somebody opens a real device in one motion.
   */
  function restingPoint(points: number, velocity: number) {
    if (points < MIN_WIDTH) return MIN_WIDTH;
    if (points > MAX_WIDTH) return MAX_WIDTH;
    if (velocity <= -FLING) return MIN_WIDTH;
    if (velocity >= FLING) return MAX_WIDTH;
    const nearest = DETENTS.reduce((best, detent) =>
      Math.abs(detent.width - points) < Math.abs(best.width - points) ? detent : best,
    );
    return Math.abs(nearest.width - points) <= DETENT_PULL ? nearest.width : points;
  }

  function onGripDown(event: ReactPointerEvent<HTMLDivElement>) {
    // preventDefault stops the drag selecting text, and it also stops the browser focusing
    // the grip, so the focus has to be taken explicitly or the arrow keys are unreachable
    // after a click.
    event.preventDefault();
    const grip = event.currentTarget;
    grip.focus();

    // Catch a settle already in flight rather than fighting it.
    settle.current?.stop();
    settle.current = null;

    // Capture the pointer for the whole drag. Without it, the first move that crosses over
    // the device hands the pointer to the iframe, whose document swallows it, and the drag
    // dies exactly when folding inward. Folding outward never crosses anything, which is
    // why only one direction appeared broken.
    try {
      grip.setPointerCapture(event.pointerId);
    } catch {
      // No capture available. The listeners below still work outside the frame.
    }

    onDragStateChange(true);
    const trail: { at: number; points: number }[] = [
      { at: performance.now(), points: foldSize },
    ];
    let latest = foldSize;
    let frame = 0;

    // One state update per frame. A pointermove can fire more often than the display
    // refreshes, and every extra one is a full re-render of the device and the page in it.
    const flush = () => {
      frame = 0;
      onFoldChange(foldForWidth(withResistance(latest)));
    };

    const move = (moveEvent: PointerEvent) => {
      latest = pointsFromPointer(moveEvent);
      trail.push({ at: performance.now(), points: latest });
      if (trail.length > 6) trail.shift();
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const up = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        flush();
      }
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      try {
        grip.releasePointerCapture(event.pointerId);
      } catch {
        // Already released with the pointer.
      }

      const from = withResistance(latest);
      const first = trail[0];
      const last = trail[trail.length - 1];
      const seconds = (last.at - first.at) / 1000;
      const velocity = seconds > 0.008 ? (last.points - first.points) / seconds : 0;
      const to = restingPoint(from, velocity);

      if (Math.abs(to - from) < 0.5) {
        onDragStateChange(false);
        return;
      }
      if (reducedMotion.current) {
        onFoldChange(foldForWidth(to));
        onDragStateChange(false);
        return;
      }
      settle.current = springTo({
        from,
        to,
        velocity,
        onFrame: (points) => onFoldChange(foldForWidth(points)),
        onDone: () => {
          settle.current = null;
          onDragStateChange(false);
        },
      });
    };

    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  function onGripKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const back = horizontal ? "ArrowLeft" : "ArrowUp";
    const forward = horizontal ? "ArrowRight" : "ArrowDown";
    const step = event.shiftKey ? 24 : 4;
    if (event.key === back) {
      event.preventDefault();
      onFoldChange(clamp(foldForWidth(foldSize - step), 0, 1));
    } else if (event.key === forward) {
      event.preventDefault();
      onFoldChange(clamp(foldForWidth(foldSize + step), 0, 1));
    } else if (event.key === "Home") {
      event.preventDefault();
      onFoldChange(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onFoldChange(1);
    }
  }

  const travel = (alongMax - alongMin) * zoom;

  /**
   * Everything measuring the device stands down while the device moves on its own.
   *
   * The dimension line, the ghost, the ruler and the grip describe one fold at one
   * orientation. A turn snaps all four to the other axis while the device is still
   * rotating, and a jump to a named stop leaves them reporting a fold the device is still
   * travelling to. In both cases there is no state for them to describe until it lands.
   * A drag is the exception and stays lit: there the numbers are the point.
   */
  const annotation = {
    opacity: quiet ? 0 : 1,
    transitionProperty: "opacity",
    transitionDuration: quiet ? "140ms" : "220ms",
    transitionDelay: quiet ? "0ms" : "60ms",
  } as const;

  // The gutters sit on the fold axis: the dimension line before the device, the ruler
  // after it. The cross axis needs none.
  const lead = LEAD_GUTTER;
  // The trailing gutter belongs to the travel ruler, which compact does not draw.
  const trail = compact ? 0 : TRAIL_GUTTER;
  const outer = horizontal
    ? { w: box.w * zoom, h: box.h * zoom + lead + trail }
    : { w: box.w * zoom + lead + trail, h: box.h * zoom };

  return (
    <div className="relative" style={{ width: outer.w, height: outer.h }}>
      <div
        ref={track}
        className="absolute"
        style={{
          width: box.w * zoom,
          height: box.h * zoom,
          top: horizontal ? lead : 0,
          left: horizontal ? 0 : lead,
        }}
      >
        {/* Dimension line, the way a width is called out on a drawing. */}
        <div
          className={cn(
            "absolute flex items-center justify-center",
            horizontal ? "-top-8 left-0 h-4" : "-left-9 top-0 w-4 flex-col",
          )}
          style={{
            [horizontal ? "width" : "height"]: along * zoom,
            ...motion,
            ...annotation,
            transitionProperty: `${horizontal ? "width" : "height"}, opacity`,
          }}
        >
          <span
            className={cn(
              "absolute bg-ink-faint",
              horizontal ? "inset-x-0 top-1/2 h-px" : "inset-y-0 left-1/2 w-px",
            )}
          />
          <span
            className={cn(
              "absolute bg-ink-faint",
              horizontal ? "left-0 h-3 w-px" : "top-0 h-px w-3",
            )}
          />
          <span
            className={cn(
              "absolute bg-ink-faint",
              horizontal ? "right-0 h-3 w-px" : "bottom-0 h-px w-3",
            )}
          />
          <span className="numeral relative bg-paper px-1.5 text-ink text-tick">
            {foldSize}
            <span className="text-ink-faint">pt</span>
          </span>
        </div>

        {/* Where the device reaches when fully open. Without this the stage is mostly
            empty grid at Cover, which is the state everyone sees first. Compact does not
            draw it: the stage holds only the current size there, so an outline of the
            unfolded device is both meaningless and wider than the box it sits in. */}
        {compact ? null : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 border border-rule-strong border-dashed transition-opacity duration-300"
            style={{
              width: (horizontal ? alongMax : DUO.unfolded.height + BEZEL) * zoom,
              height: (horizontal ? DUO.unfolded.height + BEZEL : alongMax) * zoom,
              borderRadius: DUO.shellRadius * zoom,
              ...annotation,
              opacity: quiet || fold > 0.97 ? 0 : 0.85,
            }}
          />
        )}

        {/* The device, pinned to the origin so the fold only ever moves one edge. */}
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* Turning is a rotation, because that is what turning is. The new dimensions are
              applied first and the device is placed back at the angle it came from, so one
              animation carries it round rather than a cut being hidden under a blur. */}
          <div
            className="origin-center"
            style={{
              transform: `rotate(${turnAngle}deg)`,
              transitionProperty: "transform",
              transitionDuration: turnAngle === 0 ? "var(--duration-turn)" : "0ms",
              transitionTimingFunction: "var(--ease-fold)",
            }}
          >
            <DeviceShell
              width={screen.w}
              height={screen.h}
              axis={axis}
              fold={fold}
              animate={animate}
            >
              {children}
            </DeviceShell>
          </div>
        </div>

        {/* The grip rides the edge the fold moves. Drag it, or focus it and use arrows. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Fold position"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={clamp(foldSize, MIN_WIDTH, MAX_WIDTH)}
          aria-valuetext={`${clamp(foldSize, MIN_WIDTH, MAX_WIDTH)} points`}
          aria-orientation={horizontal ? "horizontal" : "vertical"}
          onPointerDown={onGripDown}
          onKeyDown={onGripKey}
          className={cn(
            "focus-ring group absolute z-10 flex items-center justify-center rounded-full",
            // A 6px pill is not a hit target. The visible mark stays thin; the area that
            // takes the pointer is 44px, which is the minimum this bench itself checks
            // for. touch-action keeps the browser from claiming the drag axis as a scroll.
            horizontal
              ? "-translate-x-1/2 -translate-y-1/2 top-1/2 h-24 w-11 cursor-ew-resize touch-pan-y"
              : "-translate-x-1/2 -translate-y-1/2 left-1/2 h-11 w-24 cursor-ns-resize touch-pan-x",
          )}
          style={{
            [horizontal ? "left" : "top"]: along * zoom,
            ...motion,
            ...annotation,
            pointerEvents: turning ? "none" : undefined,
          }}
        >
          <span
            aria-hidden="true"
            className={cn(
              "rounded-full bg-crease motion-safe:transition-transform motion-safe:duration-150 motion-safe:can-hover:group-hover:scale-110 motion-safe:group-active:scale-105",
              horizontal ? "h-14 w-1.5" : "h-1.5 w-14",
            )}
          />
        </div>

        {/* A zero-size anchor on the grip. The hint hangs off it, so it tracks the grip
            on whichever axis the fold is moving. A slider role must not wrap content of
            its own, which is why this is a sibling. */}
        {compact ? null : (
          <div
            className="pointer-events-none absolute size-0"
            style={
              horizontal
                ? { left: along * zoom, top: "50%", ...motion }
                : { top: along * zoom, left: "50%", ...motion }
            }
          >
            <UnfoldHint axis={axis} visible={hint} />
          </div>
        )}

        {/* Travel of that edge, cover to unfolded, with the sweep painted into it. The
          ruler sits on the device's moving edge, so a mark on it is the position that
          edge would be at.

          It spans the whole travel, cover to unfolded, so it needs the room the compact
          stage does not hold open. There the named stops in the control strip say the same
          thing and the grip still drags. */}
        {compact ? null : (
          <div
            className={cn("absolute flex gap-1.5", horizontal ? "flex-col" : "flex-row")}
            style={{
              ...(horizontal
                ? { left: alongMin * zoom, width: travel, top: box.h * zoom + 16 }
                : { top: alongMin * zoom, height: travel, left: box.w * zoom + 16 }),
              ...annotation,
            }}
          >
            <div
              className={cn(
                "relative overflow-hidden rounded-full bg-surface-sunk ring-1 ring-rule ring-inset",
                horizontal ? "h-1.5 w-full" : "h-full w-1.5",
              )}
            >
              {sweep?.map((step, index) => (
                <span
                  key={step.width}
                  className={cn("absolute", step.overflowBy > 1 ? "bg-fail" : "bg-pass")}
                  style={
                    horizontal
                      ? {
                          left: `${(index / sweep.length) * 100}%`,
                          width: `${100 / sweep.length}%`,
                          top: 0,
                          bottom: 0,
                        }
                      : {
                          top: `${(index / sweep.length) * 100}%`,
                          height: `${100 / sweep.length}%`,
                          left: 0,
                          right: 0,
                        }
                  }
                />
              ))}
              {sweeping ? (
                <span className="absolute inset-0 animate-pulse bg-crease-soft" />
              ) : null}
            </div>

            {/* Detent labels run along the ruler, so the container has to span the ruler's
            length on the fold axis. A fixed-height row collapses all three onto one spot
            when the fold runs vertically. */}
            <div className={cn("relative", horizontal ? "h-3 w-full" : "h-full w-8")}>
              {DETENTS.map((detent) => {
                const at = ((detent.width - MIN_WIDTH) / (MAX_WIDTH - MIN_WIDTH)) * 100;
                const near = Math.abs(detent.width - foldSize) < 6;
                const edge = at === 0 ? "start" : at === 100 ? "end" : "middle";
                return (
                  <span
                    key={detent.id}
                    className={cn(
                      "numeral absolute text-tick transition-colors duration-150",
                      near ? "text-ink" : "text-ink-faint",
                    )}
                    style={
                      horizontal
                        ? {
                            left: `${at}%`,
                            transform:
                              edge === "start"
                                ? "translateX(0)"
                                : edge === "end"
                                  ? "translateX(-100%)"
                                  : "translateX(-50%)",
                          }
                        : {
                            top: `${at}%`,
                            left: 0,
                            transform:
                              edge === "start"
                                ? "translateY(-0.15em)"
                                : edge === "end"
                                  ? "translateY(-0.85em)"
                                  : "translateY(-0.5em)",
                          }
                    }
                  >
                    {detent.width}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
