/** Turn whatever the user typed into a URL, or explain why it cannot be one. */
export function normalizeInput(input: string): { url: string } | { error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { error: "Enter a URL to test." };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { error: `"${trimmed}" is not a URL.` };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "Only http and https addresses can be loaded." };
  }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") {
    return { error: `"${parsed.hostname}" has no domain suffix.` };
  }
  return { url: parsed.toString() };
}

export const MOBILE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1";

export function proxyPath(target: string): string {
  return `/api/render?u=${encodeURIComponent(target)}`;
}

/** A short, readable form of a URL for chrome and labels. */
export function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const path = url.pathname === "/" ? "" : url.pathname;
    return `${url.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return raw;
  }
}

/**
 * Read the address a proxy URL stands for, or null when it is not one.
 *
 * The probe carries its own copy of this, because it has to run inside a page that has no
 * modules. Keep the two in step.
 */
export function unproxy(value: string, appOrigin: string): string | null {
  try {
    const url = new URL(value, appOrigin);
    if (url.origin !== new URL(appOrigin).origin) return null;
    if (url.pathname !== "/api/render") return null;
    return url.searchParams.get("u");
  } catch {
    return null;
  }
}
