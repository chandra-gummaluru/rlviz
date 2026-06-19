# Canvas Math Rendering (MathJax SVG) Implementation Plan

## Status

Active. This is the current plan for canvas math rendering and supersedes older MathJax/KaTeX and VI canvas declutter notes where they conflict.

The filename was corrected from `canvas-katex-rendering` because the implementation uses MathJax, not KaTeX.

## Critique Of The Previous Plan

The previous version had the right high-level direction, but it was too optimistic in several places:

- It said "no other file needs to change." That is mostly true for the first patch because current call sites already use `mathRenderer.draw(...)`, but the implementation must still be checked against `main.js`, `mainView.js`, and `valueIterationView.js` because those callers rely on p5 canvas state, transforms, alpha, and `getCachedSize()`.
- It assumed hidden-DOM measurement would be reliable. MathJax SVG width/height often use `ex` units, so measurement can return incorrect sizes if the wrapper is detached, hidden incorrectly, or missing the right font-size context. The renderer needs a built-in `ex` fallback, not a later optional patch.
- It did not restore p5/canvas alpha robustly. The current fallback mutates `drawingContext.globalAlpha` inside `push()`/`pop()`, but p5 state save does not guarantee every raw canvas property is restored in all cases. The new renderer should use `ctx.save()`/`ctx.restore()` around `drawImage()`.
- It did not handle cache clearing while async renders are in flight. If `clear()` runs during a MathJax render, an old promise can repopulate the cache with stale images. A generation token is needed.
- It serialized SVG by replacing `currentColor` globally, but did not set `xmlns`, explicit pixel dimensions, or color style attributes defensively. Some browsers are picky when loading serialized SVG through a Blob URL.
- Its verification text still described the old equation box and canvas Q-table as primary UI. The current app has a fixed status strip, an `explain_q` phase, right-panel Q table, and some legacy overlay/table helpers that may still be called in specific modes.
- It did not call out dynamic text escaping. Current badge strings interpolate state names into `\text{...}`. Names containing `\`, `{`, `}`, `_`, `%`, `&`, or `#` can break TeX unless escaped before future caller changes.
- It treated all labels as equally cacheable. Current count-up labels can change every animation frame, so caching every numeric intermediate can create many one-use SVG images and can make the visible number lag behind the animation.
- It did not define a graceful fallback policy. A renderer that fails MathJax setup should not leave every label blank forever while repeatedly retrying and logging the same error.
- It included commit instructions. Planning files should describe implementation and validation, not require a commit unless the user asks.

## Goal

Replace the p5 plain-text LaTeX fallback in `src/main/view/helpers/MathRenderer.js` with properly typeset math rendered by MathJax SVG, cached as images, and drawn onto the p5 canvas.

The public API stays the same:

```javascript
mathRenderer.draw(ctx, latex, x, y, options)
mathRenderer.getCachedSize(latex, color, em)
mathRenderer.clear()
```

## Current Code State

- `index.html` already loads local MathJax from `libraries/mathjax-tex-svg.js`.
- `index.html` already loads `src/main/view/helpers/MathRenderer.js`.
- `main.js` creates one global renderer:

```javascript
const mathRenderer = new MathRenderer(() => { if (typeof redraw === 'function') redraw(); });
```

- `main.js` already calls `mathRenderer.clear()` on mode changes.
- `mainView.js` uses `mathRenderer.draw(...)` for spinning-arrow probability labels.
- `valueIterationView.js` uses `mathRenderer.draw(...)` and `getCachedSize(...)` for VI labels, status strip text, optional equation/table overlays, Q labels, and V badges.
- The current `MathRenderer` still renders with p5 `text()` after converting LaTeX-ish strings into plain text.

## Files

- Modify: `src/main/view/helpers/MathRenderer.js`
- No caller changes should be needed for the first implementation. If verification reveals broken layout from async sizing, adjust only the affected call site after confirming the renderer cannot solve it generically.

## Implementation Requirements

### Renderer Behavior

- Cache key must include `latex`, `color`, and `em`.
- A cache miss starts one async render and returns `false`.
- A loading entry returns `false`.
- A ready entry draws the cached image and returns `true`.
- `getCachedSize()` returns the ready cached size when available.
- `getCachedSize()` should start async rendering on a miss and return a conservative estimate while loading.
- `clear()` must clear the cache and invalidate pending async renders.
- Image load completion must call the redraw callback exactly after storing a ready cache entry.
- Failed renders should delete the cache entry so later draw calls can retry.
- Repeated failures for the same key should be throttled or fall back to plain p5 text for that draw call. Do not produce an unbounded console-warning loop.
- The cache should have a conservative maximum size because animated numeric labels can produce many unique strings. A simple insertion-order cap is enough for the first patch.

Recommended initial cap:

```javascript
const MAX_CACHE_ENTRIES = 250;
```

When inserting a ready entry and the cache is over the cap, delete the oldest non-loading entry first. If every entry is loading, skip eviction until later rather than deleting in-flight state.

### MathJax Readiness

Use:

```javascript
await MathJax.startup.promise;
const out = MathJax.tex2svg(latex, { display: false });
```

Do not use `tex2svgPromise`; the local MathJax 3 bundle used by this repo previously required `startup.promise` plus synchronous `tex2svg()`.

Guard missing MathJax defensively:

```javascript
if (!window.MathJax || !MathJax.startup || !MathJax.startup.promise) {
    throw new Error('MathJax is not available');
}
```

If MathJax is unavailable, the app should still be usable. Prefer a plain-text fallback draw for that frame after a bounded failure count, using the same p5 text simplification currently in `MathRenderer._plainText(...)`. This fallback can be removed later only after browser verification proves local MathJax loading is reliable.

### SVG Extraction

`MathJax.tex2svg()` can return a wrapper such as `MJX-CONTAINER`, not necessarily the `<svg>` itself. Extract with:

```javascript
const svgEl = out.tagName?.toLowerCase() === 'svg' ? out : out.querySelector('svg');
```

Throw if no SVG is found.

### Size Measurement

The renderer should try DOM measurement first and fall back to `ex` unit parsing.

Recommended fallback:

```javascript
const EX_EM_RATIO = 0.45;
```

Measurement rules:

- Attach a clone to an off-screen measuring div with `font-size:${em}px`.
- Use `getBoundingClientRect()` on the SVG.
- If width or height is zero or non-finite, parse SVG `width`/`height` attributes, which usually look like `8.469ex`, and multiply by `em * EX_EM_RATIO`.
- Clamp width and height to at least 1.
- Add a small pixel pad only if clipping is observed. Do not add large padding by default because `getCachedSize()` drives badge layout.

### SVG Serialization

Before serializing:

- Clone the extracted SVG.
- Set `xmlns="http://www.w3.org/2000/svg"` if missing.
- Set explicit pixel `width` and `height`.
- Set `style.color = color`.
- Replace `currentColor` with the requested CSS color in the serialized string.

The renderer should support hex, rgb/rgba, and hsl/hsla strings because app colors now come from `AppPalette`.

Avoid embedding raw user-provided text into SVG outside MathJax output. Dynamic state/action names belong in caller-created TeX strings and must be escaped there before they reach the renderer.

### Canvas Drawing

Use raw canvas state save/restore:

```javascript
ctx.save();
ctx.globalAlpha *= alpha / 255;
ctx.drawImage(img, Math.round(drawX), Math.round(drawY), w, h);
ctx.restore();
```

Do not use p5 `push()`/`pop()` inside the MathJax image renderer. Callers already control p5 transforms. `ctx.drawImage()` should honor the current transform, which is correct for both world-space labels and screen-space labels after callers call `resetMatrix()`.

### Async Invalidation

Add a generation counter:

```javascript
this._generation = 0;
```

- Increment it in `clear()`.
- Capture it in `_startRender(...)`.
- When the async render resolves, store the result only if the generation still matches.

This prevents old in-flight renders from repopulating the cache after mode switches.

### Animated Numeric Labels

Current VI badge reveal code calls `mathRenderer.draw(...)` with changing strings such as:

```javascript
V_{t}(\text{name}) = 1.23
V_{t}(\text{name}) = 1.24
V_{t}(\text{name}) = 1.25
```

That can be expensive with SVG rendering because each distinct string is a cache miss. The first implementation should keep behavior correct, but verification must watch whether the count-up text appears late or stays blank during short reveal windows.

If this is visibly poor, prefer one of these follow-up fixes:

- Draw rapidly changing count-up numbers with the p5 fallback while using MathJax for stable labels.
- Quantize animated values before rendering, for example update the displayed math string every 0.05 or every few frames.
- Pre-render the final badge string for sizing and skip intermediate MathJax strings until the value is near final.

Do not broaden the first patch into a large animation rewrite unless this issue is confirmed.

### Suggested Implementation Shape

The final code does not need to match this exactly, but it should contain these pieces:

```javascript
const EX_EM_RATIO = 0.45;
const MAX_CACHE_ENTRIES = 250;

class MathRenderer {
    constructor(redrawCallback) {
        this._redrawCb = redrawCallback;
        this._cache = new Map();
        this._generation = 0;
        this._failureCounts = new Map();
    }

    draw(ctx, latex, x, y, options = {}) {
        const {
            color = '#000000',
            em = 14,
            alpha = 255,
            alignX = 'center',
            alignY = 'middle'
        } = options;

        if (typeof latex !== 'string' || !latex || !ctx) return false;

        const key = this._key(latex, color, em);
        const entry = this._cache.get(key);

        if (this._shouldUseFallback(key)) {
            this._drawPlainText(ctx, latex, x, y, { color, em, alpha, alignX, alignY });
            return true;
        }

        if (!entry) {
            this._startRender(key, latex, color, em);
            return false;
        }
        if (entry.state === 'loading') return false;

        const drawX = this._alignedX(x, entry.w, alignX);
        const drawY = this._alignedY(y, entry.h, alignY);

        ctx.save();
        ctx.globalAlpha *= alpha / 255;
        ctx.drawImage(entry.img, Math.round(drawX), Math.round(drawY), entry.w, entry.h);
        ctx.restore();
        return true;
    }

    getCachedSize(latex, color = '#000000', em = 14) {
        if (typeof latex !== 'string' || !latex) return null;

        const key = this._key(latex, color, em);
        const entry = this._cache.get(key);
        if (entry?.state === 'ready') return { w: entry.w, h: entry.h };
        if (!entry) this._startRender(key, latex, color, em);

        const plain = latex
            .replace(/\\text\{([^}]*)\}/g, '$1')
            .replace(/\\[a-zA-Z]+/g, 'X')
            .replace(/[\\{}_]/g, '');
        return { w: Math.ceil(plain.length * em * 0.55) + 8, h: Math.ceil(em * 1.5) };
    }

    clear() {
        this._generation += 1;
        this._cache.clear();
    }

    _key(latex, color, em) {
        return `${latex}||${color}||${em}`;
    }

    _startRender(key, latex, color, em) {
        this._cache.set(key, { state: 'loading' });
        const generation = this._generation;
        this._renderToImage(latex, color, em)
            .then(({ img, w, h }) => {
                if (generation !== this._generation) return;
                this._cache.set(key, { state: 'ready', img, w, h });
                this._failureCounts.delete(key);
                this._evictIfNeeded();
                if (this._redrawCb) this._redrawCb();
            })
            .catch((error) => {
                if (generation !== this._generation) return;
                this._cache.delete(key);
                this._failureCounts.set(key, (this._failureCounts.get(key) || 0) + 1);
                console.warn('[MathRenderer] render failed:', latex, error);
            });
    }

    async _renderToImage(latex, color, em) {
        if (!window.MathJax || !MathJax.startup || !MathJax.startup.promise) {
            throw new Error('MathJax is not available');
        }

        await MathJax.startup.promise;
        const out = MathJax.tex2svg(latex, { display: false });
        const svgEl = out.tagName?.toLowerCase() === 'svg' ? out : out.querySelector('svg');
        if (!svgEl) throw new Error('MathJax tex2svg returned no SVG');

        const { w, h } = this._measureSVG(out, em);
        const clone = svgEl.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('width', `${w}px`);
        clone.setAttribute('height', `${h}px`);
        clone.style.color = color;

        let svgStr = new XMLSerializer().serializeToString(clone);
        svgStr = svgStr.replace(/currentColor/g, color);

        const img = await this._blobToImage(svgStr);
        return { img, w, h };
    }

    _measureSVG(containerOrSvg, em) {
        const div = document.createElement('div');
        div.style.cssText =
            `position:absolute;left:-10000px;top:-10000px;` +
            `font-size:${em}px;visibility:hidden;white-space:nowrap`;
        div.appendChild(containerOrSvg.cloneNode(true));
        document.body.appendChild(div);

        const svg = div.querySelector('svg');
        const rect = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 };
        document.body.removeChild(div);

        let w = Math.round(rect.width);
        let h = Math.round(rect.height);

        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
            const sourceSvg = containerOrSvg.tagName?.toLowerCase() === 'svg'
                ? containerOrSvg
                : containerOrSvg.querySelector('svg');
            const wEx = parseFloat(sourceSvg?.getAttribute('width') || '0');
            const hEx = parseFloat(sourceSvg?.getAttribute('height') || '0');
            w = Math.round(wEx * em * EX_EM_RATIO);
            h = Math.round(hEx * em * EX_EM_RATIO);
        }

        return { w: Math.max(1, w), h: Math.max(1, h) };
    }

    _blobToImage(svgStr) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('SVG image load failed'));
            };
            img.src = url;
        });
    }

    _alignedX(x, w, alignX) {
        if (alignX === 'right') return x - w;
        if (alignX === 'center') return x - w / 2;
        return x;
    }

    _alignedY(y, h, alignY) {
        if (alignY === 'bottom') return y - h;
        if (alignY === 'middle' || alignY === 'center') return y - h / 2;
        return y;
    }

    _shouldUseFallback(key) {
        return (this._failureCounts.get(key) || 0) >= 2;
    }

    _evictIfNeeded() {
        if (this._cache.size <= MAX_CACHE_ENTRIES) return;
        for (const [key, entry] of this._cache.entries()) {
            if (entry.state !== 'loading') {
                this._cache.delete(key);
                return;
            }
        }
    }
}
```

The snippet omits `_drawPlainText(...)` and `_plainText(...)` bodies for brevity. Reuse the existing fallback logic from the current `MathRenderer` if bounded fallback is implemented.

## Browser Probe

Run the app through HTTP:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` and run:

```javascript
(async () => {
  await MathJax.startup.promise;
  const out = MathJax.tex2svg('V_{3}(s) = \\max_a Q(s,a)', { display: false });
  const svg = out.tagName?.toLowerCase() === 'svg' ? out : out.querySelector('svg');
  console.log('returned tag:', out.tagName);
  console.log('svg tag:', svg?.tagName);
  console.log('width:', svg?.getAttribute('width'));
  console.log('height:', svg?.getAttribute('height'));
})();
```

Then run:

```javascript
(async () => {
  await MathJax.startup.promise;
  const em = 14;
  const out = MathJax.tex2svg('V_{3}(s)', { display: false });
  const div = document.createElement('div');
  div.style.cssText = `position:absolute;left:-10000px;top:-10000px;font-size:${em}px;visibility:hidden`;
  div.appendChild(out.cloneNode(true));
  document.body.appendChild(div);
  const rect = div.querySelector('svg').getBoundingClientRect();
  console.log('measured:', rect.width, rect.height);
  document.body.removeChild(div);
})();
```

Use the results to confirm the extraction path and whether the DOM measurement or fallback is doing the real sizing work.

## Verification Checklist

- Load the app and confirm no startup console errors.
- In editor mode, confirm no raw MathJax output appears in the right panel. This checks that DOM MathJax still works.
- In simulate mode, run a graph with an action node and confirm spinning-arrow probability labels still appear, fade, and rotate with the graph.
- In Value Iteration mode, press Play and confirm:
  - timestep labels render;
  - edge `p = ...` and `r = ...` labels render;
  - status strip text renders in screen space near the bottom;
  - `Q = ?` labels appear during the `explain_q` phase;
  - `Q = ...` labels appear after values compute;
  - V badges size around the rendered text, not the old plain-text estimate after the image is ready.
- Toggle Show Calcs off and confirm V badge reveal animation still appears.
- Watch the V badge count-up specifically. If intermediate values remain blank until the final value, document that as an implementation issue and apply one of the animated-label follow-ups above.
- Run per-action mode and confirm transition terms using `\cdot` and `\gamma` render when those paths are visible.
- Switch Edit -> Simulate -> Value Iteration repeatedly and confirm no stale math images or console errors appear after cache clears.
- Test a state name containing spaces and punctuation. If TeX errors appear for names containing special TeX characters, add or reuse a caller-side `latexEscapeText()` helper before interpolating names into `\text{...}`.
- Temporarily break a simple TeX string in DevTools or add a malformed local test call and confirm failures do not spam the console every frame.
- Confirm cache size stays bounded after a VI run with animated badges.

## Known Risks

- First-frame labels disappear until their SVG image has loaded. This is expected, but it can make very short animation phases look blank if no redraw occurs after load.
- `getCachedSize()` uses an estimate before the image is ready, so V badge widths may shift once on first render.
- Cache size grows with unique numeric labels such as animated count-up V badges. If memory becomes a problem, add an LRU cap or avoid caching every count-up frame.
- A cache cap can evict useful stable labels if set too low. Start at 250 entries and adjust only after checking a larger MDP.
- Plain-text fallback after repeated failures means a broken expression may appear in simplified form instead of disappearing. This is preferable for usability, but console warnings should still make the issue diagnosable.
- MathJax SVG images may clip ascenders/descenders if width/height are too tight. Add 1-2 px padding in `_measureSVG()` only if this is observed.
- Dynamic state/action names inside LaTeX still require proper escaping at call sites. The renderer should not try to parse and rewrite arbitrary TeX.
