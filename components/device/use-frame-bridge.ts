"use client";

import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { Measurement } from "@/lib/audit";

type Outbound =
  | { type: "measure" }
  | { type: "highlight"; refs: number[]; tone: "fail" | "warn" }
  | { type: "reveal"; ref: number; tone: "fail" | "warn" }
  | { type: "scrollTop" };

interface Handlers {
  onReady?: (url: string) => void;
  onMeasurement?: (measurement: Measurement) => void;
  /** A new document is loading in the frame. */
  onNavigate?: (url: string) => void;
  /** The page changed its own address without loading anything. */
  onLocationChange?: (url: string) => void;
}

/**
 * Talks to the proxied page.
 *
 * Everything crosses as a message rather than a direct DOM call, so the bench keeps
 * working if a page ever ends up in a frame it does not share an origin with.
 */
export function useFrameBridge(frame: RefObject<HTMLIFrameElement | null>, handlers: Handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (data?.duo !== true) return;
      if (data.type === "ready") latest.current.onReady?.(data.url);
      else if (data.type === "measurement") latest.current.onMeasurement?.(data.data);
      else if (data.type === "navigate") latest.current.onNavigate?.(data.url);
      else if (data.type === "locationchange") latest.current.onLocationChange?.(data.url);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return useCallback(
    (message: Outbound) => {
      frame.current?.contentWindow?.postMessage({ duo: true, ...message }, "*");
    },
    [frame],
  );
}
