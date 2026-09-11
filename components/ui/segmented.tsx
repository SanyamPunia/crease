"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  hint?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}

/**
 * A pill track with one indicator that slides between options.
 *
 * The indicator is a single element that moves, rather than a background toggled on each
 * button. That is what makes the change read as one object moving instead of two things
 * blinking, and it is why the control feels like a physical switch.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedProps<T>) {
  const track = useRef<HTMLFieldSetElement | null>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // No option selected is a real state here: the fold sits between two named stops. The
  // indicator has to leave with the selection, or it strands a black pill under a label
  // that has already gone muted.
  const selected = options.some((option) => option.value === value);

  // Measured after paint, so the indicator is never a frame behind the label it sits under.
  // biome-ignore lint/correctness/useExhaustiveDependencies: value is the trigger; the DOM is read imperatively.
  useLayoutEffect(() => {
    const root = track.current;
    if (!root) return;
    const active = root.querySelector<HTMLButtonElement>('[data-active="true"]');
    if (!active) return;
    setPill({ left: active.offsetLeft, width: active.offsetWidth });
  }, [value]);

  useEffect(() => {
    const root = track.current;
    if (!root) return;
    const observer = new ResizeObserver(() => {
      const active = root.querySelector<HTMLButtonElement>('[data-active="true"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  return (
    <fieldset
      ref={track}
      aria-label={label}
      className={cn(
        "hairline relative inline-flex h-8 items-center rounded-full bg-surface p-1",
        className,
      )}
    >
      {pill ? (
        <span
          aria-hidden="true"
          className={cn(
            // transform and opacity only. Segments are equal width, so the indicator is a
            // pure translate and its own width never animates.
            "absolute top-1 bottom-1 left-0 rounded-full bg-ink transition-[opacity] duration-200 motion-safe:transition-[transform,opacity] motion-safe:duration-250 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
            selected ? "opacity-100" : "opacity-0",
          )}
          style={{ width: pill.width, transform: `translateX(${pill.left}px)` }}
        />
      ) : null}

      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            data-active={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              "focus-ring relative flex h-full flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 font-medium text-micro transition-colors duration-200",
              active && selected
                ? "text-ink-inverse"
                : "text-ink-muted can-hover:hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}
