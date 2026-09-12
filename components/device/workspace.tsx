"use client";

import {
  ChevronUpIcon,
  MinusIcon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
  SmartphoneIcon,
  WaypointsIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AddressBar } from "@/components/device/address-bar";
import type { FoldAxis } from "@/components/device/device-shell";
import { Screen } from "@/components/device/screen";
import { Stage } from "@/components/device/stage";
import { useFitZoom } from "@/components/device/use-fit-zoom";
import { useFrameBridge } from "@/components/device/use-frame-bridge";
import { ReportRail } from "@/components/report/report-rail";
import { Wordmark } from "@/components/site/wordmark";
import { Button } from "@/components/ui/button";
import { MetaDot } from "@/components/ui/meta-dot";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import {
  evaluate,
  type Finding,
  type Measurement,
  renderState,
  type SweepStep,
  VERDICT_COPY,
  worstSeverity,
} from "@/lib/audit";
import {
  DETENTS,
  DUO,
  foldForWidth,
  heightForFold,
  LEGACY_LAYOUT_WIDTH,
  layoutWidthFor,
  type Orientation,
  parseViewportMeta,
  widthForFold,
} from "@/lib/device";
import { benchPath, isDemoUrl } from "@/lib/site";
import { displayUrl } from "@/lib/url";
import { useMediaQuery } from "@/lib/use-media-query";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { clamp, cn } from "@/lib/utils";

/** The three named stops, plus the label the control shows mid-drag. */
const DETENT_OPTIONS = DETENTS.map((detent) => ({
  value: detent.id as string,
  label: detent.label,
  hint: `${detent.width}pt`,
}));

const ORIENTATIONS = [
  {
    value: "portrait" as const,
    label: "Portrait",
    icon: <RectangleVerticalIcon className="size-3" aria-hidden="true" />,
    hint: "The fold runs across the width",
  },
  {
    value: "landscape" as const,
    label: "Landscape",
    icon: <RectangleHorizontalIcon className="size-3" aria-hidden="true" />,
    hint: "The fold runs down the height",
  },
];

/** Widths the sweep records, cover to unfolded, and how long the glide takes. */
const SWEEP_STEPS = 24;
const SWEEP_MS = 2600;

interface WorkspaceProps {
  initialUrl: string;
  /** A cold visitor, landing on the bench with no page in front of it. */
  firstRun?: boolean;
}

export function Workspace({ initialUrl, firstRun = false }: WorkspaceProps) {
  const [url, setUrl] = useState(initialUrl);
  const [epoch, setEpoch] = useState(0);
  const [fold, setFold] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(true);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [framing, setFraming] = useState<string[]>([]);
  const [sweep, setSweep] = useState<SweepStep[] | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [dead, setDead] = useState(false);
  const [folded, setFolded] = useState(false);
  const [settle, setSettle] = useState<0 | 1 | null>(null);
  const [turnAngle, setTurnAngle] = useState(0);
  const [turning, setTurning] = useState(false);
  const [jumping, setJumping] = useState(false);
  // Below the sidebar breakpoint the rail is a sheet, closed to begin with. A phone screen
  // split between a device and six cards leaves the device at a quarter of its size, and
  // the device is the thing being looked at.
  const [railOpen, setRailOpen] = useState(false);
  // One screen is not wide enough for both the device and the room it will need when it
  // opens. See `stageBox`.
  const compact = useMediaQuery("(width < 64rem)");
  const reduced = useReducedMotion();

  const frame = useRef<HTMLIFrameElement | null>(null);
  const sweepRunning = useRef(false);
  const sweepFrame = useRef(0);
  const jumpTimer = useRef(0);
  // Read inside the rAF loop, which closes over its first render.
  const reducedRef = useRef(false);

  const send = useFrameBridge(frame, {
    onReady: useCallback(() => {
      setLoading(false);
      setDead(false);
    }, []),
    onMeasurement: useCallback((next: Measurement) => {
      setLoading(false);
      setDead(false);
      setMeasurement(next);
    }, []),
    onNavigate: useCallback((next: string) => {
      setUrl(next);
      setLoading(true);
      setMeasurement(null);
    }, []),
    // A client-side route change. The address moves, but nothing is loading, so the
    // measurement stays on screen until the probe sends a fresh one.
    onLocationChange: useCallback((next: string) => setUrl(next), []),
  });

  // The range is a little wider than 0..1 so the grip can resist past either end. Nothing
  // is measured while that is happening: the measure effect waits for the drag to settle.
  const changeFold = useCallback((next: number) => {
    setFold(clamp(next, -0.06, 1.06));
    setFolded(true);
  }, []);

  /**
   * A named stop is a jump, not a drag. The fold travels on its own for the length of the
   * transition, so the measurements stand down for the trip the same way they do through a
   * turn. Under reduced motion the fold arrives instantly and there is nothing to hide.
   */
  const jumpFold = useCallback(
    (next: number) => {
      changeFold(next);
      if (reducedRef.current) return;
      setJumping(true);
      window.clearTimeout(jumpTimer.current);
      jumpTimer.current = window.setTimeout(() => setJumping(false), 620);
    },
    [changeFold],
  );

  useEffect(() => () => window.clearTimeout(jumpTimer.current), []);

  /**
   * The bench's own address follows the site under test, so the link in the browser is
   * always a link to what is on screen and can be shared as one.
   *
   * `replaceState` rather than `pushState`: the framed page reports its own client-side
   * route changes too, and pushing those would fill the history with entries the user
   * never navigated to and make Back walk backwards through someone else's site.
   */
  useEffect(() => {
    const next = benchPath(url, window.location.origin);
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
    document.title = isDemoUrl(url, window.location.origin)
      ? "Crease, layout testing for the iPhone Duo"
      : `${displayUrl(url)} on the iPhone Duo`;
  }, [url]);

  reducedRef.current = reduced;

  const axis: FoldAxis = orientation === "portrait" ? "x" : "y";
  const foldSize = widthForFold(fold);
  const detentId = DETENTS.find((detent) => Math.abs(detent.width - foldSize) < 6)?.id;

  /**
   * Turning rotates the device.
   *
   * The new dimensions are applied immediately, then the device is placed back at the
   * angle it came from and released. One animation carries it round, which is the action
   * the control describes. An earlier version cut between the two sizes and hid the cut
   * under the blur: nothing moved, so it read as a glitch being papered over rather than
   * as a device being turned.
   *
   * The blur stays, shortened, because the page inside genuinely reflows to a new width
   * partway through and that reflow is the one thing worth masking.
   */
  const turn = useCallback(
    (next: Orientation) => {
      if (next === orientation) return;
      if (reduced) {
        setOrientation(next);
        return;
      }
      setTurning(true);
      setOrientation(next);
      setTurnAngle(next === "landscape" ? -90 : 90);
      // Two frames: one for the new size and angle to paint, one to start the rotation.
      requestAnimationFrame(() => requestAnimationFrame(() => setTurnAngle(0)));
      setSettle((value) => (value === 0 ? 1 : 0));
      window.setTimeout(() => setSettle(null), 700);
      window.setTimeout(() => setTurning(false), 620);
    },
    [orientation, reduced],
  );

  // Portrait folds along the width. Landscape turns the device, so the fold now moves the
  // height and the width is the device's long side.
  const across = heightForFold(fold);
  // One source for the fold's timing, shared by the shell and the page inside it.
  const foldMotion =
    !dragging && !sweeping && !reduced && settle === null
      ? {
          transitionDuration: "var(--duration-fold)",
          transitionTimingFunction: "var(--ease-fold)",
        }
      : { transitionDuration: "0ms" };
  const screenWidth = orientation === "portrait" ? foldSize : across;
  const screenHeight = orientation === "portrait" ? across : foldSize;

  const render = renderState(measurement);

  const viewportMeta = useMemo(
    () => parseViewportMeta(measurement?.viewportMetaRaw ?? null),
    [measurement?.viewportMetaRaw],
  );

  // Before the first measurement the page is assumed responsive, so the frame is not
  // scaled. Once the probe reports back, a page with no viewport meta snaps to the 980px
  // layout Safari would give it.
  const layoutWidth = measurement ? layoutWidthFor(viewportMeta, screenWidth) : screenWidth;
  const zoomedOut = layoutWidth > screenWidth + 1;

  /**
   * How much room the stage holds open.
   *
   * On a wide screen it reserves the device at its widest, so opening the fold moves one
   * edge and nothing rescales under the pointer mid-drag. A phone cannot afford that: an
   * 890pt device reserved inside a 390pt screen leaves the cover view at 28%, too small to
   * read and too small to judge. There the stage holds only what is on screen, so the
   * device is legible and the scale changes with the fold instead of the position. The
   * padding has to clear the grip, which straddles the device's moving edge and would
   * otherwise be clipped by the stage once the device fills the width.
   */
  const stageBox = compact
    ? { w: screenWidth + DUO.bezel * 2, h: screenHeight + DUO.bezel * 2 }
    : orientation === "portrait"
      ? {
          w: DUO.unfolded.width + DUO.bezel * 2,
          h: Math.max(DUO.cover.height, DUO.unfolded.height) + DUO.bezel * 2,
        }
      : {
          w: Math.max(DUO.cover.height, DUO.unfolded.height) + DUO.bezel * 2,
          h: DUO.unfolded.width + DUO.bezel * 2,
        };
  const { ref: stageRef, fit } = useFitZoom(stageBox.w, stageBox.h, compact ? 72 : 112);

  const findings: Finding[] | null = useMemo(
    () => (measurement ? evaluate(measurement) : null),
    [measurement],
  );

  const totals = useMemo(() => {
    const byId: Record<string, number> = {};
    if (measurement) {
      byId.overflow = measurement.overflowTotal;
      byId.targets = measurement.targetsTotal;
    }
    return byId;
  }, [measurement]);

  // What the collapsed sheet says on a small screen, so the verdict is readable without
  // opening it.
  const verdict = findings ? worstSeverity(findings) : null;
  const railLabel = dead
    ? "No result"
    : render === "hidden"
      ? "Nothing rendered"
      : render === "waiting"
        ? "Waiting for the page"
        : verdict
          ? VERDICT_COPY[verdict].label
          : "Measuring";
  const railTone =
    !dead && render === "rendered" && verdict
      ? { pass: "text-pass", warn: "text-warn", fail: "text-fail" }[verdict]
      : "text-ink";

  /**
   * Ask for a measurement until one arrives.
   *
   * A same-origin page can finish loading, run the probe and post its result before this
   * component has attached its message listener, and that first result is then lost with
   * nothing to retry it. Network latency hid this until the bench started opening on a
   * local page. The probe answers `measure` whenever it is ready, so asking repeatedly
   * closes the race from either side.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: epoch restarts the polling on a reload, which clears the measurement a beat later.
  useEffect(() => {
    if (measurement || dead) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 8000) {
        clearInterval(timer);
        return;
      }
      send({ type: "measure" });
    }, 400);
    return () => clearInterval(timer);
  }, [measurement, dead, epoch, send]);

  // Re-measure after the fold settles. During a drag the numbers would be from a width
  // the user has already left.
  // biome-ignore lint/correctness/useExhaustiveDependencies: foldSize and orientation are triggers, not inputs. The measurement is read from inside the frame.
  useEffect(() => {
    if (dragging || loading) return;
    const timer = setTimeout(() => send({ type: "measure" }), 180);
    return () => clearTimeout(timer);
  }, [foldSize, orientation, dragging, loading, send]);

  useEffect(() => {
    fetch(`/api/inspect?u=${encodeURIComponent(url)}`)
      .then((response) => response.json())
      .then((data) => setFraming(Array.isArray(data.framing) ? data.framing : []))
      .catch(() => setFraming([]));
  }, [url]);

  const stopSweep = useCallback(() => {
    sweepRunning.current = false;
    cancelAnimationFrame(sweepFrame.current);
    setSweeping(false);
  }, []);

  useEffect(() => stopSweep, [stopSweep]);

  const reload = useCallback(() => {
    stopSweep();
    setLoading(true);
    setDead(false);
    setMeasurement(null);
    setEpoch((value) => value + 1);
  }, [stopSweep]);

  const navigate = useCallback(
    (next: string) => {
      stopSweep();
      setUrl(next);
      setLoading(true);
      setDead(false);
      setMeasurement(null);
      setEpoch((value) => value + 1);
    },
    [stopSweep],
  );

  // A dead frame means whatever is on screen is Chrome's error page, not the site, so the
  // last measurement is about something that is no longer there.
  const onSettled = useCallback((alive: boolean) => {
    setLoading(false);
    setDead(!alive);
    if (!alive) setMeasurement(null);
  }, []);

  /**
   * Glide the fold from closed to open, sampling overflow as it goes.
   *
   * A single width tells you almost nothing about a folding device. Breakage usually sits
   * in a band between two breakpoints, which is invisible unless something walks the range.
   *
   * The walk is driven frame by frame rather than in discrete jumps. Sixteen `setFold`
   * calls spaced by a timer read as sixteen jerks, and with the CSS transition disabled
   * during the sweep there is nothing to smooth them over.
   */
  const runSweep = useCallback(() => {
    if (sweepRunning.current) return;
    sweepRunning.current = true;
    setSweeping(true);
    setSweep(null);
    setFolded(true);

    const steps: SweepStep[] = new Array(SWEEP_STEPS);
    let filled = 0;
    const started = performance.now();

    function tick(now: number) {
      if (!sweepRunning.current) return;
      const ratio = Math.min((now - started) / (reducedRef.current ? 360 : SWEEP_MS), 1);
      setFold(ratio);

      // Sample on a fixed grid of widths, whatever frame rate the machine happens to hit.
      const due = Math.min(Math.floor(ratio * SWEEP_STEPS), SWEEP_STEPS - 1);
      if (due >= filled) {
        const doc = frame.current?.contentDocument;
        const root = doc?.documentElement;
        const overflowBy = root
          ? Math.round(
              Math.max(root.scrollWidth, doc.body?.scrollWidth ?? 0) - root.clientWidth,
            )
          : 0;
        for (let index = filled; index <= due; index += 1) {
          steps[index] = { width: widthForFold(index / (SWEEP_STEPS - 1)), overflowBy };
        }
        filled = due + 1;
        setSweep(steps.slice(0, filled));
      }

      if (ratio < 1) {
        sweepFrame.current = requestAnimationFrame(tick);
        return;
      }
      sweepRunning.current = false;
      setSweeping(false);
    }

    sweepFrame.current = requestAnimationFrame(tick);
  }, []);

  const onHover = useCallback(
    (refs: number[] | null, tone: "fail" | "warn") => {
      send({ type: "highlight", refs: refs ?? [], tone });
    },
    [send],
  );

  const onReveal = useCallback(
    (ref: number, tone: "fail" | "warn") => send({ type: "reveal", ref, tone }),
    [send],
  );

  // Keyboard shortcuts for the controls that get used on every run.
  // biome-ignore lint/correctness/useExhaustiveDependencies: turn and orientation are read inside the handler, which is re-bound when either changes.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "1") jumpFold(0);
      else if (key === "2") jumpFold(foldForWidth(DETENTS[1].width));
      else if (key === "3") jumpFold(1);
      else if (key === "r") reload();
      else if (key === "o") {
        setOrientation((value) => (value === "portrait" ? "landscape" : "portrait"));
      } else if (key === "s") runSweep();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reload, runSweep, jumpFold, turn, orientation]);

  return (
    <TooltipProvider>
      <div className="flex h-dvh flex-col overflow-hidden">
        {/* One address bar, not two. Below the phone breakpoint it wraps onto its own row,
            where a shared row leaves it too narrow to read a URL in. */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 px-3 sm:flex-nowrap sm:px-4">
          <div className="flex h-12 flex-1 items-center gap-3">
            <Wordmark className="shrink-0" />
          </div>
          <div className="order-last flex h-11 w-full min-w-0 items-center sm:order-none sm:h-12 sm:w-auto sm:flex-1">
            <AddressBar url={url} loading={loading} onNavigate={navigate} onReload={reload} />
          </div>
          <div className="flex h-12 items-center gap-3">
            <Tooltip label="Walk every width and record what breaks (S)">
              <Button size="xs" onClick={runSweep} disabled={sweeping || loading}>
                <WaypointsIcon
                  className={cn("size-3.5", sweeping && "animate-pulse")}
                  aria-hidden="true"
                />
                {sweeping ? "Sweeping" : "Sweep"}
              </Button>
            </Tooltip>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto px-3 sm:px-4">
              <Segmented
                options={DETENT_OPTIONS}
                value={detentId ?? "custom"}
                onChange={(next) => {
                  const detent = DETENTS.find((item) => item.id === next);
                  if (detent) jumpFold(foldForWidth(detent.width));
                }}
                label="Fold position"
                className="shrink-0"
              />

              <Segmented
                options={ORIENTATIONS}
                value={orientation}
                onChange={turn}
                label="Orientation"
                className="shrink-0"
              />

              <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
                {zoomedOut ? (
                  <Tooltip label={`Laid out at ${layoutWidth}px, then zoomed to fit`}>
                    <span className="flex h-8 cursor-default items-center gap-1.5 rounded-full bg-fail-soft px-3 font-medium text-fail text-micro">
                      <SmartphoneIcon className="size-3" aria-hidden="true" />
                      Zoomed {Math.round((screenWidth / layoutWidth) * 100)}%
                    </span>
                  </Tooltip>
                ) : null}
              </div>
            </div>

            <div
              ref={stageRef}
              className="hairline relative mx-3 mb-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-surface sm:mx-4 sm:mb-4"
            >
              <div className="drafting-grid pointer-events-none absolute inset-0" />
              <Stage
                axis={axis}
                fold={fold}
                onFoldChange={changeFold}
                onDragStateChange={setDragging}
                zoom={fit}
                animate={!dragging && !sweeping && !reduced && settle === null}
                sweep={sweep}
                sweeping={sweeping}
                hint={firstRun && !folded && !loading && !sweeping}
                turnAngle={turnAngle}
                compact={compact}
                quiet={turning || (jumping && !dragging)}
                turning={turning}
              >
                <Screen
                  url={url}
                  epoch={epoch}
                  screenWidth={screenWidth}
                  screenHeight={screenHeight}
                  layoutWidth={layoutWidth}
                  settle={settle}
                  dragging={dragging}
                  motion={foldMotion}
                  loading={loading}
                  frameRef={frame}
                  onSettled={onSettled}
                />
              </Stage>
            </div>

            <div className="flex h-10 shrink-0 items-center gap-x-5 overflow-x-auto px-3 text-ink-faint text-micro sm:px-4">
              <span className="numeral shrink-0 text-ink">
                {screenWidth} × {screenHeight}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span>Layout</span>
                {measurement ? (
                  <span className="numeral text-ink">
                    {layoutWidth}
                    {layoutWidth === LEGACY_LAYOUT_WIDTH ? " fallback" : ""}
                  </span>
                ) : (
                  <MinusIcon className="size-3" aria-label="Not measured yet" role="img" />
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                Scale <span className="numeral text-ink">{Math.round(fit * 100)}%</span>
              </span>
              {measurement ? (
                // Diagnostics rather than results. The row is cut off at the narrowest
                // widths with them in, and the dimensions are what matter there.
                <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  <span className="numeral text-ink">{measurement.elementCount}</span> nodes
                  <MetaDot />
                  <span className="numeral text-ink">{measurement.tookMs}ms</span>
                </span>
              ) : null}
              <span className="ml-auto hidden shrink-0 items-center gap-1.5 sm:flex">
                1 2 3 fold
                <MetaDot />O turn
                <MetaDot />S sweep
              </span>
            </div>
          </main>

          <aside
            className={cn(
              "flex min-h-0 w-full shrink-0 flex-col bg-paper lg:w-[23rem] lg:basis-auto lg:overflow-y-auto",
              railOpen ? "basis-[58dvh]" : "basis-auto",
            )}
          >
            <button
              type="button"
              onClick={() => setRailOpen((open) => !open)}
              aria-expanded={railOpen}
              className="focus-ring flex h-12 shrink-0 cursor-pointer items-center gap-2 border-rule border-t px-4 text-left transition-colors duration-150 can-hover:hover:bg-hover lg:hidden"
            >
              <span className={cn("truncate font-medium text-label", railTone)}>
                {railLabel}
              </span>
              {findings && !dead && render === "rendered" ? (
                <span className="numeral shrink-0 text-ink-faint text-micro">
                  {findings.length - findings.filter((f) => f.severity !== "pass").length}/
                  {findings.length}
                </span>
              ) : null}
              <ChevronUpIcon
                className={cn(
                  "ml-auto size-4 shrink-0 text-ink-faint motion-safe:transition-transform motion-safe:duration-200",
                  railOpen && "rotate-180",
                )}
                aria-hidden="true"
              />
            </button>

            <div className={cn("min-h-0 flex-1 overflow-y-auto", !railOpen && "max-lg:hidden")}>
              <ReportRail
                findings={dead ? null : findings}
                dead={dead}
                render={render}
                url={url}
                onReload={reload}
                totals={totals}
                framing={framing}
                onHover={onHover}
                onReveal={onReveal}
              />
            </div>
          </aside>
        </div>
      </div>
    </TooltipProvider>
  );
}
