/**
 * The page the bench opens on.
 *
 * There is no marketing surface: the product explains itself faster than a paragraph
 * about it does, so a cold visitor lands on a real device with a real page in it. This
 * one is local, so it is instant and it is guaranteed to reflow inside the fold range,
 * which is the thing worth showing.
 */
export const DEMO_PATH = "/demo";

export function demoUrl(origin: string): string {
  return new URL(DEMO_PATH, origin).toString();
}

/** True when a tested address is the local page the bench opens on. */
export function isDemoUrl(tested: string, origin: string): boolean {
  try {
    const url = new URL(tested);
    return url.origin === origin && url.pathname === DEMO_PATH;
  } catch {
    return false;
  }
}

/**
 * The bench's own address for a site under test.
 *
 * The browser's address bar is the share button every browser already has, so it has to
 * name what is on screen. The demo is the exception: it is what a cold visitor gets, so it
 * lives at the root and does not want a query string pointing back at this deployment.
 */
export function benchPath(tested: string, origin: string): string {
  if (isDemoUrl(tested, origin)) return "/";
  return `/preview?url=${encodeURIComponent(tested)}`;
}
