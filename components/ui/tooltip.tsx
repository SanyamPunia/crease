"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={220} skipDelayDuration={300}>
      {children}
    </T.Provider>
  );
}

interface TooltipProps {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export function Tooltip({ label, children, side = "bottom" }: TooltipProps) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className="z-50 rounded-sm border border-rule bg-surface px-2 py-1 text-ink text-micro shadow-sm"
        >
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
