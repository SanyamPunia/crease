import { DUO, parseViewportMeta, type ViewportMeta } from "./device";

export interface ElementSample {
  ref: number;
  label: string;
  width: number;
  overhang: number;
}

export interface TargetSample {
  ref: number;
  label: string;
  width: number;
  height: number;
}

/** What the probe reports back. Raw numbers only, no judgement. */
export interface Measurement {
  href: string;
  title: string;
  layoutWidth: number;
  scrollWidth: number;
  clientWidth: number;
  documentHeight: number;
  viewportMetaRaw: string | null;
  overflow: ElementSample[];
  overflowTotal: number;
  targets: TargetSample[];
  targetsTotal: number;
  smallTextCount: number;
  breakpoints: number[];
  unreadableSheets: number;
  wideImages: ElementSample[];
  elementCount: number;
  truncated: boolean;
  tookMs: number;
}

export type Severity = "pass" | "warn" | "fail";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  elements?: ElementSample[];
  targets?: TargetSample[];
}

export interface SweepStep {
  width: number;
  overflowBy: number;
}

const SEVERITY_RANK: Record<Severity, number> = { pass: 0, warn: 1, fail: 2 };

export function worstSeverity(findings: Finding[]): Severity {
  return findings.reduce<Severity>(
    (worst, finding) =>
      SEVERITY_RANK[finding.severity] > SEVERITY_RANK[worst] ? finding.severity : worst,
    "pass",
  );
}

export const VERDICT_COPY: Record<Severity, { label: string; line: string }> = {
  pass: { label: "Fits the fold", line: "Nothing breaks across the fold range." },
  warn: {
    label: "Fits with issues",
    line: "It holds together, but some checks need attention.",
  },
  fail: { label: "Breaks on the Duo", line: "At least one check fails on this device." },
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

function viewportFinding(meta: ViewportMeta | null): Finding {
  if (!meta) {
    return {
      id: "viewport",
      severity: "fail",
      title: "No viewport meta tag",
      detail:
        "Safari falls back to a 980px layout and zooms the whole page out to fit the screen. Add width=device-width, initial-scale=1.",
    };
  }
  if (typeof meta.width === "number") {
    return {
      id: "viewport",
      severity: "fail",
      title: `Viewport is pinned to ${meta.width}px`,
      detail:
        "A fixed layout width cannot respond to the fold. The page renders at one size and scales down on both displays.",
    };
  }
  const locked = meta.userScalable === false;
  const capped = meta.maximumScale !== null && meta.maximumScale < 2;
  if (locked || capped) {
    return {
      id: "viewport",
      severity: "warn",
      title: "Zoom is restricted",
      detail: locked
        ? "user-scalable=no blocks pinch zoom. Remove it, iOS ignores it in Safari and it still fails an accessibility audit."
        : `maximum-scale=${meta.maximumScale} stops users zooming to 200%.`,
    };
  }
  return {
    id: "viewport",
    severity: "pass",
    title: "Viewport tracks the display",
    detail: "width=device-width, so the layout width follows the fold.",
  };
}

function overflowFinding(m: Measurement): Finding {
  const overhang = Math.round(m.scrollWidth - m.clientWidth);
  if (overhang <= 1) {
    return {
      id: "overflow",
      severity: "pass",
      title: "No horizontal overflow",
      detail: `Content measures ${Math.round(m.scrollWidth)}px inside a ${Math.round(m.clientWidth)}px viewport.`,
    };
  }
  return {
    id: "overflow",
    severity: "fail",
    title: `Page scrolls ${overhang}px sideways`,
    detail:
      m.overflowTotal > 0
        ? `${m.overflowTotal} ${plural(m.overflowTotal, "element reaches", "elements reach")} past the right edge. Hover a row to light it up in the device.`
        : "The document is wider than the viewport. No single element is the cause, so look for a min-width or a negative margin on a wrapper.",
    elements: m.overflow,
  };
}

function foldFinding(m: Measurement): Finding {
  const inRange = m.breakpoints.filter((bp) => bp > DUO.cover.width && bp < DUO.unfolded.width);
  if (m.breakpoints.length === 0) {
    return {
      id: "fold",
      severity: m.unreadableSheets > 0 ? "warn" : "fail",
      title: "No width breakpoints found",
      detail:
        m.unreadableSheets > 0
          ? `${m.unreadableSheets} ${plural(m.unreadableSheets, "stylesheet", "stylesheets")} could not be read, so this count is incomplete.`
          : "No width media query in any stylesheet. The same layout renders on a 466px cover and an 890px inner display.",
    };
  }
  if (inRange.length === 0) {
    const next = m.breakpoints.find((bp) => bp >= DUO.unfolded.width);
    return {
      id: "fold",
      severity: "warn",
      title: "Nothing changes across the fold",
      detail: `The ${m.breakpoints.length} breakpoints sit outside ${DUO.cover.width}–${DUO.unfolded.width}px${
        next ? `, the next one is ${next}px` : ""
      }. Opening the device stretches the cover layout instead of laying out a second column.`,
    };
  }
  return {
    id: "fold",
    severity: "pass",
    title: `${inRange.length} ${plural(inRange.length, "breakpoint lands", "breakpoints land")} inside the fold`,
    detail: `Layout changes at ${inRange.join("px, ")}px, between the cover and the inner display.`,
  };
}

function targetFinding(m: Measurement): Finding {
  if (m.targetsTotal === 0) {
    return {
      id: "targets",
      severity: "pass",
      title: "Tap targets are big enough",
      detail: "Every control measures at least 44 by 44 points.",
    };
  }
  return {
    id: "targets",
    severity: m.targetsTotal > 5 ? "fail" : "warn",
    title: `${m.targetsTotal} ${plural(m.targetsTotal, "control is", "controls are")} under 44pt`,
    detail:
      "Apple's minimum hit area is 44 by 44 points. Anything smaller is hard to hit with a thumb.",
    targets: m.targets,
  };
}

function textFinding(m: Measurement): Finding {
  if (m.smallTextCount === 0) {
    return {
      id: "text",
      severity: "pass",
      title: "Text is legible",
      detail: "No rendered text below 12px.",
    };
  }
  return {
    id: "text",
    severity: "warn",
    title: `${m.smallTextCount} ${plural(m.smallTextCount, "block", "blocks")} of text under 12px`,
    detail: "Below 12px iOS starts auto-zooming form fields and body copy gets hard to read.",
  };
}

function imageFinding(m: Measurement): Finding {
  if (m.wideImages.length === 0) {
    return {
      id: "images",
      severity: "pass",
      title: "Images stay inside the frame",
      detail: "Every image fits the viewport at both fold positions.",
    };
  }
  return {
    id: "images",
    severity: "warn",
    title: `${m.wideImages.length} ${plural(m.wideImages.length, "image is", "images are")} wider than the screen`,
    detail: "Add max-width: 100% and height: auto, or use a responsive source set.",
    elements: m.wideImages,
  };
}

export function evaluate(m: Measurement): Finding[] {
  const meta = parseViewportMeta(m.viewportMetaRaw);
  return [
    viewportFinding(meta),
    overflowFinding(m),
    foldFinding(m),
    targetFinding(m),
    imageFinding(m),
    textFinding(m),
  ];
}
