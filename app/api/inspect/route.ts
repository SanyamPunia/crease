import { assertPublicTarget } from "@/lib/net-guard";
import { appOrigin } from "@/lib/origin";
import { extractTitle, extractViewportMeta, framingBlocks } from "@/lib/proxy";
import { MOBILE_USER_AGENT, normalizeInput } from "@/lib/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    await assertPublicTarget(parsed, appOrigin(request));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 403 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(parsed, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "user-agent": MOBILE_USER_AGENT,
        accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
  } catch (error) {
    const timedOut = (error as Error).name === "TimeoutError";
    return Response.json(
      {
        error: timedOut
          ? "The site did not answer within 15 seconds."
          : `${parsed.hostname} could not be reached.`,
      },
      { status: 502 },
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html");
  const body = isHtml ? await upstream.text() : "";

  const result: InspectResult = {
    url: upstream.url || parsed.toString(),
    status: upstream.status,
    title: isHtml ? extractTitle(body) : null,
    viewportMetaRaw: isHtml ? extractViewportMeta(body) : null,
    framing: framingBlocks(upstream.headers),
    server: upstream.headers.get("server"),
    html: isHtml,
  };
  return Response.json(result, { headers: { "cache-control": "no-store" } });
}
