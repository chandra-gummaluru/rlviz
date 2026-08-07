// Floating pill, top-right of the LEFT 52% pane specifically (not the whole canvas) in Values ->
// Monte Carlo: a [Grid | Chart] segmented switch for expectationViewModel.leftView. Modeled
// directly on treeViewPill.js (same two-option DOM/CSS skeleton) - kept as a separate file rather
// than a shared parameterized component, matching this codebase's one-file-per-floating-pill
// convention (mcRunsPill.js, treeViewPill.js, zoomPill.js are all separate files too).
const MC_LEFT_VIEW_PILL_OPTIONS = [
    { key: 'grid',  label: 'Grid' },
    { key: 'chart', label: 'Chart' }
];

class McLeftViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        // +64 (not treeViewPill's +12, which this was originally modeled on) - Values mode
        // already has estimatorPill/mcRunsPill sharing the topOffset+24 row, and this pill's
        // right-edge anchor (the LEFT PANE's ~52% boundary) sits close enough to estimatorPill's
        // centered (50%) position that sharing a row visibly overlaps both pills. Dropping to a
        // second row clears that regardless of window width.
        this._topOffset = topOffset + 64;

        const container = document.createElement('div');
        container.className = 'mc-left-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const track = document.createElement('div');
        track.className = 'mc-left-view-pill-track';
        container.appendChild(track);

        MC_LEFT_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mc-left-view-pill-btn';
            btn.textContent = opt.label;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectLeftView) this.callbacks.onSelectLeftView(opt.key);
            });
            track.appendChild(btn);
            this.buttons[opt.key] = btn;
        });

        this.refresh();
    }

    // x, width: the LEFT PANE's bounds specifically (leftW from ExpectationViewModel.splitWidths),
    // not the full canvas - right-edge anchored within that narrower region, same convention as
    // every other floating pill in this codebase.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + this._bounds.width - 12) + 'px';
        this.containerEl.style.transform = 'translateX(-100%)';
    }

    refresh() {
        if (!this.containerEl) return;
        const current = this.viewModel.expectationViewModel ? this.viewModel.expectationViewModel.leftView : 'grid';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('mc-left-view-pill-btn--active', key === current);
        });
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
