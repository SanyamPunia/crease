# Crease

A layout test bench for the iPhone Duo. Paste a URL and the site loads inside a device that
folds, at every width between the 466pt cover display and the 890pt inner display, while a
probe inside the page reports what breaks.

## What it checks

| Check | What fails it |
|---|---|
| Viewport | No viewport meta, a pinned pixel width, or zoom locked off |
| Overflow | The document scrolls sideways, with the elements responsible listed |
| Fold | No width breakpoint between 466 and 890, so opening the device only stretches |
| Tap targets | Controls under 44 by 44 points |
| Images | Media wider than the screen |
| Text | Rendered text below 12px |

Hover a listed element and it lights up inside the device. Click it and the page scrolls to
it.

## Why it is not an iframe

A plain iframe lays every page out at the frame's width, which silently reflows a page that
has no viewport meta and passes it. A real phone lays that page out at 980px and zooms the
whole thing out to fit, and that is the most common reason a site is unusable on a phone.

This reproduces the real behaviour: the frame is sized to the width the document actually
lays out at, then scaled to the screen.

Getting this wrong does not look like a bug. It looks like a working tool that says
everything is fine.

## How a page gets in

1. **Fetch.** Requested with an iPhone user agent, with framing headers dropped, so sites
   that refuse to be embedded still load.
2. **Rewrite.** HTML and stylesheets are re-served from this origin, which makes the page
   same-origin with the bench. That is what lets its media queries be read and its
   elements be pointed at.
3. **Measure.** An injected probe reads live layout at every width and posts the numbers
   back.

Requests that resolve to a private address are refused, so the proxy cannot be pointed at
the network the server sits in.

## Deploying it

The proxy serves pages from this app's own origin, which is what makes their media queries
readable and their elements addressable. That means a page under test runs its own
JavaScript on this origin, so deploy it on a domain that does nothing else: no auth, no
cookies, no second product.

`app/robots.ts` keeps crawlers off `/api/` and `/preview`. The render route is an open
proxy, so a public deployment wants a platform rate limit on it.

## Controls

| Key | Action |
|---|---|
| `1` `2` `3` | Cover, half, full |
| `O` | Turn the device |
| `S` | Sweep every width and record what breaks |
| `R` | Reload |

Drag the grip on the device's moving edge, or focus it and use the arrow keys.

## There is no landing page

`/` is the bench, already open on a demo page that reflows across the fold. A verdict is on
screen in under a second with nothing typed. Type over the address to test your own site.

## Running it

```bash
pnpm install
pnpm dev
```

Then, with the server up:

```bash
pnpm verify
```

`scripts/verify.mjs` drives the app in Chrome and asserts against the real DOM, including
against fixture pages in `public/__fixtures/` that have known defects.
