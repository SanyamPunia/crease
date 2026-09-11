"use client";

import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3.5 text-micro placeholder:text-micro",
  md: "h-10 px-4 text-label placeholder:text-label",
  lg: "h-12 px-5 text-body placeholder:text-body",
};

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  inputSize?: Size;
}

/** An address is data, so this is the one control that stays monospaced. */
export function Input({ inputSize = "md", className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "hairline focus-ring w-full min-w-0 rounded-full bg-surface font-mono text-ink transition-[box-shadow,background-color] duration-200 placeholder:text-ink-faint disabled:cursor-not-allowed disabled:opacity-50",
        SIZE[inputSize],
        className,
      )}
      {...props}
    />
  );
}
