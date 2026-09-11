import { assertPublicTarget } from "./net-guard";

/**
 * Fetching a redirect chain, checking every hop.
 *
 * `redirect: "follow"` checks only the address that was typed. A public hostname that
 * answers 302 with a `Location` of `http://169.254.169.254/` is then followed by `fetch`
 * with nothing looking at it, which walks straight past the private-address guard and
 * reaches the network the server sits in. The guard has to run again on every hop, so the
 * hops are taken here rather than by `fetch`.
 */
const MAX_REDIRECTS = 5;

/**
 * 8MB. A document past this is not a page under test, it is a download, and reading it
 * into a string is how one request takes the whole function down.
 */
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

export class TargetError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface FetchTargetOptions {
  selfOrigin?: string;
  timeoutMs: number;
  headers: Record<string, string>;
}

export interface TargetResponse {
  response: Response;
  /** Where the chain actually ended, which is what relative URLs resolve against. */
  url: string;
}

export async function fetchTarget(
  start: URL,
  { selfOrigin, timeoutMs, headers }: FetchTargetOptions,
): Promise<TargetResponse> {
  // One deadline for the whole chain. A per-hop timeout lets six redirects hold the
  // function open for six times as long as the number the error message promises.
  const deadline = AbortSignal.timeout(timeoutMs);
  let url = start;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicTarget(url, selfOrigin);

    let response: Response;
    try {
      response = await fetch(url, { redirect: "manual", signal: deadline, headers });
    } catch (error) {
      const name = (error as Error).name;
      throw new TargetError(
        name === "TimeoutError" || name === "AbortError"
          ? `The site took longer than ${Math.round(timeoutMs / 1000)} seconds to answer.`
          : "The site could not be reached.",
        502,
      );
    }

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new TargetError("The site redirected to an address that is not a URL.", 502);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new TargetError("The site redirected to an unsupported scheme.", 403);
      }
      url = next;
      continue;
    }

    return { response, url: url.toString() };
  }

  throw new TargetError("The site redirected more than five times.", 502);
}

/**
 * Read a response as text, giving up rather than buffering something enormous.
 * `Response.text()` has no ceiling, so the cap has to be counted off the stream.
 */
export async function readCappedText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new TargetError("The page is larger than 8MB.", 413);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let text = "";
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new TargetError("The page is larger than 8MB.", 413);
    }
    // Streaming decode, so a multi-byte character split across two chunks survives.
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
