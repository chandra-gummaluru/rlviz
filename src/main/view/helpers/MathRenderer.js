class MathRenderer {
    constructor(redrawCallback) {
        this._redrawCb = redrawCallback;
    }

    // Draw math-like labels with p5's default text renderer.
    draw(ctx, latex, x, y, options = {}) {
        const {
            color = '#000000',
            em = 14,
            alpha = 255,
            alignX = 'center',
            alignY = 'middle'
        } = options;

        if (typeof latex !== 'string' || !latex) return false;

        const label = this._plainText(latex);

        push();
        fill(color);
        noStroke();
        textSize(em);
        textAlign(this._p5AlignX(alignX), this._p5AlignY(alignY));
        if (typeof drawingContext !== 'undefined' && drawingContext) {
            drawingContext.globalAlpha *= alpha / 255;
        }
        text(label, x, y);
        pop();

        return true;
    }

    getCachedSize(latex, color = '#000000', em = 14) {
        if (typeof latex !== 'string' || !latex) return null;
        const label = this._plainText(latex);

        push();
        textSize(em);
        const w = Math.ceil(textWidth(label)) + 4;
        pop();

        return { w, h: Math.ceil(em * 1.2) + 4 };
    }

    clear() {}

    _p5AlignX(alignX) {
        if (alignX === 'left') return LEFT;
        if (alignX === 'right') return RIGHT;
        return CENTER;
    }

    _p5AlignY(alignY) {
        if (alignY === 'top') return TOP;
        if (alignY === 'bottom') return BOTTOM;
        return CENTER;
    }

    _plainText(latex) {
        return latex
            .replace(/\\text\{([^}]*)\}/g, '$1')
            .replace(/\\cdot/g, '*')
            .replace(/\\gamma/g, 'gamma')
            .replace(/\\max/g, 'max')
            .replace(/\\ldots/g, '...')
            .replace(/\\;/g, ' ')
            .replace(/\\,/g, ' ')
            .replace(/_\{([^}]*)\}/g, '_$1')
            .replace(/\{([^{}]*)\}/g, '$1')
            .replace(/\\/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
}
