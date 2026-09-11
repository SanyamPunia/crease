import { probeSource } from "./probe";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: "\u00a0",
};

/**
 * An attribute value is entity-encoded, and a URL is parsed from the decoded form.
 *
 * `&` is written `&amp;` in HTML, so a srcset of `?url=x&amp;w=48` parses as a parameter
 * literally named `amp;w` if it is read raw. The rewritten URL then reaches the target
 * missing every parameter after the first, and an image optimiser answers 400.
 */
function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, name: string) => {
    const key = name.toLowerCase();
    if (key.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(key.slice(2), 16)) || whole;
    }
    if (key.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(key.slice(1), 10)) || whole;
    }
    return ENTITIES[key] ?? whole;
  });
}

/** Read one attribute out of a raw tag string. */
function attr(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"),
  );
  if (!match) return null;
  const raw = match[2] ?? match[3] ?? match[4];
  return raw === undefined ? null : decodeEntities(raw);
}

function setAttr(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s"'>]+)`, "i");
  const encoded = `${name}="${value.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
  if (pattern.test(tag)) return tag.replace(pattern, encoded);
  return tag.replace(/\s*\/?>$/, (end) => ` ${encoded}${end}`);
}

function dropAttr(tag: string, name: string): string {
  return tag.replace(
    new RegExp(`\\s\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s"'>]+)`, "gi"),
    "",
  );
}

/**
 * Point a URL at the proxy, absolutely.
 *
 * The absolute form is load-bearing. The rewritten document carries a `<base>` of the
 * target site, so a root-relative `/api/render?u=...` would resolve against the target's
 * origin and 404 there. Every rewritten URL has to name this app's origin outright.
 */
function toProxy(value: string, base: string, appOrigin: string): string | null {
  try {
    const resolved = new URL(value, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return `${appOrigin}/api/render?u=${encodeURIComponent(resolved.toString())}`;
  } catch {
    return null;
  }
}

/**
 * Rewrite a `srcset`, which is a comma-separated list of `url descriptor` pairs.
 *
 * A URL in a srcset may itself contain a comma (`/_next/image?url=a,b`), so the split has
 * to be on a comma that a descriptor follows, not on every comma.
 */
function rewriteSrcset(value: string, base: string, appOrigin: string): string {
  return value
    .split(/\s*,\s*(?=[^\s,]+(?:\s+[\d.]+[wx])?\s*(?:,|$))/)
    .map((candidate) => {
      const match = candidate.trim().match(/^(\S+)(\s+.*)?$/);
      if (!match) return candidate;
      const proxied = toProxy(match[1], base, appOrigin);
      return proxied ? `${proxied}${match[2] ?? ""}` : candidate;
    })
    .join(", ");
}

/**
 * Rewrite a stylesheet so it keeps working from this origin.
 *
 * Stylesheets are pulled through the proxy on purpose. A cross-origin sheet throws on
 * `cssRules`, and reading the real media queries is the only way to answer the question
 * this tool exists for: does anything actually change between the two displays.
 */
export function rewriteCss(css: string, sheetUrl: string, appOrigin: string): string {
  return css
    .replace(/@import\s+(?:url\()?\s*(["']?)([^"')]+)\1\s*\)?/gi, (whole, _quote, href) => {
      const proxied = toProxy(href.trim(), sheetUrl, appOrigin);
      return proxied ? `@import url("${proxied}")` : whole;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (whole, _quote, href) => {
      const value = href.trim();
      if (value.startsWith("data:") || value.startsWith("#")) return whole;
      const proxied = toProxy(value, sheetUrl, appOrigin);
      return proxied ? `url("${proxied}")` : whole;
    });
}

const CSP_META = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi;
const EXISTING_BASE = /<base\b[^>]*>/gi;

/**
 * Rewrite a document so it renders from this origin, same-origin with the workspace.
 *
 * Same-origin is the point. It is what lets the probe read stylesheets, what lets the
 * parent address elements inside the page, and what makes the whole measurement real
 * rather than a screenshot.
 */
export function rewriteHtml(html: string, finalUrl: string, appOrigin: string): string {
  let out = html.replace(CSP_META, "").replace(EXISTING_BASE, "");

  /**
   * Everything in `<head>` that fetches is rewritten, rather than left to the `<base>`.
   *
   * The base is injected at the end of `<head>`, so the browser has already parsed and
   * started fetching every stylesheet, script and preload above it with no base in effect.
   * Those resolve against this app's origin and 404. The base cannot move to the top of
   * `<head>` either: that shifts every node React expects and breaks hydration. So the
   * head's own URLs are made absolute here, and the base is left to serve what the page
   * resolves later, at runtime.
   */
  const FETCHING_RELS = new Set([
    "stylesheet",
    "preload",
    "modulepreload",
    "prefetch",
    "icon",
    "shortcut",
    "apple-touch-icon",
    "manifest",
  ]);

  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!rel.split(/\s+/).some((value) => FETCHING_RELS.has(value))) return tag;
    let next = tag;
    const href = attr(tag, "href");
    if (href) {
      const proxied = toProxy(href, finalUrl, appOrigin);
      if (proxied) next = setAttr(next, "href", proxied);
    }
    // An image preload carries its candidates in imagesrcset and often has no href at all.
    const imageSrcset = attr(next, "imagesrcset");
    if (imageSrcset) {
      next = setAttr(next, "imagesrcset", rewriteSrcset(imageSrcset, finalUrl, appOrigin));
    }
    if (next === tag) return tag;
    return dropAttr(next, "integrity");
  });

  // A preload and the element that consumes it have to agree on the URL, or the browser
  // downloads the image twice and warns that the preload went unused.
  out = out.replace(/<(img|source)\b[^>]*>/gi, (tag) => {
    let next = tag;
    const src = attr(tag, "src");
    if (src) {
      const proxied = toProxy(src, finalUrl, appOrigin);
      if (proxied) next = setAttr(next, "src", proxied);
    }
    const srcset = attr(next, "srcset");
    if (srcset) next = setAttr(next, "srcset", rewriteSrcset(srcset, finalUrl, appOrigin));
    return next;
  });

  out = out.replace(/<script\b[^>]*>/gi, (tag) => {
    const src = attr(tag, "src");
    if (!src) return tag;
    const proxied = toProxy(src, finalUrl, appOrigin);
    if (!proxied) return tag;
    return dropAttr(setAttr(tag, "src", proxied), "integrity");
  });

  // A url() inside an inline <style> resolves the same way, and a font declared in the
  // head is requested before the base exists.
  out = out.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (whole, open, css, close) => {
    if (/\btype\s*=\s*["']?(?!text\/css)/i.test(open)) return whole;
    return `${open}${rewriteCss(css, finalUrl, appOrigin)}${close}`;
  });

  const head = [
    `<base href="${finalUrl.replace(/"/g, "&quot;")}">`,
    `<script>${probeSource(appOrigin, finalUrl)}</script>`,
  ].join("");

  /**
   * The injection goes at the END of `<head>`, not the start.
   *
   * React hydrates a document by walking the head's children against the ones it expects.
   * Two extra nodes pushed in front of the first `<meta>` shift every one of them, so
   * hydration fails, React discards the server HTML and re-renders the whole document,
   * and everything in `<head>` it does not own is thrown away, including the `<base>` the
   * page's own URLs depend on. It also means the page under test is no longer the page
   * the site ships, which is disqualifying for a tool that exists to measure it.
   */
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, (tag) => `${head}${tag}`);
  }
  if (/<head[^>]*>/i.test(out)) {
    return out.replace(/<head[^>]*>/i, (tag) => `${tag}${head}`);
  }
  if (/<html[^>]*>/i.test(out)) {
    return out.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${head}</head>`);
  }
  return `${head}${out}`;
}

/** Response headers that would stop the page rendering inside a frame. */
export const FRAMING_HEADERS = [
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
] as const;

/** Read the framing posture of a response, so the workspace can say what it worked around. */
export function framingBlocks(headers: Headers): string[] {
  const blocks: string[] = [];
  const xfo = headers.get("x-frame-options");
  if (xfo) blocks.push(`X-Frame-Options: ${xfo}`);
  const csp = headers.get("content-security-policy");
  if (csp) {
    const ancestors = csp.match(/frame-ancestors\s+([^;]+)/i);
    if (ancestors) blocks.push(`frame-ancestors ${ancestors[1].trim()}`);
  }
  return blocks;
}

export function extractViewportMeta(html: string): string | null {
  const tag = html.match(/<meta\b[^>]*name\s*=\s*["']?viewport["']?[^>]*>/i);
  if (!tag) return null;
  return attr(tag[0], "content");
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim() || null;
}
