/** The demo page the bench opens on. Served by `app/__demo/route.ts`. */
export const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kettle</title>
<style>
  :root {
    --ink: #16161a; --muted: #6a6a73; --line: #e8e8e4;
    --paper: #fff; --sunk: #f6f6f3; --accent: #1f6f4a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--paper); color: var(--ink);
    font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px; border-bottom: 1px solid var(--line);
  }
  .mark { display: flex; align-items: center; gap: 8px; font-weight: 650; letter-spacing: -0.01em; }
  .dot { width: 16px; height: 16px; border-radius: 5px; background: var(--accent); }
  .cart { font-size: 13px; color: var(--muted); }
  main { padding: 24px 20px 40px; }
  h1 { font-size: 30px; line-height: 1.12; letter-spacing: -0.025em; margin: 0 0 10px; }
  .lede { color: var(--muted); margin: 0 0 22px; max-width: 46ch; }
  .row { display: flex; gap: 10px; margin-bottom: 30px; }
  .btn {
    height: 46px; padding: 0 20px; border-radius: 10px; border: 0;
    background: var(--ink); color: #fff; font: inherit; font-weight: 600;
    display: inline-flex; align-items: center; cursor: pointer;
  }
  .btn.ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }

  /* One column closed, two open. The reflow is the whole demo. */
  .grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 16px; background: var(--sunk); }
  .swatch { height: 96px; border-radius: 9px; margin-bottom: 12px; }
  .a { background: linear-gradient(150deg, #dfe9e2, #c6d8cc); }
  .b { background: linear-gradient(150deg, #eae3d8, #dccfbc); }
  .c { background: linear-gradient(150deg, #e2e3ea, #cbcedd); }
  .card h3 { margin: 0 0 4px; font-size: 15px; letter-spacing: -0.01em; }
  .card p { margin: 0; color: var(--muted); font-size: 13px; }
  .price { float: right; font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; }

  @media (min-width: 640px) {
    main { padding: 34px 28px 52px; }
    h1 { font-size: 40px; }
    .grid { grid-template-columns: 1fr 1fr; gap: 18px; }
  }
</style>
</head>
<body>
  <header>
    <span class="mark"><span class="dot"></span>Kettle</span>
    <span class="cart">Cart (2)</span>
  </header>
  <main>
    <h1>Loose leaf, weighed to the gram.</h1>
    <p class="lede">Single-origin tea, roasted in small batches and shipped the week it is picked.</p>
    <div class="row">
      <button class="btn" type="button">Shop all</button>
      <button class="btn ghost" type="button">Our sourcing</button>
    </div>
    <div class="grid">
      <article class="card">
        <div class="swatch a"></div>
        <h3>Gyokuro <span class="price">$24</span></h3>
        <p>Shaded three weeks. Sweet, thick, deeply green.</p>
      </article>
      <article class="card">
        <div class="swatch b"></div>
        <h3>Hojicha <span class="price">$16</span></h3>
        <p>Roasted over charcoal. Toasty and low in caffeine.</p>
      </article>
      <article class="card">
        <div class="swatch c"></div>
        <h3>Silver Needle <span class="price">$31</span></h3>
        <p>First-flush buds only. Delicate, floral, pale.</p>
      </article>
      <article class="card">
        <div class="swatch a"></div>
        <h3>Sencha <span class="price">$18</span></h3>
        <p>Steamed and rolled. Grassy with a clean finish.</p>
      </article>
    </div>
  </main>
</body>
</html>
`;
