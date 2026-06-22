const MAX_CACHE_ENTRIES = 250;

class MathRenderer {
    constructor(redrawCallback) {
        this._redrawCb = redrawCallback;
        this._cache = new Map();
        this._generation = 0;
        this._failureCounts = new Map();
        this._cssPromise = null; // Promise<string> resolved once, never cleared
    }

    // Draw a LaTeX string onto the canvas using KaTeX.
    // Returns true if image was drawn (or bounded plain-text fallback used).
    // Returns false if still loading — caller should draw its own fallback that frame.
    draw(ctx, latex, x, y, options = {}) {
        const { color = '#000000', em = 14, alpha = 255, alignX = 'center', alignY = 'middle' } = options;
        if (typeof latex !== 'string' || !latex || !ctx) return false;

        const key = this._key(latex, color, em);

        if (this._shouldUseFallback(key)) {
            this._drawPlainText(ctx, latex, x, y, { color, em, alpha, alignX, alignY });
            return true;
        }

        const entry = this._cache.get(key);
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

    // Returns accurate pixel size synchronously (KaTeX DOM measurement is synchronous).
    // Kicks off async image rendering on a cache miss.
    getCachedSize(latex, color = '#000000', em = 14) {
        if (typeof latex !== 'string' || !latex) return null;
        const key = this._key(latex, color, em);
        const entry = this._cache.get(key);
        if (entry?.state === 'ready') return { w: entry.w, h: entry.h };

        const html = this._renderHTML(latex);
        const size = this._measureKaTeX(html, em);
        if (!entry) this._startRender(key, latex, color, em);
        return size;
    }

    clear() {
        this._generation += 1;
        this._cache.clear();
        this._failureCounts.clear();
        // _cssPromise intentionally NOT cleared — KaTeX CSS never changes across sessions
    }

    // --- Private ---

    _key(latex, color, em) {
        return `${latex}||${color.toLowerCase()}||${em}`;
    }

    _startRender(key, latex, color, em) {
        this._cache.set(key, { state: 'loading' });
        const generation = this._generation;
        this._renderToImage(latex, color, em)
            .then(({ img, w, h }) => {
                if (generation !== this._generation) return;
                this._evictIfNeeded();
                this._cache.set(key, { state: 'ready', img, w, h });
                this._failureCounts.delete(key);
                if (this._redrawCb) this._redrawCb();
            })
            .catch((err) => {
                if (generation !== this._generation) return;
                this._cache.delete(key);
                const count = (this._failureCounts.get(key) || 0) + 1;
                this._failureCounts.set(key, count);
                if (count <= 2) console.warn('[MathRenderer] render failed:', latex, err);
            });
    }

    async _renderToImage(latex, color, em) {
        if (typeof katex === 'undefined' || !katex.renderToString) {
            throw new Error('KaTeX is not available');
        }

        // Call renderToString once and reuse for both measurement and SVG building
        const html = this._renderHTML(latex);
        const { w, h } = this._measureKaTeX(html, em);
        const css = await this._getCSS();

        const svgStr = [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`,
            `<foreignObject width="${w}" height="${h}">`,
            `<div xmlns="http://www.w3.org/1999/xhtml"`,
            ` style="font-size:${em}px;color:${color};display:inline-block;white-space:nowrap">`,
            `<style>${css}</style>`,
            html,
            `</div></foreignObject></svg>`
        ].join('');

        return { img: await this._blobToImage(svgStr), w, h };
    }

    _renderHTML(latex) {
        if (typeof katex === 'undefined' || !katex.renderToString) return '';
        return katex.renderToString(latex, { throwOnError: false, displayMode: false });
    }

    // Synchronous DOM measurement. Takes pre-rendered HTML to avoid double renderToString.
    // Falls back to character-count estimate if measurement returns zero (stylesheet not yet applied).
    _measureKaTeX(html, em) {
        if (!html) return this._estimateSize('', em);

        const div = document.createElement('div');
        div.style.cssText = `position:absolute;left:-10000px;top:-10000px;font-size:${em}px;visibility:hidden;white-space:nowrap`;
        div.innerHTML = html;
        document.body.appendChild(div);
        const rect = div.getBoundingClientRect();
        document.body.removeChild(div);

        const w = Math.ceil(rect.width);
        const h = Math.ceil(rect.height);

        if (w <= 1 && h <= 1) {
            // Stylesheet not yet applied — use character-count estimate
            return this._estimateSize(html, em);
        }
        return { w: Math.max(1, w), h: Math.max(1, h) };
    }

    _estimateSize(htmlOrLatex, em) {
        const plain = this._plainText(htmlOrLatex);
        return { w: Math.ceil(plain.length * em * 0.55) + 8, h: Math.ceil(em * 1.5) };
    }

    // Fetch KaTeX CSS once via async IIFE stored as a promise.
    // All concurrent callers await the same promise — no polling needed.
    _getCSS() {
        if (!this._cssPromise) {
            this._cssPromise = (async () => {
                try {
                    const cssUrl = new URL('libraries/katex/katex.min.css', document.baseURI).href;
                    const resp = await fetch(cssUrl);
                    let css = await resp.text();
                    const fontBase = new URL('libraries/katex/fonts/', document.baseURI).href;
                    css = css.replace(/url\((['"]?)fonts\//g, (_, q) => `url(${q}${fontBase}`);
                    return css;
                } catch (e) {
                    console.warn('[MathRenderer] failed to load KaTeX CSS:', e);
                    return '';
                }
            })();
        }
        return this._cssPromise;
    }

    _blobToImage(svgStr) {
        return new Promise((resolve, reject) => {
            const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG image load failed')); };
            img.src = url;
        });
    }

    _evictIfNeeded() {
        if (this._cache.size <= MAX_CACHE_ENTRIES) return;
        for (const [key, entry] of this._cache.entries()) {
            if (entry.state !== 'loading') { this._cache.delete(key); return; }
        }
    }

    _shouldUseFallback(key) { return (this._failureCounts.get(key) || 0) >= 2; }

    _alignedX(x, w, a) { return a === 'right' ? x - w : a === 'center' ? x - w / 2 : x; }
    _alignedY(y, h, a) { return a === 'bottom' ? y - h : (a === 'middle' || a === 'center') ? y - h / 2 : y; }

    _drawPlainText(ctx, latex, x, y, { color, em, alpha, alignX, alignY }) {
        const label = this._plainText(latex);
        push(); fill(color); noStroke(); textSize(em);
        textAlign(this._p5AlignX(alignX), this._p5AlignY(alignY));
        if (typeof drawingContext !== 'undefined') drawingContext.globalAlpha *= alpha / 255;
        text(label, x, y);
        pop();
    }

    _p5AlignX(a) { return a === 'left' ? LEFT : a === 'right' ? RIGHT : CENTER; }
    _p5AlignY(a) { return a === 'top' ? TOP : a === 'bottom' ? BOTTOM : CENTER; }

    _plainText(latex) {
        return latex
            .replace(/<[^>]+>/g, '')       // strip HTML tags if called with rendered HTML
            .replace(/\\text\{([^}]*)\}/g, '$1')
            .replace(/\\cdot/g, '*').replace(/\\gamma/g, 'gamma')
            .replace(/\\max/g, 'max').replace(/\\ldots/g, '...')
            .replace(/\\[;,]/g, ' ').replace(/_\{([^}]*)\}/g, '_$1')
            .replace(/\{([^{}]*)\}/g, '$1').replace(/\\/g, '')
            .replace(/\s+/g, ' ').trim();
    }
}
