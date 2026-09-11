import { probeSource } from "./probe";

/** Read one attribute out of a raw tag string. */
function attr(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"),
  );
  if (!match) return null;
  return match[2] ?? match[3] ?? match[4] ?? null;
}

function setAttr(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s"'>]+)`, "i");
  const encoded = `${name}="${value.replace(/"/g, "&quot;")}"`;
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

  out = out.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = (attr(tag, "rel") ?? "").toLowerCase();
    if (!rel.split(/\s+/).includes("stylesheet")) return tag;
    const href = attr(tag, "href");
    if (!href) return tag;
    const proxied = toProxy(href, finalUrl, appOrigin);
    if (!proxied) return tag;
    return dropAttr(dropAttr(setAttr(tag, "href", proxied), "integrity"), "crossorigin");
  });

  // Module scripts are fetched with CORS, so they have to come through the proxy too.
  out = out.replace(/<script\b[^>]*>/gi, (tag) => {
    const type = (attr(tag, "type") ?? "").toLowerCase();
    if (type !== "module") return tag;
    const src = attr(tag, "src");
    if (!src) return tag;
    const proxied = toProxy(src, finalUrl, appOrigin);
    if (!proxied) return tag;
    return dropAttr(dropAttr(setAttr(tag, "src", proxied), "integrity"), "crossorigin");
  });

  const head = [
    `<base href="${finalUrl.replace(/"/g, "&quot;")}">`,
    `<script>${probeSource(appOrigin)}</script>`,
  ].join("");

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
