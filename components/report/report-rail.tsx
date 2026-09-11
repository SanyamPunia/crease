"use client";

import { TriangleAlertIcon } from "lucide-react";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type Finding, VERDICT_COPY, worstSeverity } from "@/lib/audit";
import { cn } from "@/lib/utils";
import { FindingRow } from "./finding-row";

interface ReportRailProps {
  findings: Finding[] | null;
  /** Totals by finding id, for the kinds the probe samples rather than lists in full. */
  totals: Record<string, number>;
  /** The frame is showing the browser's error page rather than the site. */
  dead: boolean;
  onReload: () => void;
  framing: string[];
  onHover: (refs: number[] | null, tone: "fail" | "warn") => void;
  onReveal: (ref: number, tone: "fail" | "warn") => void;
}

const VERDICT_TONE: Record<string, string> = {
  pass: "text-pass",
  warn: "text-warn",
  fail: "text-fail",
};

/**
 * Memoised because the fold moves at 60fps and the rail does not.
 *
 * A fold tick re-renders the device, the screen and everything measured from the fold.
 * The rail depends only on the measurement, which is deliberately not taken mid-drag, so
 * without this it re-renders six cards and their element lists on every frame of a drag
 * or a sweep for no change at all.
 */
function Rail({
  findings,
  totals,
  dead,
  onReload,
  framing,
  onHover,
  onReveal,
}: ReportRailProps) {
  if (dead) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="eyebrow">Verdict</p>
        <h2 className="flex items-center gap-2 font-semibold text-ink text-title">
          <TriangleAlertIcon className="size-5 text-warn" aria-hidden="true" />
          No result
        </h2>
        <p className="text-ink-muted text-micro leading-relaxed">
          The page stopped responding inside the device, so there is nothing to measure. Heavy
          pages sometimes need a second attempt.
        </p>
        <Button size="sm" onClick={onReload} className="self-start">
          Reload
        </Button>
      </div>
    );
  }

  if (!findings) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-7 w-44 rounded-lg" />
        <div className="flex flex-col gap-2.5 pt-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const verdict = worstSeverity(findings);
  const copy = VERDICT_COPY[verdict];
  const failing = findings.filter((f) => f.severity !== "pass").length;

  return (
    <div className="flex flex-col gap-2.5 p-4">
      <div className="flex flex-col gap-1.5 px-1 pb-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="eyebrow">Verdict</p>
          <p className="text-ink-faint text-micro">
            <span className="numeral">{findings.length - failing}</span> of{" "}
            <span className="numeral">{findings.length}</span> pass
          </p>
        </div>
        <h2 className={cn("font-semibold text-title", VERDICT_TONE[verdict])}>{copy.label}</h2>
        <p className="text-ink-muted text-micro leading-relaxed">{copy.line}</p>
      </div>

      {framing.length > 0 ? (
        <div className="hairline rounded-xl bg-surface p-3.5">
          <p className="eyebrow mb-1.5">Framing bypassed</p>
          <ul className="flex flex-col gap-0.5">
            {framing.map((header) => (
              <li key={header} className="numeral text-ink-muted text-tick leading-relaxed">
                {header}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink-faint text-micro leading-relaxed">
            This site refuses to be embedded. The proxy dropped those headers, so it loads here
            anyway.
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2.5">
        {findings.map((finding) => (
          <FindingRow
            key={finding.id}
            finding={finding}
            total={totals[finding.id]}
            onHover={onHover}
            onReveal={onReveal}
          />
        ))}
      </ul>
    </div>
  );
}

export const ReportRail = memo(Rail);
