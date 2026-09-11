import { DEMO_HTML } from "@/lib/demo-page";

export const dynamic = "force-static";

/**
 * The page the bench opens on, served from this app so it loads instantly and is
 * guaranteed to reflow inside the fold range. A route handler rather than a file in
 * `public/`, so the address is `/__demo` rather than `/__demo/index.html`, and a
 * route rather than a page, so it carries none of the bench's own fonts or CSS.
 */
export function GET(): Response {
  return new Response(DEMO_HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
