"use client";

import { useEffect, useState } from "react";

/**
 * A media query as React state.
 *
 * Needed where a stylesheet cannot reach: the stage's scale is arithmetic done in the
 * workspace, not a class, so the layout has to know the answer rather than react to it.
 * Starts false and settles after mount, which matches the server render.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const sync = () => setMatches(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [query]);

  return matches;
}
