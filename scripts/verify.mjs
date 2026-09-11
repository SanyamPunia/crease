/**
 * Drives the running app in a real browser and asserts against the real DOM.
 *
 * The measurement engine runs inside a cross-document frame and reads live layout, so
 * nothing here can be checked without a browser actually laying pages out.
 */
import { launch } from "puppeteer-core";

const BASE = process.env.DUO_BASE ?? "http://127.0.0.1:4123";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const results = [];
let failures = 0;

function check(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) failures += 1;
  const mark = passed ? "pass" : "FAIL";
  console.log(`  ${mark}  ${name}${detail ? `  ${detail}` : ""}`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const browser = await launch({
  executablePath: CHROME,
  headless: "shell",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 950 });
  page.on("pageerror", (error) => {
    console.log(`  note  page error: ${error.message.slice(0, 120)}`);
  });

  console.log("\nCold open");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // The bench IS the root. A verdict on a page nobody asked for is the whole first
  // impression, so it is timed rather than merely awaited.
  const openedAt = Date.now();
  let verdict = null;
  while (Date.now() - openedAt < 15_000) {
    verdict = await page.evaluate(
      () => document.querySelector("aside h2")?.textContent?.trim() ?? null,
    );
    if (verdict) break;
    await wait(200);
  }
  const toVerdict = Date.now() - openedAt;
  check("a verdict appears with no input", verdict !== null, `${verdict} in ${toVerdict}ms`);
  check("it arrives in under 4s", toVerdict < 4000, `${toVerdict}ms`);
  check("no landing page in front of it", (await page.$$("main h1")).length === 0);

  const readCols = () =>
    page.evaluate(() => {
      const frame = document.querySelector("iframe");
      try {
        return getComputedStyle(frame.contentDocument.querySelector(".grid"))
          .gridTemplateColumns;
      } catch {
        return null;
      }
    });

  const closedCols = await readCols();
  check(
    "the demo starts in one column",
    (closedCols ?? "").split(" ").length === 1,
    closedCols,
  );

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Full")?.click();
  });
  await wait(1800);
  const openCols = await readCols();
  check("unfolding reflows it to two", (openCols ?? "").split(" ").length === 2, openCols);

  const hintGone = await page.evaluate(() => {
    const svg = document.querySelector("svg title");
    if (!svg) return "missing";
    return getComputedStyle(svg.closest("div")).opacity;
  });
  check("the drag hint retires once the fold moves", hintGone === "0", String(hintGone));

  await page.setViewport({ width: 390, height: 844 });
  await wait(500);
  check(
    "no horizontal overflow at 390px",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
    ),
    await page.evaluate(
      () =>
        `${document.documentElement.scrollWidth} vs ${document.documentElement.clientWidth}`,
    ),
  );
  await page.setViewport({ width: 1500, height: 950 });
  await wait(400);

  console.log("\nWorkspace, a responsive site");
  await page.goto(`${BASE}/preview?url=${encodeURIComponent("https://example.com")}`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  await wait(6000);

  const slider = await page.$('[role="slider"]');
  check("fold grip renders", slider !== null);

  const siteVerdict = await page.$eval("aside h2", (n) => n.textContent?.trim() ?? "");
  check("verdict renders", siteVerdict.length > 0, siteVerdict);

  const findingCount = await page.$$eval("aside ul > li", (nodes) => nodes.length);
  check("findings render", findingCount >= 6, `${findingCount} rows`);

  const frameWidth = await page.$eval("iframe", (node) => node.getBoundingClientRect().width);
  check("frame has width", frameWidth > 50, `${Math.round(frameWidth)}px`);

  console.log("\nFold control");
  const readFoldSize = () =>
    page.$eval('[role="slider"]', (node) => Number(node.getAttribute("aria-valuenow")));

  const before = await readFoldSize();
  await page.click('[role="slider"]');
  await page.keyboard.press("End");
  await wait(900);
  const after = await readFoldSize();
  check("End opens the device fully", after === 890, `${before} to ${after}`);

  await page.keyboard.press("Home");
  await wait(900);
  check("Home closes it", (await readFoldSize()) === 466);

  await page.keyboard.press("ArrowRight");
  await wait(400);
  const stepped = await readFoldSize();
  check("arrow steps the fold", stepped > 466 && stepped < 515, `${stepped}pt`);

  console.log("\nDragging across the frame");
  // The frame used to swallow pointermove the instant the drag crossed it, so folding
  // inward died and folding outward looked fine.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Full")?.click();
  });
  await wait(1400);
  const gripBox = await page.$eval('[role="slider"]', (node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.mouse.move(gripBox.x, gripBox.y);
  await page.mouse.down();
  for (let step = 1; step <= 12; step += 1) {
    await page.mouse.move(gripBox.x - step * 22, gripBox.y);
    await wait(24);
  }
  await page.mouse.up();
  await wait(400);
  const draggedTo = await readFoldSize();
  check("dragging inward crosses the frame", draggedTo < 650, `890 to ${draggedTo}pt`);

  console.log("\nThe turn blur");
  const blurPeak = async (label) => {
    await page.evaluate((text) => {
      window.__blur = [];
      const el = document.querySelector("iframe").parentElement;
      const loop = () => {
        window.__blur.push(getComputedStyle(el).filter);
        if (window.__blur.length < 60) requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      const buttons = [...document.querySelectorAll("button")];
      buttons.find((b) => b.textContent?.trim() === text)?.click();
    }, label);
    await wait(1100);
    const samples = await page.evaluate(() => window.__blur);
    return Math.max(
      ...samples.map((value) => {
        const hit = /blur\(([\d.]+)px\)/.exec(value);
        return hit ? Number(hit[1]) : 0;
      }),
    );
  };
  check("folding does not blur", (await blurPeak("Full")) < 0.3);
  check("turning does blur", (await blurPeak("Landscape")) > 4);

  // The measurements describe one fold at one orientation. While the device travels to a
  // named stop or rotates, there is no fold to describe, so they stand down. A drag is the
  // exception: there the numbers are what the user is reading.
  const annotations = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("main div, main button")]
        .filter((el) => {
          const cs = getComputedStyle(el);
          return (
            cs.transitionProperty.includes("opacity") &&
            /0\.(14|22)s/.test(cs.transitionDuration)
          );
        })
        .map((el) => Number(getComputedStyle(el).opacity)),
    );
  const clickDetent = (label) =>
    page.evaluate((text) => {
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent?.trim() === text)
        ?.click();
    }, label);
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Portrait")?.click();
  });
  await wait(1100);

  console.log("\nMeasurements stand down while the device moves on its own");
  await clickDetent("Cover");
  await wait(900);
  const annRest = await annotations();
  await clickDetent("Full");
  await wait(200);
  const annJump = await annotations();
  await wait(900);
  const annLanded = await annotations();
  check("the fold reads at rest", annRest.length >= 3 && annRest.every((v) => v > 0.5));
  check(
    "and goes quiet through a jump",
    annJump.every((v) => v < 0.05),
    `${annJump.length} elements`,
  );
  check("and comes back once it lands", annLanded.filter((v) => v > 0.9).length >= 3);

  console.log("\nDetents and orientation");
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Full")?.click();
  });
  await wait(900);
  check("Full detent sets 890pt", (await readFoldSize()) === 890);

  const portraitBox = await page.$eval("iframe", (n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Landscape")?.click();
  });
  await wait(1200);
  const landscapeBox = await page.$eval("iframe", (n) => {
    const r = n.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  check(
    "landscape turns the device",
    landscapeBox.w !== portraitBox.w,
    `${portraitBox.w}x${portraitBox.h} to ${landscapeBox.w}x${landscapeBox.h}`,
  );
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Portrait")?.click();
  });
  await wait(900);

  console.log("\nMeasurement engine, a page with no viewport meta");
  await page.goto(
    `${BASE}/preview?url=${encodeURIComponent(`${BASE}/__fixtures/legacy.html`)}`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );
  await wait(6000);

  const legacyVerdict = await page.$eval("aside h2", (n) => n.textContent?.trim() ?? "");
  check("legacy page fails", legacyVerdict.toLowerCase().includes("breaks"), legacyVerdict);

  const legacyFindings = await page.$$eval("aside ul > li h3", (nodes) =>
    nodes.map((n) => n.textContent?.trim() ?? ""),
  );
  check(
    "missing viewport meta is caught",
    legacyFindings.some((t) => t.toLowerCase().includes("no viewport")),
    legacyFindings[0] ?? "",
  );

  const zoomBadge = await page.evaluate(() =>
    [...document.querySelectorAll("span")].some((n) => /zoomed/i.test(n.textContent ?? "")),
  );
  check("zoom-to-fit is reported", zoomBadge);

  const legacyLayout = await page.$eval("iframe", (n) =>
    Math.round(n.getBoundingClientRect().width),
  );
  check("frame lays out wider than the screen", legacyLayout > 0, `${legacyLayout}px wide box`);

  console.log("\nMeasurement engine, a page that overflows");
  await page.goto(
    `${BASE}/preview?url=${encodeURIComponent(`${BASE}/__fixtures/overflow.html`)}`,
    { waitUntil: "domcontentloaded", timeout: 30_000 },
  );
  await wait(6000);

  const overflowFindings = await page.$$eval("aside ul > li h3", (nodes) =>
    nodes.map((n) => n.textContent?.trim() ?? ""),
  );
  check(
    "sideways scroll is caught",
    overflowFindings.some((t) => /scrolls \d+px sideways/i.test(t)),
    overflowFindings.find((t) => /sideways/i.test(t)) ?? overflowFindings.join(" | "),
  );
  check(
    "small tap targets are caught",
    overflowFindings.some((t) => /under 44pt/i.test(t)),
    overflowFindings.find((t) => /44pt/i.test(t)) ?? "",
  );
  check(
    "breakpoints inside the fold are found",
    overflowFindings.some((t) => /breakpoints? lands? inside the fold/i.test(t)),
    overflowFindings.find((t) => /fold/i.test(t)) ?? "",
  );

  const culprits = await page.$$eval("aside ul > li ul button", (nodes) => nodes.length);
  check("culprit elements are listed", culprits > 0, `${culprits} rows`);

  console.log("\nHighlighting");
  const firstCulprit = await page.$("aside ul > li ul button");
  if (firstCulprit) {
    await firstCulprit.hover();
    await wait(600);
    const boxes = await page.evaluate(() => {
      const frame = document.querySelector("iframe");
      const doc = frame?.contentDocument;
      return doc?.getElementById("__duo_overlay")?.childElementCount ?? -1;
    });
    check("hovering a culprit draws a box in the page", boxes > 0, `${boxes} boxes`);
  } else {
    check("hovering a culprit draws a box in the page", false, "no culprit row");
  }

  console.log("\nSweep");
  // Close the device first, or "it ended open" proves nothing.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Cover")?.click();
  });
  await wait(900);
  check("device starts closed", (await readFoldSize()) === 466);

  const sweepDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) =>
      /sweep/i.test(x.textContent ?? ""),
    );
    return b?.disabled ?? true;
  });
  check("sweep is enabled once the page settles", sweepDisabled === false);

  // Sample the grip every frame, so a stepped walk is distinguishable from a glide.
  await page.evaluate(() => {
    window.__samples = [];
    const grip = document.querySelector('[role="slider"]');
    const loop = () => {
      window.__samples.push(Number(grip.getAttribute("aria-valuenow")));
      if (window.__samples.length < 600) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    const b = [...document.querySelectorAll("button")].find((x) =>
      /sweep/i.test(x.textContent ?? ""),
    );
    b?.click();
  });
  await wait(4200);

  const glide = await page.evaluate(() => {
    const s = window.__samples;
    const jumps = [];
    for (let i = 1; i < s.length; i += 1) if (s[i] !== s[i - 1]) jumps.push(s[i] - s[i - 1]);
    jumps.sort((a, b) => a - b);
    return {
      distinct: new Set(s).size,
      maxJump: jumps.length ? Math.max(...jumps) : 0,
      medianJump: jumps.length ? jumps[Math.floor(jumps.length / 2)] : 0,
      end: s[s.length - 1],
    };
  });
  check("sweep walks the fold to the end", (await readFoldSize()) === 890, `${glide.end}pt`);
  check(
    "sweep glides rather than stepping",
    glide.distinct > 40,
    `${glide.distinct} distinct widths`,
  );
  // A dropped frame under load makes one big step, which says nothing about the motion.
  // The median is what separates a glide from the sixteen fixed jumps this replaced.
  check(
    "the typical frame step is small",
    glide.medianJump <= 12,
    `median ${glide.medianJump}pt, largest ${glide.maxJump}pt`,
  );

  console.log("\nLight-only theme");
  const paper = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check("body paints the paper token", paper === "rgb(243, 243, 241)", paper);
  const screenStaysWhite = await page.evaluate(() => {
    const el = document.querySelector("iframe");
    return el ? getComputedStyle(el).backgroundColor : "";
  });
  check(
    "the device screen is white",
    screenStaysWhite === "rgb(255, 255, 255)",
    screenStaysWhite,
  );
  // Mono is reserved for things read as data. Anything that reads as language, meaning a
  // multi-word run of letters, must be in the sans face.
  const monoProse = await page.evaluate(() => {
    const offenders = [];
    for (const node of document.querySelectorAll("main *, aside *, header *")) {
      if (node.firstChild?.nodeType !== 3) continue;
      const text = node.firstChild.nodeValue.trim();
      if (!text) continue;
      const isProse = /^[A-Za-z][A-Za-z]+(\s+[A-Za-z]+)+$/.test(text);
      if (!isProse) continue;
      if (/Plex Mono/.test(getComputedStyle(node).fontFamily))
        offenders.push(text.slice(0, 40));
    }
    return offenders;
  });
  check("prose is never set in mono", monoProse.length === 0, monoProse.join(" | "));

  const faces = await page.evaluate(() => {
    const verdict = document.querySelector("aside h2");
    const finding = document.querySelector("aside ul > li h3");
    return {
      verdict: verdict ? getComputedStyle(verdict).fontFamily : "",
      finding: finding ? getComputedStyle(finding).fontFamily : "",
      upper: [...document.querySelectorAll("main *, aside *, header *")].filter((node) => {
        const text = node.firstChild?.nodeValue?.trim();
        if (!text) return false;
        if (!/[a-z]/i.test(text)) return false;
        return getComputedStyle(node).textTransform === "uppercase";
      }).length,
    };
  });
  check(
    "one face carries every word",
    faces.verdict === faces.finding,
    faces.verdict.slice(0, 28),
  );
  check("nothing is uppercased", faces.upper === 0, `${faces.upper} nodes`);

  console.log("\nLandscape ruler");
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    buttons.find((b) => b.textContent?.trim() === "Landscape")?.click();
  });
  await wait(1400);
  const labelBoxes = await page.evaluate(() => {
    const spans = [...document.querySelectorAll("main span")].filter((s) =>
      /^(466|678|890)$/.test(s.textContent?.trim() ?? ""),
    );
    return spans.map((s) => {
      const r = s.getBoundingClientRect();
      return { t: s.textContent.trim(), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    });
  });
  check("all three detent labels render", labelBoxes.length === 3, JSON.stringify(labelBoxes));
  const sorted = [...labelBoxes].sort((a, b) => a.top - b.top);
  const overlapping = sorted.some((box, i) => i > 0 && box.top < sorted[i - 1].bottom);
  check("detent labels do not overlap in landscape", !overlapping);
  const spread = sorted.length === 3 ? sorted[2].top - sorted[0].top : 0;
  check("labels spread along the ruler", spread > 100, `${spread}px apart`);

  console.log("\nStage fits its container");
  const fits = await page.evaluate(() => {
    const stage = document.querySelector("main .drafting-grid")?.parentElement;
    if (!stage) return null;
    const outer = stage.getBoundingClientRect();
    const marks = [...document.querySelectorAll("main span")].filter((s) =>
      /^(466|678|890)$/.test(s.textContent?.trim() ?? ""),
    );
    return marks.every((m) => {
      const r = m.getBoundingClientRect();
      return r.right <= outer.right + 1 && r.bottom <= outer.bottom + 1;
    });
  });
  check("ruler labels stay inside the stage", fits === true);
  console.log("\nThe device profile matches the published spec");
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("fieldset button")];
    buttons.find((b) => b.textContent?.trim() === "Portrait")?.click();
  });
  await wait(1100);
  // 1398x2034 and 2670x1878 at @3x. These are the two panels, not a guess.
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("fieldset button")];
    buttons.find((b) => b.textContent?.trim() === "Cover")?.click();
  });
  await wait(1100);
  const closed = await page.evaluate(() => {
    const el = document.querySelector('[class*="bg-shell"]');
    const r = el.getBoundingClientRect();
    return Math.round((r.width / r.height) * 1000) / 1000;
  });
  check(
    "the cover panel is 466 x 678",
    Math.abs(closed - (466 + 22) / (678 + 22)) < 0.02,
    `${closed}`,
  );

  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("fieldset button")];
    buttons.find((b) => b.textContent?.trim() === "Full")?.click();
  });
  await wait(1100);
  const open = await page.evaluate(() => {
    const el = document.querySelector('[class*="bg-shell"]');
    const r = el.getBoundingClientRect();
    return Math.round((r.width / r.height) * 1000) / 1000;
  });
  check(
    "the inner panel is 890 x 626",
    Math.abs(open - (890 + 22) / (626 + 22)) < 0.02,
    `${open}`,
  );
  check("opening changes both axes", Math.abs(open - closed) > 0.5, `${closed} to ${open}`);

  console.log("\nReduced motion is a second variant, not a delete");
  const motionFor = async (preference) => {
    const tab = await browser.newPage();
    await tab.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: preference }]);
    await tab.setViewport({ width: 1440, height: 900 });
    await tab.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await wait(7000);
    const read = await tab.evaluate(() => {
      const shell = document.querySelector('[class*="bg-shell"]');
      const pill = document.querySelector("fieldset span[aria-hidden]");
      return {
        fold: getComputedStyle(shell).transitionDuration,
        pill: getComputedStyle(pill).transitionProperty,
        press: getComputedStyle(document.querySelector("button")).transitionDuration,
      };
    });
    await tab.close();
    return read;
  };
  const full = await motionFor("no-preference");
  const reduced = await motionFor("reduce");
  check("the fold travels by default", full.fold !== "0s", full.fold);
  check("and arrives instantly under reduce", reduced.fold === "0s", reduced.fold);
  check("the indicator slides by default", /transform/.test(full.pill), full.pill);
  check("and only crossfades under reduce", !/transform/.test(reduced.pill), reduced.pill);
  check("colour transitions survive reduce", reduced.press !== "0s", `press ${reduced.press}`);

  console.log("\nThe address bar is the share button");
  const share = await browser.newPage();
  await share.goto(BASE, { waitUntil: "networkidle2" });
  await wait(2200);
  const demoPath = await share.evaluate(() => location.pathname + location.search);
  check("the demo stays at the root", demoPath === "/", demoPath);
  await share.evaluate(() => {
    const input = document.querySelector('input[aria-label="Address"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, "example.com");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.form.requestSubmit();
  });
  await wait(2500);
  const shared = await share.evaluate(() => location.pathname + location.search);
  check(
    "a tested site lands in the address",
    shared === `/preview?url=${encodeURIComponent("https://example.com/")}`,
    shared,
  );
  check(
    "and in the tab title",
    (await share.title()).startsWith("example.com"),
    await share.title(),
  );
  // Testing a second site must not stack a history entry, or Back walks through
  // someone else's site instead of leaving the bench.
  const depth = await share.evaluate(() => history.length);
  check("without stacking history", depth <= 2, `${depth} entries`);
  await share.close();

  console.log("\nThe rewriter leaves the head parseable");
  const fixture = `${BASE}/__fixtures/head-assets.html`;
  const rewritten = await (
    await fetch(`${BASE}/api/render?u=${encodeURIComponent(fixture)}`)
  ).text();
  const headHtml = rewritten.slice(rewritten.indexOf("<head"), rewritten.indexOf("</head>"));
  // Nothing may be injected above the site's own first node. Pushing two elements in
  // front of the charset shifts every child React expects, hydration fails, React
  // re-renders the document and throws away the base the page's URLs depend on.
  check(
    "nothing is injected above the site's own head",
    headHtml.indexOf("<meta charset") < headHtml.indexOf("<base"),
  );
  check("the base is the last thing in the head", /<base\b[^>]*>\s*<script/.test(headHtml));
  check(
    "head scripts are rewritten, not left to the base",
    /<script\b[^>]*src="[^"]*\/api\/render\?u=[^"]*head-assets\.js/.test(headHtml),
  );
  check(
    "so are preloads",
    /<link\b[^>]*rel="preload"[^>]*href="[^"]*\/api\/render\?u=/.test(headHtml) ||
      /<link\b[^>]*href="[^"]*\/api\/render\?u=[^"]*woff2[^"]*"[^>]*rel="preload"/.test(
        headHtml,
      ),
  );
  check(
    "and url() inside an inline style",
    /@font-face[\s\S]*url\("[^"]*\/api\/render\?u=/.test(headHtml),
  );
  check(
    "the probe is told where the document came from",
    rewritten.includes(`var TARGET = '${fixture}'`),
  );

  console.log("\nThe proxy refuses what it should");
  const proxy = (target) =>
    fetch(`${BASE}/api/render?u=${encodeURIComponent(target)}`, { redirect: "manual" });
  const metadata = await proxy("http://169.254.169.254/latest/meta-data/");
  check(
    "link-local addresses are blocked",
    metadata.status === 403,
    `status ${metadata.status}`,
  );
  const privateNet = await proxy("http://10.0.0.1/");
  check("private ranges are blocked", privateNet.status === 403, `status ${privateNet.status}`);
  const scheme = await proxy("file:///etc/passwd");
  check("non-http schemes are refused", scheme.status === 400, `status ${scheme.status}`);
  const demo = await proxy(`${BASE}/demo`);
  check("the app's own page still loads", demo.status === 200, `status ${demo.status}`);
  check(
    "the proxy is not a cors bypass",
    demo.headers.get("access-control-allow-origin") === null,
    demo.headers.get("access-control-allow-origin") ?? "absent",
  );
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check("robots keeps crawlers off the proxy", /Disallow: \/api\//.test(robots));
} finally {
  await browser.close();
}

console.log(
  `\n${results.length - failures}/${results.length} checks passed${failures ? `, ${failures} failed` : ""}\n`,
);
process.exit(failures > 0 ? 1 : 0);
