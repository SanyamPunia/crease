/**
 * The iPhone Duo profile.
 *
 * A book-fold device: closed it is a normal tall phone, opened the width roughly
 * doubles while the height stays put. Both panels share one screen, so the interesting
 * axis is width and the height never changes. Every number below is CSS pixels, which
 * is what a stylesheet actually sees.
 */
export const DUO = {
  name: "iPhone Duo",
  /**
   * Both panels are @3x: every stated pixel resolution divides by three exactly.
   *   cover    1398 × 2034 / 3 = 466 × 678
   *   unfolded 2670 × 1878 / 3 = 890 × 626
   */
  dpr: 3,
  /** The 5.4in cover panel, 1398-by-2034 at 460 ppi. Used upright. */
  cover: { width: 466, height: 678 },
  /** The 7.6in inner panel, 1878-by-2670 at 430 ppi. Wider than it is tall when open. */
  unfolded: { width: 890, height: 626 },
  /** Screen inset inside the shell, per side, in points. */
  bezel: 11,
  shellRadius: 46,
  screenRadius: 36,
} as const;

export type Orientation = "portrait" | "landscape";

export interface Viewport {
  width: number;
  height: number;
}

/** Named stops on the fold. The ruler snaps to these. */
export const DETENTS = [
  { id: "cover", label: "Cover", width: DUO.cover.width },
  { id: "half", label: "Half", width: Math.round((DUO.cover.width + DUO.unfolded.width) / 2) },
  { id: "full", label: "Full", width: DUO.unfolded.width },
] as const;

export type DetentId = (typeof DETENTS)[number]["id"];

/**
 * 0 is closed, 1 is fully open.
 *
 * The two panels are separate screens at different pixel densities, so opening the device
 * changes BOTH dimensions: 466 x 678 upright becomes 890 x 626 across. An earlier model
 * here held the height constant and moved only the width. That is true of the hardware in
 * millimetres, which is 117.8mm tall either way, and false of the viewport in points,
 * because the cover panel is 460 ppi and the inner one is 430. Interpolating a single axis
 * reported a viewport the device never has.
 */
export function widthForFold(fold: number): number {
  return Math.round(DUO.cover.width + (DUO.unfolded.width - DUO.cover.width) * fold);
}

export function heightForFold(fold: number): number {
  return Math.round(DUO.cover.height + (DUO.unfolded.height - DUO.cover.height) * fold);
}

export function foldForWidth(width: number): number {
  const span = DUO.unfolded.width - DUO.cover.width;
  return (width - DUO.cover.width) / span;
}

/** The screen the page gets, after orientation. */
export function viewportFor(fold: number, orientation: Orientation): Viewport {
  const width = widthForFold(fold);
  const height = heightForFold(fold);
  return orientation === "portrait" ? { width, height } : { width: height, height: width };
}

/**
 * What a mobile browser lays the page out at.
 *
 * A page with no viewport meta is laid out at a wide desktop default and then zoomed
 * out to fit, which is exactly why it looks unreadable on a phone. A page that declares
 * a fixed pixel width gets that width. Only `device-width` tracks the screen. Reproducing
 * this is the difference between a preview and a test: a plain iframe silently lays every
 * page out at the frame width and passes sites that fail on a real device.
 */
export const LEGACY_LAYOUT_WIDTH = 980;

export interface ViewportMeta {
  raw: string;
  width: number | "device-width" | null;
  initialScale: number | null;
  maximumScale: number | null;
  userScalable: boolean | null;
}

export function parseViewportMeta(raw: string | null | undefined): ViewportMeta | null {
  if (!raw) return null;
  const meta: ViewportMeta = {
    raw,
    width: null,
    initialScale: null,
    maximumScale: null,
    userScalable: null,
  };
  for (const part of raw.split(",")) {
    const [keyRaw, valueRaw] = part.split("=");
    if (!keyRaw || valueRaw === undefined) continue;
    const key = keyRaw.trim().toLowerCase();
    const value = valueRaw.trim().toLowerCase();
    if (key === "width") {
      meta.width =
        value === "device-width" ? "device-width" : Number.parseInt(value, 10) || null;
    } else if (key === "initial-scale") {
      meta.initialScale = Number.parseFloat(value) || null;
    } else if (key === "maximum-scale") {
      meta.maximumScale = Number.parseFloat(value) || null;
    } else if (key === "user-scalable") {
      meta.userScalable = !(value === "no" || value === "0");
    }
  }
  return meta;
}

/** The CSS width the document will actually lay out at on this screen. */
export function layoutWidthFor(meta: ViewportMeta | null, screenWidth: number): number {
  if (!meta) return LEGACY_LAYOUT_WIDTH;
  if (meta.width === "device-width" || meta.width === null) return screenWidth;
  return Math.max(meta.width, 1);
}
