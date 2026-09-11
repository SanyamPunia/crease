import { assertPublicTarget } from "@/lib/net-guard";
import { appOrigin } from "@/lib/origin";
import { framingBlocks, rewriteCss, rewriteHtml } from "@/lib/proxy";
import { MOBILE_USER_AGENT } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 20_000;

function errorPage(title: string, detail: string, status: number): Response {
  const body = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0}
    body{display:grid;place-items:center;padding:32px;background:#fff;color:#15181b;
      font:14px/1.5 ui-sans-serif,system-ui,sans-serif;text-align:center}
    strong{display:block;font-size:15px;margin-bottom:6px}
    p{margin:0;max-width:34ch;color:#5b6166}
  </style></head><body><div><strong>${title}</strong><p>${detail}</p></div></body></html>`;
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const target = new URL(request.url).searchParams.get("u");
  if (!target) return errorPage("Nothing to load", "No address was passed to the proxy.", 400);

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return errorPage("Bad address", `${target} is not a URL.`, 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return errorPage("Unsupported scheme", "Only http and https can be loaded.", 400);
  }

  try {
    await assertPublicTarget(parsed, appOrigin(request));
  } catch (error) {
    const message = (error as Error).message;
    const unresolved = message.includes("does not resolve");
    return errorPage(unresolved ? "No such site" : "Blocked", message, unresolved ? 404 : 403);
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "user-agent": MOBILE_USER_AGENT,
        accept: request.headers.get("accept") ?? "*/*",
        "accept-language": "en-US,en;q=0.9",
        referer: `${parsed.origin}/`,
      },
    });
  } catch (error) {
    const message =
      (error as Error).name === "TimeoutError"
        ? "The site took longer than 20 seconds to answer."
        : "The site could not be reached.";
    return errorPage("No response", message, 502);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "x-duo-final-url": upstream.url || parsed.toString(),
  });
  const framing = framingBlocks(upstream.headers);
  if (framing.length > 0) headers.set("x-duo-framing", framing.join("; "));

  if (contentType.includes("text/html")) {
    const html = await upstream.text();
    const rewritten = rewriteHtml(html, upstream.url || parsed.toString(), appOrigin(request));
    headers.set("content-type", "text/html; charset=utf-8");
    return new Response(rewritten, { status: upstream.status, headers });
  }

  if (contentType.includes("text/css")) {
    const css = await upstream.text();
    headers.set("content-type", "text/css; charset=utf-8");
    return new Response(
      rewriteCss(css, upstream.url || parsed.toString(), appOrigin(request)),
      {
        status: upstream.status,
        headers,
      },
    );
  }

  return new Response(upstream.body, { status: upstream.status, headers });
}
