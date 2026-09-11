import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge cannot see the project's theme, so `text-tick` and `text-ink` both look
 * like `text-*` to it and the later one silently deletes the earlier. Registering the two
 * scales is what keeps a size and a colour from cancelling each other out.
 */
const FONT_SIZES = ["tick", "micro", "label", "body", "lede", "title", "section", "hero"];
const COLORS = [
  "paper",
  "surface",
  "surface-sunk",
  "hover",
  "ink",
  "ink-muted",
  "ink-faint",
  "ink-inverse",
  "rule",
  "rule-strong",
  "crease",
  "crease-soft",
  "pass",
  "pass-soft",
  "warn",
  "warn-soft",
  "fail",
  "fail-soft",
  "shell",
  "shell-edge",
  "screen",
  "screen-ghost",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FONT_SIZES }],
      "text-color": [{ text: COLORS }],
      "bg-color": [{ bg: COLORS }],
      "border-color": [{ border: COLORS }],
      "ring-color": [{ ring: COLORS }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
