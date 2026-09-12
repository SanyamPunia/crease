"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-ink-inverse hover:bg-ink/90",
  secondary: "hairline bg-surface text-ink hover:bg-hover",
  ghost: "bg-transparent text-ink-muted hover:bg-hover hover:text-ink",
};

const SIZE: Record<Size, string> = {
  xs: "h-8 coarse:h-11 px-3 coarse:px-4 text-micro gap-1.5",
  sm: "h-9 coarse:h-11 px-3.5 coarse:px-4 text-label gap-1.5",
  md: "h-10 coarse:h-11 px-4 text-label gap-2",
  lg: "h-12 px-6 text-body gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** Pill-shaped, elevated rather than outlined. Radius is not a size-dependent choice. */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full font-medium transition-[background-color,color,box-shadow,transform] duration-150 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

const ICON_SIZE: Record<Size, string> = {
  xs: "size-8 coarse:size-11",
  sm: "size-9 coarse:size-11",
  md: "size-10 coarse:size-11",
  lg: "size-12",
};

const ICON_BASE =
  "focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink motion-safe:active:scale-[0.97] aria-expanded:bg-hover aria-expanded:text-ink";

export function IconButton({
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        ICON_BASE,
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        ICON_SIZE[size],
        className,
      )}
      {...props}
    />
  );
}

export function IconLink({
  size = "md",
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { size?: Size }) {
  return <a className={cn(ICON_BASE, ICON_SIZE[size], className)} {...props} />;
}
