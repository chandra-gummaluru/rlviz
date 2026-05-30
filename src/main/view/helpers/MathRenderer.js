class MathRenderer {
    constructor(redrawCallback) {
        this._cache = new Map(); // key → {img, w, h} | 'loading'
        this._redrawCb = redrawCallback;
    }

    // Draw LaTeX at (x, y). Returns true if drawn, false if still loading.
    // ctx: drawingContext (Canvas 2D API)
    // options: { color, em, alpha, alignX, alignY }
    //   color  — CSS color string, default '#000000'
    //   em     — approximate font size in px, default 14
    //   alpha  — 0-255, default 255, applied via globalAlpha at draw time
    //   alignX — 'left' | 'center' | 'right', default 'center'
    //   alignY — 'top'  | 'middle' | 'bottom', default 'middle'
    draw(ctx, latex, x, y, options = {}) {
        const {
            color = '#000000',
            em = 14,
            alpha = 255,
            alignX = 'center',
            alignY = 'middle'
        } = options;
        const key = `${latex}::${color}::${em}`;
        const hit = this._cache.get(key);

        if (hit === 'loading') return false;

        if (hit) {
            const prev = ctx.globalAlpha;
            ctx.globalAlpha = (alpha / 255) * prev;
            ctx.drawImage(hit.img, this._alignedX(x, hit.w, alignX), this._alignedY(y, hit.h, alignY));
            ctx.globalAlpha = prev;
            return true;
        }

        this._cache.set(key, 'loading');
        this._renderAsync(key, latex, color, em);
        return false;
    }

    // Returns {w, h} if the entry is cached and ready, null otherwise.
    getCachedSize(latex, color = '#000000', em = 14) {
        const hit = this._cache.get(`${latex}::${color}::${em}`);
        return hit && hit !== 'loading' ? { w: hit.w, h: hit.h } : null;
    }

    clear() { this._cache.clear(); }

    _alignedX(x, w, alignX) {
        if (alignX === 'left')  return x;
        if (alignX === 'right') return x - w;
        return x - w / 2; // center
    }

    _alignedY(y, h, alignY) {
        if (alignY === 'top')    return y;
        if (alignY === 'bottom') return y - h;
        return y - h / 2; // middle
    }

    async _renderAsync(key, latex, color, em) {
        try {
            // MathJax CDN loads async — delete and let the next draw retry rather
            // than leaving the entry stuck as 'loading' indefinitely.
            if (typeof MathJax === 'undefined' || typeof MathJax.tex2svgPromise !== 'function') {
                this._cache.delete(key);
                return;
            }

            const ex = em * 0.45;
            const node = await MathJax.tex2svgPromise(latex, { em, ex });
            const svgEl = node.querySelector('svg');
            if (!svgEl) { this._cache.delete(key); return; }

            // Compute pixel dimensions from MathJax's ex-unit attributes
            const wEx = parseFloat(svgEl.getAttribute('width'))  || 5;
            const hEx = parseFloat(svgEl.getAttribute('height')) || 1.5;
            const w = Math.ceil(wEx * ex) + 4;
            const h = Math.ceil(hEx * ex) + 4;
            svgEl.setAttribute('width',  `${w}px`);
            svgEl.setAttribute('height', `${h}px`);

            // Force explicit color — MathJax SVG uses currentColor by default
            svgEl.querySelectorAll('[fill="currentColor"]').forEach(el =>
                el.setAttribute('fill', color));
            svgEl.style.color = color;

            const svgStr = new XMLSerializer().serializeToString(svgEl);
            const blob   = new Blob([svgStr], { type: 'image/svg+xml' });
            const url    = URL.createObjectURL(blob);

            const img = new Image();
            img.onload = () => {
                // Trust naturalWidth/naturalHeight from the loaded image over our calculation
                this._cache.set(key, { img, w: img.naturalWidth || w, h: img.naturalHeight || h });
                URL.revokeObjectURL(url);
                this._redrawCb();
            };
            img.onerror = () => { this._cache.delete(key); URL.revokeObjectURL(url); };
            img.src = url;
        } catch (e) {
            this._cache.delete(key);
        }
    }
}
