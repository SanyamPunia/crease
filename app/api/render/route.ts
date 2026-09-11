import { fetchTarget, readCappedText, TargetError } from "@/lib/fetch-target";
import { appOrigin } from "@/lib/origin";
import { framingBlocks, rewriteCss, rewriteHtml } from "@/lib/proxy";
import { MOBILE_USER_AGENT } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TIMEOUT_MS = 20_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorPage(title: string, detail: string, status: number): Response {
  // The address is echoed back into this page, and the address came from a query string.
  const body = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{height:100%;margin:0}
    body{display:grid;place-items:center;padding:32px;background:#fff;color:#15181b;
      font:14px/1.5 ui-sans-serif,system-ui,sans-serif;text-align:center}
    strong{display:block;font-size:15px;margin-bottom:6px}
    p{margin:0;max-width:34ch;color:#5b6166}
  </style></head><body><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div></body></html>`;
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

  const origin = appOrigin(request);
  let upstream: Response;
  let finalUrl: string;
  try {
    const result = await fetchTarget(parsed, {
      selfOrigin: origin,
      timeoutMs: TIMEOUT_MS,
      headers: {
        "user-agent": MOBILE_USER_AGENT,
        accept: request.headers.get("accept") ?? "*/*",
        "accept-language": "en-US,en;q=0.9",
        referer: `${parsed.origin}/`,
      },
    });
    upstream = result.response;
    finalUrl = result.url;
  } catch (error) {
    const message = (error as Error).message;
    if (error instanceof TargetError) {
      return errorPage(error.status === 502 ? "No response" : "Blocked", message, error.status);
    }
    const unresolved = message.includes("does not resolve");
    return errorPage(unresolved ? "No such site" : "Blocked", message, unresolved ? 404 : 403);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const headers = new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "x-duo-final-url": finalUrl,
  });
  const framing = framingBlocks(upstream.headers);
  if (framing.length > 0) headers.set("x-duo-framing", framing.join("; "));

  try {
    if (contentType.includes("text/html")) {
      const html = await readCappedText(upstream);
      headers.set("content-type", "text/html; charset=utf-8");
      return new Response(rewriteHtml(html, finalUrl, origin), {
        status: upstream.status,
        headers,
      });
    }

    if (contentType.includes("text/css")) {
      const css = await readCappedText(upstream);
      headers.set("content-type", "text/css; charset=utf-8");
      return new Response(rewriteCss(css, finalUrl, origin), {
        status: upstream.status,
        headers,
      });
    }
  } catch (error) {
    if (error instanceof TargetError)
      return errorPage("Too large", error.message, error.status);
    throw error;
  }

  // Everything else streams straight through, so nothing is held in memory here.
  return new Response(upstream.body, { status: upstream.status, headers });
}
