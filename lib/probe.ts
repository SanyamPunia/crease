/**
 * The script injected into every proxied page.
 *
 * The proxy serves the target from this app's own origin, so this runs same-origin with
 * the workspace. That is the whole point: `document.styleSheets[i].cssRules` is readable,
 * so the real media queries can be enumerated, and the parent can talk to the page
 * directly instead of guessing from the outside.
 *
 * Written as a source string rather than a module because it has to be inlined into
 * someone else's HTML. Keep it to plain ES5-style syntax with no template literals, the
 * whole thing is embedded in one.
 */
const SOURCE = `
(function () {
  if (window.__duoProbe) return;
  window.__duoProbe = true;

  var ORIGIN = '__APP_ORIGIN__';
  var PROXY = ORIGIN + '/api/render?u=';
  var REF = 'data-duo-ref';
  var MAX_ELEMENTS = 6000;
  var MAX_SAMPLES = 8;
  var MIN_TARGET = 44;
  var MIN_TEXT = 12;
  var seq = 0;
  var overlay = null;

  function post(payload) {
    payload.duo = true;
    try { parent.postMessage(payload, '*'); } catch (err) { /* frame is gone */ }
  }

  function absolute(value) {
    try { return new URL(value, document.baseURI).toString(); } catch (err) { return null; }
  }

  function toProxy(value) {
    var abs = absolute(value);
    if (!abs) return value;
    if (abs.indexOf(PROXY) === 0) return abs;
    if (abs.indexOf('http://') !== 0 && abs.indexOf('https://') !== 0) return value;
    return PROXY + encodeURIComponent(abs);
  }

  // The page's own address IS a proxy address, so any site that reads its location and
  // hands it back (every client-side router does) would otherwise get the proxy path
  // wrapped a second time and resolved against the site's origin.
  function unproxy(value) {
    try {
      var url = new URL(value, location.href);
      if (url.origin === location.origin && url.pathname === '/api/render') {
        var inner = url.searchParams.get('u');
        if (inner) return inner;
      }
      return url.toString();
    } catch (err) { return null; }
  }

  // Requests the page makes to its own origin would be cross-origin from here and die in
  // CORS, which breaks every client-rendered site. Route them back through the proxy.
  function isGet(method) {
    return !method || String(method).toUpperCase() === 'GET';
  }

  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      try {
        var method = (init && init.method) || (input && input.method);
        if (isGet(method)) {
          if (typeof input === 'string') input = toProxy(input);
          else if (input && typeof input.url === 'string') {
            input = new Request(toProxy(input.url), input);
          }
        }
      } catch (err) { /* hand it back untouched */ }
      return nativeFetch.call(window, input, init);
    };
  }
  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    var args = Array.prototype.slice.call(arguments);
    try { if (isGet(args[0])) args[1] = toProxy(args[1]); } catch (err) { /* leave it */ }
    return nativeOpen.apply(this, args);
  };

  // The <base> tag makes the page's own relative URLs resolve to the site's origin, which
  // is what keeps its assets loading. The History API refuses a cross-origin URL, so every
  // client-side router throws on its first route change and hydration dies with it.
  // Translating the URL back to a same-origin proxy address is what keeps those sites alive.
  function patchHistory(name) {
    var native = history[name];
    if (typeof native !== 'function') return;
    history[name] = function (state, title, url) {
      if (url === undefined || url === null) return native.call(history, state, title, url);
      // A History URL is relative to the current address, not to <base>.
      var logical = unproxy(url);
      if (!logical) return native.call(history, state, title);
      try {
        // A route change, not a document load. Saying 'navigate' here would make the
        // workspace wait for a load event that is never coming, because nothing is
        // fetching a new document.
        post({ type: 'locationchange', url: logical });
        var result = native.call(history, state, title, toProxy(logical));
        schedule(400);
        return result;
      } catch (err) {
        return native.call(history, state, title);
      }
    };
  }
  patchHistory('pushState');
  patchHistory('replaceState');

  // Keep navigation inside the device instead of replacing the workspace.
  document.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = event.target;
    var anchor = target && target.closest ? target.closest('a[href]') : null;
    if (!anchor) return;
    var href = anchor.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    var abs = absolute(href);
    if (!abs || (abs.indexOf('http://') !== 0 && abs.indexOf('https://') !== 0)) return;
    event.preventDefault();
    post({ type: 'navigate', url: abs });
    window.location.href = toProxy(abs);
  }, true);

  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.tagName) return;
    var method = (form.getAttribute('method') || 'get').toLowerCase();
    if (method !== 'get') return;
    var action = absolute(form.getAttribute('action') || document.baseURI);
    if (!action) return;
    event.preventDefault();
    var url = new URL(action);
    var data = new FormData(form);
    data.forEach(function (value, key) {
      if (typeof value === 'string') url.searchParams.set(key, value);
    });
    post({ type: 'navigate', url: url.toString() });
    window.location.href = toProxy(url.toString());
  }, true);

  function refFor(el) {
    var existing = el.getAttribute(REF);
    if (existing) return Number(existing);
    seq += 1;
    el.setAttribute(REF, String(seq));
    return seq;
  }

  function label(el) {
    var out = el.tagName.toLowerCase();
    if (el.id) out += '#' + el.id;
    else if (typeof el.className === 'string' && el.className.trim()) {
      var parts = el.className.trim().split(/\\s+/).slice(0, 2);
      out += '.' + parts.join('.');
    }
    return out.length > 44 ? out.slice(0, 44) : out;
  }

  function clipped(el) {
    var node = el.parentElement;
    while (node && node !== document.documentElement) {
      var style = getComputedStyle(node);
      if (style.overflowX !== 'visible') return true;
      if (style.position === 'fixed') return true;
      node = node.parentElement;
    }
    return false;
  }

  function readBreakpoints() {
    var widths = {};
    var unreadable = 0;
    var sheets = document.styleSheets;
    for (var i = 0; i < sheets.length; i++) {
      var rules = null;
      try { rules = sheets[i].cssRules; } catch (err) { rules = null; }
      if (!rules) { unreadable += 1; continue; }
      walkRules(rules, widths);
    }
    var list = [];
    for (var key in widths) list.push(Number(key));
    list.sort(function (a, b) { return a - b; });
    return { widths: list, unreadable: unreadable };
  }

  function addWidth(out, raw, unit) {
    var value = parseFloat(raw);
    if (!isFinite(value) || value <= 0) return;
    if (unit === 'rem' || unit === 'em') value = value * 16;
    out[Math.round(value)] = true;
  }

  function walkRules(rules, out) {
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var condition = rule.conditionText || (rule.media && rule.media.mediaText) || '';
      if (condition && condition.indexOf('width') !== -1 && condition.indexOf('print') === -1) {
        var forward = /width\\s*[:<>=]+\\s*([\\d.]+)(px|rem|em)/g;
        var backward = /([\\d.]+)(px|rem|em)\\s*[<>=]+\\s*width/g;
        var hit;
        while ((hit = forward.exec(condition))) addWidth(out, hit[1], hit[2]);
        while ((hit = backward.exec(condition))) addWidth(out, hit[1], hit[2]);
      }
      if (rule.cssRules) walkRules(rule.cssRules, out);
    }
  }

  function measure() {
    var started = Date.now();
    var root = document.documentElement;
    var clientWidth = root.clientWidth;
    var scrollWidth = Math.max(root.scrollWidth, document.body ? document.body.scrollWidth : 0);
    var offsetX = window.scrollX || window.pageXOffset || 0;

    var all = document.body ? [document.body].concat(Array.prototype.slice.call(document.body.querySelectorAll('*'))) : [];
    var count = all.length;
    var limit = Math.min(count, MAX_ELEMENTS);
    var candidates = [];
    var i;
    var el;
    var rect;

    for (i = 0; i < limit; i++) {
      el = all[i];
      rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.right + offsetX > clientWidth + 1) candidates.push(el);
    }

    var kept = [];
    for (i = 0; i < candidates.length; i++) {
      el = candidates[i];
      var style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.opacity === '0') continue;
      if (style.position === 'fixed') continue;
      if (clipped(el)) continue;
      kept.push(el);
    }

    var inner = {};
    for (i = 0; i < kept.length; i++) inner[refFor(kept[i])] = true;
    var outermost = [];
    for (i = 0; i < kept.length; i++) {
      el = kept[i];
      var parent = el.parentElement;
      var nested = false;
      while (parent) {
        var parentRef = parent.getAttribute && parent.getAttribute(REF);
        if (parentRef && inner[parentRef]) { nested = true; break; }
        parent = parent.parentElement;
      }
      if (!nested) outermost.push(el);
    }

    var overflow = [];
    for (i = 0; i < Math.min(outermost.length, MAX_SAMPLES); i++) {
      el = outermost[i];
      rect = el.getBoundingClientRect();
      overflow.push({
        ref: refFor(el),
        label: label(el),
        width: Math.round(rect.width),
        overhang: Math.round(rect.right + offsetX - clientWidth)
      });
    }
    overflow.sort(function (a, b) { return b.overhang - a.overhang; });

    var media = document.querySelectorAll('img, video, canvas, svg, iframe');
    var wideImages = [];
    for (i = 0; i < media.length && wideImages.length < MAX_SAMPLES; i++) {
      rect = media[i].getBoundingClientRect();
      if (rect.width > clientWidth + 1) {
        wideImages.push({
          ref: refFor(media[i]),
          label: label(media[i]),
          width: Math.round(rect.width),
          overhang: Math.round(rect.width - clientWidth)
        });
      }
    }

    var controls = document.querySelectorAll(
      'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"]'
    );
    var targets = [];
    var targetsTotal = 0;
    for (i = 0; i < controls.length; i++) {
      el = controls[i];
      rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      var controlStyle = getComputedStyle(el);
      if (controlStyle.visibility === 'hidden') continue;
      // Links that sit in a run of text are exempt from the minimum target size.
      if (el.tagName === 'A' && controlStyle.display === 'inline') continue;
      if (rect.width < MIN_TARGET || rect.height < MIN_TARGET) {
        targetsTotal += 1;
        if (targets.length < MAX_SAMPLES) {
          targets.push({
            ref: refFor(el),
            label: label(el),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          });
        }
      }
    }

    var textNodes = document.querySelectorAll('p, span, li, td, th, label, small, a, dd, dt, figcaption');
    var smallText = 0;
    var textLimit = Math.min(textNodes.length, 2000);
    for (i = 0; i < textLimit; i++) {
      el = textNodes[i];
      if (!el.firstChild || el.firstChild.nodeType !== 3) continue;
      if (!el.firstChild.nodeValue || !el.firstChild.nodeValue.trim()) continue;
      var size = parseFloat(getComputedStyle(el).fontSize);
      if (isFinite(size) && size > 0 && size < MIN_TEXT) smallText += 1;
    }

    var breakpoints = readBreakpoints();
    var meta = document.querySelector('meta[name="viewport" i]');

    post({
      type: 'measurement',
      data: {
        href: document.baseURI,
        title: document.title || '',
        layoutWidth: window.innerWidth,
        scrollWidth: scrollWidth,
        clientWidth: clientWidth,
        documentHeight: Math.max(root.scrollHeight, document.body ? document.body.scrollHeight : 0),
        viewportMetaRaw: meta ? meta.getAttribute('content') : null,
        overflow: overflow,
        overflowTotal: outermost.length,
        targets: targets,
        targetsTotal: targetsTotal,
        smallTextCount: smallText,
        breakpoints: breakpoints.widths,
        unreadableSheets: breakpoints.unreadable,
        wideImages: wideImages,
        elementCount: count,
        truncated: count > MAX_ELEMENTS,
        tookMs: Date.now() - started
      }
    });
  }

  function overlayRoot() {
    if (overlay && overlay.isConnected) return overlay;
    overlay = document.createElement('div');
    overlay.id = '__duo_overlay';
    overlay.setAttribute('style',
      'position:absolute;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;');
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function highlight(refs, tone) {
    var root = overlayRoot();
    root.innerHTML = '';
    if (!refs || !refs.length) return;
    var color = tone === 'warn' ? '#a8760a' : '#d1332a';
    for (var i = 0; i < refs.length; i++) {
      var el = document.querySelector('[' + REF + '="' + refs[i] + '"]');
      if (!el) continue;
      var rect = el.getBoundingClientRect();
      var box = document.createElement('div');
      box.setAttribute('style',
        'position:absolute;pointer-events:none;box-sizing:border-box;' +
        'left:' + (rect.left + window.scrollX) + 'px;' +
        'top:' + (rect.top + window.scrollY) + 'px;' +
        'width:' + rect.width + 'px;height:' + rect.height + 'px;' +
        'border:1.5px solid ' + color + ';background:' + color + '1f;');
      root.appendChild(box);
    }
  }

  var pending = null;
  var muteUntil = 0;
  function schedule(delay) {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () {
      pending = null;
      muteUntil = Date.now() + 400;
      measure();
      muteUntil = Date.now() + 400;
    }, delay);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || data.duo !== true) return;
    if (data.type === 'measure') schedule(0);
    else if (data.type === 'highlight') highlight(data.refs, data.tone);
    else if (data.type === 'reveal') {
      var el = document.querySelector('[' + REF + '="' + data.ref + '"]');
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      highlight([data.ref], data.tone);
    } else if (data.type === 'scrollTop') window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('resize', function () { highlight([]); schedule(160); });
  window.addEventListener('load', function () { schedule(120); });

  if (window.MutationObserver && document.body) {
    var observer = new MutationObserver(function () {
      if (Date.now() < muteUntil) return;
      schedule(500);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden']
    });
  }

  post({ type: 'ready', url: document.baseURI });
  schedule(document.readyState === 'complete' ? 30 : 300);
})();
`;

export function probeSource(appOrigin: string): string {
  return SOURCE.replace(/__APP_ORIGIN__/g, appOrigin);
}
