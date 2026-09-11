import { appOrigin } from "@/lib/origin";
import { unproxy } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Catch a request that resolved against the proxy's own path instead of the site's.
 *
 * A module's relative imports resolve against that module's URL, and through here that URL
 * is `/api/render?u=...`. So `import "./chunk.js"` inside a proxied bundle asks for
 * `/api/chunk.js`, which is nothing, and a code-split site loses chunks with no clue why.
 * The `<base>` cannot help: it applies to the document, not to module resolution.
 *
 * The referer is the importing module's own proxy URL, and it carries the address it was
 * fetched from. Resolving the stray path against that recovers the URL the site meant, and
 * a redirect hands the loader back a proper proxy address, so the chunk's own imports
 * resolve the same way one hop later.
 */
export function GET(request: Request): Response {
  const referer = request.headers.get("referer");
  if (!referer) return new Response("Not found", { status: 404 });

  const origin = appOrigin(request);
  const source = unproxy(referer, origin);
  if (!source) return new Response("Not found", { status: 404 });

  const here = new URL(request.url);
  let resolved: URL;
  try {
    // The stray path is relative to the proxy route, so drop that prefix before resolving.
    resolved = new URL(here.pathname.replace(/^\/api\//, "") + here.search, source);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return new Response("Not found", { status: 404 });
  }

  return Response.redirect(
    `${origin}/api/render?u=${encodeURIComponent(resolved.toString())}`,
    307,
  );
}
