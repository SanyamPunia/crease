# Architecture

How Crease is put together, and why each piece is the way it is. Read this before changing
the proxy, the device profile, or the motion.

## Project overview

Crease is a layout test bench for the iPhone Duo. It is named for the line down the middle of a folded page, which is the only thing it is about. Paste a URL and the site loads
inside a device that folds, at every width between the 466pt cover display and the 890pt
inner display, while a probe inside the page reports what breaks.

The distinction that shapes everything here: this is a test, not a preview. A preview puts
a page in a box and shows you a picture. A test reproduces what the device does to the
page and then measures the result from inside it.

## One surface

**There is no landing page, and adding one back is a regression.** Every check a marketing
page would list is already rendered in the rail the moment a page loads, so the page was
duplicating the app's own output. `/` is the bench, opened on a local demo page served by
`app/demo/route.ts`, which is guaranteed to reflow inside the fold range. `/preview?url=`
is the same bench with a different starting address, for direct links.

A cold visitor gets a verdict in under a second with nothing typed. That is the whole
pitch, and it is why the product does not need one written down.

## The address bar is the share button

The browser already has a share button, so the bench's own address names what is on screen.
`workspace.tsx` writes `/preview?url=` on every change to the site under test, including the
framed page's own client-side route changes, and the tab title follows it.

`replaceState`, never `pushState`. Pushing a route change the user did not make fills the
history with entries they never navigated to, and Back then walks backwards through someone
else's site instead of leaving the bench.

The demo is the exception and stays at `/`. It is what a cold visitor is given, so it does
not want a query string pointing back at this deployment.

## The three-stage engine

A request moves through three stages, and each one exists because the stage before it is
not enough.

1. **Fetch** (`app/api/render/route.ts`). The page is requested with an iPhone user agent
   and its framing headers are dropped, so sites that refuse to be embedded still load.
2. **Rewrite** (`lib/proxy.ts`). HTML and stylesheets are re-served from this origin.
3. **Measure** (`lib/probe.ts`). An injected script reads live layout and posts numbers
   back to the parent.

**Same-origin is the whole point of stage 2.** A cross-origin stylesheet throws on
`cssRules`, so the real media queries cannot be enumerated, and the parent cannot address
anything inside the page. Both of those are load-bearing: the fold question is "does
anything change between 466 and 890", which is a question about media queries, and the
answer is worthless if you cannot point at the element that broke.

## Four things in the proxy that were each a bug first

**Every rewritten URL is absolute, naming this app's origin.** The rewritten document
carries a `<base>` of the target site so its own relative assets keep resolving. That base
also catches a root-relative `/api/render?u=...`, which then resolves against the target's
origin and 404s there. Symptom: every site renders unstyled and no breakpoints are ever
found.

**The History API is patched in the probe.** `pushState` and `replaceState` refuse a
cross-origin URL, and the `<base>` makes every router's URL cross-origin. The first route
change throws, hydration dies with it, and the site renders as a skeleton. Symptom: a
React site reports a few hundred nodes and no viewport meta.

**`unproxy` runs before a History URL is re-proxied.** The page's own address is a proxy
address, so a router that reads `location` and hands it back would get the proxy path
wrapped twice and resolved against the site's origin. Symptom: the site's own 404 page,
and an address bar reading `site.com/api/render?u=...`.

**Only GET is rewritten.** The render route answers GET, so rewriting a POST turns a
site's analytics beacon into a 405. Those requests are left alone and fail on their own.

**The injection goes at the end of `<head>`, and the head's own URLs are rewritten.** Two
elements pushed in front of the site's first `<meta>` shift every child React expects, so
hydration fails, React discards the server HTML and re-renders the whole document, and
everything in `<head>` it does not own goes with it, including the `<base>`. Without the
base, every root-relative URL on the page resolves to this app: images 400 at our own
image optimiser, RSC requests 404, and a link to `/work` navigates the frame to the bench's
own 404. Moving the base to the end of the head fixes hydration but leaves every stylesheet,
script and preload above it already fetching, so those are made absolute by the rewriter
instead. The base stays for what the page resolves later, at runtime.

**Attribute values are entity-decoded before a URL is parsed out of them.** `&` is written
`&amp;` in HTML, so a srcset of `?url=x&amp;w=48` read raw becomes a parameter literally
named `amp;w`. The rewritten URL then reaches the site missing every parameter after the
first, and an image optimiser answers 400.

**`crossorigin` survives on a rewritten preload, `integrity` does not.** A font is fetched
in CORS mode whether or not the attribute is there, so dropping it left the preload and the
real request in different credentials modes and the font downloaded twice. The URL is
same-origin now, so the attribute costs nothing. `integrity` still goes, because a rewritten
stylesheet no longer hashes to what the page claims.

**A request that resolves against the proxy's own path is recovered from the referer.** A
module's relative imports resolve against that module's URL, which here is
`/api/render?u=...`, so `import "./chunk.js"` asks for `/api/chunk.js`. `app/api/[...stray]`
reads the importing module's address out of the referer, resolves the stray path against it
and redirects to a proper proxy URL. The `<base>` cannot help: it applies to the document,
not to module resolution.

A bundler that derives its public path from `document.currentScript.src` is still wrong
through this proxy, because that src is a query string rather than a directory. GitHub's CSS
chunks 404 for exactly that reason. Fixing it properly means proxying on a path that mirrors
the target rather than in a query parameter.

**The probe proxies stylesheets and scripts the page adds after load.** The rewriter only
ever sees the HTML the server sent, so a bundler that appends its CSS chunk after hydration
leaves that sheet cross-origin and `cssRules` throws on it, which hides the media queries
this tool exists to read. Insertion is the moment the fetch starts, so the URL is corrected
in `appendChild` and its siblings.

**The probe resolves against the address the proxy fetched, not `document.baseURI`.** The
base is one element on a page that is free to remove it. `TARGET` is a constant compiled
into the injected source and updated on each client-side route change, and the probe also
re-inserts the base whenever the page tears it out.

**A history change posts `locationchange`, never `navigate`.** `navigate` means a document
is loading, and the workspace waits for a load event before it will measure again. A
client-side route change loads nothing, so calling it a navigation leaves `loading` stuck
on forever. Symptom: the address updates, the verdict never does, and Sweep stays disabled.

**Ask for a measurement until one arrives.** A same-origin page can load, run the probe
and post its result before the workspace has attached its message listener, and that first
result is lost with nothing to retry it. Network latency hid this until the bench started
opening on a local page. `workspace.tsx` polls `measure` until a measurement lands.

**The fold drag captures the pointer.** Without `setPointerCapture`, the first move that
crosses the device hands the pointer to the iframe, whose document swallows it. Folding
outward never crosses anything, so only one direction appears broken. The frame also drops
`pointer-events` for the duration.

**`allowedDevOrigins` includes `127.0.0.1`.** Next 16 dev refuses to serve its own chunks
to an origin it does not recognise, so opening the bench on the loopback address instead of
`localhost` blocks hydration with nothing logged in the browser. Production is unaffected,
which makes this look like a code bug until you read the dev server log.

**Redirects are followed by hand, not by `fetch`.** `redirect: "follow"` checks only the
address that was typed. A public hostname answering 302 with a `Location` of
`http://169.254.169.254/` is then followed with nothing looking at it, which walks straight
past the private-address guard. `lib/fetch-target.ts` takes the hops itself and runs
`assertPublicTarget` on every one, under a single deadline for the whole chain.

**Bodies are read with a ceiling.** `Response.text()` has none, so one 500MB response takes
the function down. HTML and CSS are counted off the stream and refused past 8MB. Everything
else streams straight through and is never held in memory.

## Deploying it

The proxy serves attacker-controlled pages **from this app's own origin**, and that is not
an oversight: same-origin is what makes the media queries readable and the elements
addressable. It has three consequences that outlive any one change.

- **Nothing sensitive may ever live on this origin.** No auth, no cookies, no
  `localStorage`, no second product on the same domain. A page under test runs its own
  JavaScript here and can reach all of it. Deploy on a domain that does nothing else.
- **Crawlers are kept off `/api/` and `/preview`** in `app/robots.ts`. Indexed, the
  deployment becomes a copy of every site anyone has ever tested, hosted under this domain.
- **The render route is an open proxy**, so a public deployment wants a platform rate limit
  on `/api/render`. There is no application-level limiter, because a serverless function
  has no shared state to count requests in.

`access-control-allow-origin` is deliberately absent. The frame is same-origin and the
rewriter strips `crossorigin` and `integrity`, so nothing needs it, and setting it to `*`
would hand any website on the internet a CORS bypass.

## The frame is sized to the layout width, not the screen width

`components/device/screen.tsx` sets the iframe to the width the document actually lays out
at, then scales it down to the screen. That is what a phone does. A page with no viewport
meta lays out at 980px and gets zoomed out to fit, which is the single most common reason a
site is unusable on a phone.

A frame simply set to the device width silently reflows that page and passes it. Getting
this wrong does not look like a bug, it looks like a working tool that says everything is
fine.

## The measurement lives inside the page

`lib/probe.ts` is a source string, not a module, because it is inlined into someone else's
HTML. Keep it to ES5-style syntax with no template literals: the whole file is one.

Two things it does that are easy to undo by accident:

- **The MutationObserver is muted while the probe writes its own `data-duo-ref`
  attributes.** Without that it observes its own writes and re-measures forever.
- **Overflow candidates are reduced to the outermost element.** A wide table reports the
  table, not the table plus every cell in it.

The probe samples at most 8 elements per finding. The rail shows "N of M listed" when
there are more, so the count in a finding's title and the rows under it cannot disagree.

## The device profile is published, not inferred

`lib/device.ts` is the only place the numbers live, and they come from Apple's own spec
page, not from a guess:

| | Panel | Pixels | Density | Points @3x |
|---|---|---|---|---|
| Cover | 5.4in | 1398 x 2034 | 460 ppi | **466 x 678** |
| Inner | 7.6in | 1878 x 2670 | 430 ppi | **890 x 626** |

Both resolutions divide by three exactly, which is what fixes the DPR at 3.

**Opening the device changes BOTH dimensions.** The body is 117.8mm tall either way, so an
earlier model here held the height constant and moved only the width. That is true of the
hardware in millimetres and false of the viewport in points, because the two panels are
different screens at 460 and 430 ppi. Interpolating one axis reported a viewport the device
never has. `scripts/verify.mjs` asserts both endpoints by aspect ratio.

The device is pinned to the top-left of the stage rather than centred, so opening it moves
one edge and the other stays put, the way a book opens against its spine.

## Architecture

```
app/
  page.tsx              the bench, opened on the demo page
  preview/page.tsx      the same bench at a given URL, for direct links
  demo/route.ts         the page the bench opens on, served from this origin
  api/render/           the proxy. Fetch, rewrite, serve
  api/inspect/          headers and metadata without loading the page
  icon.svg              the mark, as the favicon
  globals.css           every token, and the only place a colour is defined
components/
  device/               the bench: shell, stage, screen, address bar, workspace
  report/               the rail and its finding rows
  site/                 the mark and the wordmark
  ui/                   primitives
lib/
  device.ts             the device profile and the viewport model
  proxy.ts              HTML and CSS rewriting
  probe.ts              the injected measurement script, as a source string
  audit.ts              raw numbers to findings. Pure, no React
  net-guard.ts          server-only, refuses private addresses
  fetch-target.ts       server-only, follows redirects by hand and caps the body
  url.ts                normalisation, shared by both sides
  spring.ts             the settle and the resistance curve. No React
  demo-page.ts          the demo page source
  site.ts               the address the bench opens on
public/__fixtures/      pages with known defects, for scripts/verify.mjs
scripts/verify.mjs      drives the built app in Chrome
```

`lib/` holds no React. `lib/audit.ts` is pure, so a measurement can be scored without a
browser.

## The mark

`components/site/mark.tsx` and `app/icon.svg` are the same three shapes and must stay in
step: a near panel square to the viewer, a far panel foreshortened into a trapezoid, and
the crease between them. The far panel's outer edge is **straight and shorter** than the
spine. An outward curve there reads as a bookmark, not as perspective.

It is drawn in the accent rather than in ink so it holds on a dark browser tab as well as a
light one, and it is three shapes and one line so it survives 16px. `app/apple-icon.png` is
rendered from the same paths onto the paper ground.

## Colour

Every colour is a token in `globals.css`. No hex, no palette utilities, no arbitrary colour
values in components.

**There is one theme, and it is light.** The device screen always renders a white web page,
and dark chrome wrapped around a white rectangle is a glare sandwich. Do not add a dark
palette back without solving that first.

The paper is near-white and surfaces are pure white, so the device and the page inside it
are the only things on screen with real contrast.

**`--screen` is white and is not a surface of this interface.** That is why
`--screen-ghost` exists: the loading skeleton inside the device cannot use the interface
hover wash.

**`cn()` is configured with the theme.** tailwind-merge cannot see custom scales, so
`text-tick` and `text-ink` both look like `text-*` to it and the later one silently deletes
the earlier. `lib/utils.ts` registers both scales. Adding a token means adding it there
too, or it will work everywhere except where a size and a colour meet in one `cn()` call.

## Type

Two faces, and the split is the rule. **Plus Jakarta Sans carries everything a person
reads. IBM Plex Mono is reserved for what is read as data**: a measurement, an address, a
CSS selector. A label, a button, a heading and a sentence are language, so they are sans,
and `scripts/verify.mjs` fails the build if any multi-word run of letters renders
monospaced.

Jakarta was picked for open counters and generous sidebearings. The small end of the scale
carries positive tracking rather than negative, because this interface is read at 11 and 13
pixels and a condensed face closes up at that size.

**One sans carries every word on the surface.** A display face for the verdict alone was
tried and removed: a second family for one line reads as decoration on an instrument, and
size and weight already separate the verdict from everything under it. Hierarchy here comes
from the scale, not from a second typeface.

**Nothing is uppercased and nothing is letter-tracked as a label.** An uppercase tracked
eyebrow is a costume rather than a hierarchy, and `scripts/verify.mjs` fails the build if
any node renders `text-transform: uppercase`.

`.numeral` is the class for a mono number. `.eyebrow` is a sans panel heading. Reach for
those rather than writing `font-mono` at a call site.

## Motion

The fold gets its own timing, `--duration-fold` at 620ms with `--ease-fold`. **620ms is
the one duration in the project over 200ms, and the exception is scoped to fold motion.**
Every control keeps 150ms and 200ms.

**The fold stops are one segmented control with a sliding indicator**, not three chips that
toggle a background. One element moving reads as a switch; three backgrounds blinking reads
as three buttons. `components/ui/segmented.tsx` measures the active button after paint.

**Turning rotates the device.** The new dimensions are applied first, the device is placed
back at the angle it came from, and one animation carries it round. Two earlier versions
were wrong in opposite ways: tweening the two sizes walked through shapes no device has,
and cutting between them under a blur meant nothing moved, so it read as a glitch being
papered over. The turn uses `--ease-turn`, which eases at both ends: the device is already
on screen and moving rather than entering, and the fold's curve launches hard by design.

**The blur is scoped to turning, and only covers the reflow.** The rotation carries the
change now, so the blur is down to 5px and its only job is the moment the page inside
re-lays-out to a new width. Two identically-keyframed animations under different names,
alternated, because re-applying one class does not restart it.

**The shell and the frame inside move on one timing.** `foldMotion` is built once in the
workspace and handed to both. Without that the shell glides to its new size while the frame
snaps, and the gap paints as a band of empty screen.

**The sweep is driven frame by frame, not by a timer.** Sixteen `setFold` calls spaced by
`setTimeout` read as sixteen jerks, and the fold transition is off during a sweep so there
is nothing to smooth them over. `runSweep` runs a `requestAnimationFrame` loop and samples
overflow on a fixed grid of widths as it passes them. The verification measures the median
per-frame step rather than the largest, because one dropped frame under load says nothing
about the motion.

**The grip drag is a reposition, not a fling, so there is no momentum.** It stops where the
finger stops. Velocity is read for exactly one purpose: a hard throw toward either end
completes to that end, which is how somebody opens a real device in one motion. Releasing
within 14pt of a named stop settles into it. Anything else stays put, because the value of
the tool is every width, not three of them.

Three things the drag does that are easy to lose:

- **One state update per frame.** A pointermove can fire more often than the display
  refreshes, and every extra one re-renders the device and the page inside it. `stage.tsx`
  coalesces moves into a `requestAnimationFrame`.
- **Resistance past either end**, springing back on release. A hard stop reads as a broken
  control. `lib/spring.ts` holds both the resistance curve and the settle.
- **The settle is interruptible.** A new `pointerdown` stops the spring where it is, so a
  correction never fights an animation. `@keyframes` cannot do this, which is why the
  settle is integrated rather than declared.

**The rail is memoised.** The fold moves at 60fps and the rail does not: it depends only on
the measurement, which is deliberately not taken mid-drag. Without `memo` every frame of a
drag re-renders six cards and their element lists for no change.

**Reduced motion ships two variants, it does not delete the first one.** The rule that used
to live in `globals.css` flattened every duration to 0.01ms, which removed the meaning along
with the motion. What goes now is movement: the fold arrives instantly, the segmented
indicator crossfades instead of sliding, press scales and the turn blur do not run. What
stays is everything that carries state without travelling, which is every colour and opacity
change on the surface. `scripts/verify.mjs` asserts both variants render differently.

**The segmented indicator is a pure translate.** Segments are equal width, so the pill's
own width never animates and the whole control stays on `transform` and `opacity`. Animating
`left` and `width` worked but put a 60fps animation on the layout tier for no reason.

**Never pair a Tailwind `translate-*` class with an inline `transform`.** Tailwind v4 emits
translate as its own CSS property, so the two compose instead of one overriding the other
and the element moves twice. Symptom: something centred with `left-1/2 -translate-x-1/2`
sits exactly half its own width off to one side.

## Commands

```bash
pnpm dev          # port 4123
pnpm typecheck
pnpm lint
pnpm build
pnpm check        # the gate: lint, typecheck, build
pnpm verify       # drives the built app in Chrome, run with the server up
```

## Stack declaration

| Parameter | This project |
|---|---|
| Framework | Next.js 16.3, App Router, Turbopack |
| Package manager | `pnpm` |
| Linter and formatter | Biome |
| Icon library | `lucide-react` |
| Color system | Semantic tokens in `globals.css` only |
| Type scale | `text-tick` through `text-hero`, named in `globals.css` |
| Fonts | Plus Jakarta Sans for everything read as language, IBM Plex Mono for data only |
| Severity | Colour only what needs attention. A passing check is plain ink and carries no dot, so nothing decorates a result that is fine |
| Depth | Elevation, not outlines. Surfaces are white on a grey ground with `.hairline`, an inset 1px shadow that composites with what is under it. A real border on a white card reads as a box |
| Radius | `rounded-full` for every control, `rounded-xl` for cards, `rounded-2xl` for the stage. Radius is not a size-dependent choice |
| Theme | Light only. There is no dark palette and no toggle |
| Focus pattern | `.focus-ring`, a crease-coloured 2px ring with a paper offset |
| Button tiers | `xs` for the control strip, `md` in app surfaces |
| Class helper | `cn()` from `lib/utils.ts` |
| Primitives | `radix-ui` for the tooltip only |
| Runtime dependencies | Next, React, lucide-react, clsx, tailwind-merge, radix-ui |
| Animation library | None, deliberately. The fold is a layout change, which no library makes cheaper, and the one spring in the project is 60 lines in `lib/spring.ts`. Revisit if a mobile sheet, drag-to-reorder or shared-element transition is ever added |

## Keeping this current

Any new directory under `app/`, `components/` or `lib/` gets added to the architecture tree
with a line saying what belongs there. Any new token gets added to `globals.css` and to the
`cn()` config in `lib/utils.ts`. Any new proxy workaround gets a section saying what breaks
without it, because every one of them is invisible until a specific kind of site fails.
