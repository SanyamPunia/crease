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
