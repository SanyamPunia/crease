import { fetchTarget, readCappedText, TargetError } from "@/lib/fetch-target";
import { appOrigin } from "@/lib/origin";
import { extractTitle, extractViewportMeta, framingBlocks } from "@/lib/proxy";
import { MOBILE_USER_AGENT, normalizeInput } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export interface InspectResult {
  url: string;
  status: number;
  title: string | null;
  viewportMetaRaw: string | null;
  framing: string[];
  server: string | null;
  html: boolean;
}

export async function GET(request: Request): Promise<Response> {
  const raw = new URL(request.url).searchParams.get("u") ?? "";
  const normalized = normalizeInput(raw);
  if ("error" in normalized) {
    return Response.json({ error: normalized.error }, { status: 400 });
  }

  const parsed = new URL(normalized.url);
  let upstream: Response;
  let finalUrl: string;
  try {
    const result = await fetchTarget(parsed, {
      selfOrigin: appOrigin(request),
      timeoutMs: 15_000,
      headers: {
        "user-agent": MOBILE_USER_AGENT,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    upstream = result.response;
    finalUrl = result.url;
  } catch (error) {
    const status = error instanceof TargetError ? error.status : 403;
    return Response.json({ error: (error as Error).message }, { status });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");
  let body = "";
  if (isHtml) {
    try {
      body = await readCappedText(upstream);
    } catch (error) {
      const status = error instanceof TargetError ? error.status : 502;
      return Response.json({ error: (error as Error).message }, { status });
    }
  } else {
    await upstream.body?.cancel();
  }

  const result: InspectResult = {
    url: finalUrl,
    status: upstream.status,
    title: isHtml ? extractTitle(body) : null,
    viewportMetaRaw: isHtml ? extractViewportMeta(body) : null,
    framing: framingBlocks(upstream.headers),
    server: upstream.headers.get("server"),
    html: isHtml,
  };
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
