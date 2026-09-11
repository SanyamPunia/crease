"use client";

import type { Finding } from "@/lib/audit";
import { cn } from "@/lib/utils";

interface FindingRowProps {
  finding: Finding;
  /** How many of this kind exist in total, when more were found than are listed. */
  total?: number;
  onHover: (refs: number[] | null, tone: "fail" | "warn") => void;
  onReveal: (ref: number, tone: "fail" | "warn") => void;
}

/** Every check is its own card. A passing one is quiet; only problems take colour. */
export function FindingRow({ finding, total, onHover, onReveal }: FindingRowProps) {
  const tone = finding.severity === "fail" ? "fail" : "warn";
  const elements = finding.elements ?? [];
  const targets = finding.targets ?? [];
  const listed = elements.length + targets.length;
  const hidden = total !== undefined ? total - listed : 0;

  return (
    <li className="hairline flex flex-col gap-1 rounded-xl bg-surface p-3.5">
      <h3
        className={cn(
          "font-medium text-label leading-snug",
          finding.severity === "fail"
            ? "text-fail"
            : finding.severity === "warn"
              ? "text-warn"
              : "text-ink",
        )}
      >
        {finding.title}
      </h3>
      <p className="text-ink-muted text-micro leading-relaxed">{finding.detail}</p>

      {elements.length + targets.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1" onMouseLeave={() => onHover(null, tone)}>
          {elements.map((element) => (
            <li key={element.ref}>
              <button
                type="button"
                onMouseEnter={() => onHover([element.ref], tone)}
                onFocus={() => onHover([element.ref], tone)}
                onClick={() => onReveal(element.ref, tone)}
                className="focus-ring group/row flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-sunk px-2.5 py-2 text-tick transition-colors duration-150 can-hover:hover:bg-crease-soft"
              >
                <span className="numeral truncate text-ink-muted transition-colors duration-150 group-hover/row:text-ink">
                  {element.label}
                </span>
                <span
                  className={cn(
                    "numeral shrink-0",
                    finding.severity === "fail" ? "text-fail" : "text-warn",
                  )}
                >
                  +{element.overhang}
                </span>
              </button>
            </li>
          ))}
          {targets.map((target) => (
            <li key={target.ref}>
              <button
                type="button"
                onMouseEnter={() => onHover([target.ref], tone)}
                onFocus={() => onHover([target.ref], tone)}
                onClick={() => onReveal(target.ref, tone)}
                className="focus-ring group/row flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg bg-surface-sunk px-2.5 py-2 text-tick transition-colors duration-150 can-hover:hover:bg-crease-soft"
              >
                <span className="numeral truncate text-ink-muted transition-colors duration-150 group-hover/row:text-ink">
                  {target.label}
                </span>
                <span className="numeral shrink-0 text-warn">
                  {target.width}×{target.height}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {hidden > 0 ? (
        <p className="mt-1 text-ink-faint text-micro">
          <span className="numeral">{listed}</span> of <span className="numeral">{total}</span>{" "}
          listed
        </p>
      ) : null}
    </li>
  );
}
