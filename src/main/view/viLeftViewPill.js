// Floating pill, top-right of the RIGHT (MDP graph) pane specifically, in Values -> Iteration's
// 3 split quadrants: a [States | Chart] segmented switch for valueIterationViewModel.leftView.
// Modeled directly on mcLeftViewPill.js (same DOM/CSS skeleton, same "anchored to the pane it
// doesn't control" cosmetic placement) - kept as a separate file rather than a shared
// parameterized component, matching this codebase's one-file-per-floating-pill convention.
const VI_LEFT_VIEW_PILL_OPTIONS = [
    { key: 'states', label: 'States' },
    { key: 'chart',  label: 'Chart' }
];

class ViLeftViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        // +64, matching mcLeftViewPill.js's own fix for the identical estimatorPill/mcRunsPill
        // row collision - this pill anchors to the same top-right corner those do.
        this._topOffset = topOffset + 64;

        const container = document.createElement('div');
        container.className = 'vi-left-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const track = document.createElement('div');
        track.className = 'vi-left-view-pill-track';
        container.appendChild(track);

        VI_LEFT_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vi-left-view-pill-btn';
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
        this.hide();
    }

    // x, width: the RIGHT pane's bounds (leftW, rightW from splitWidths()) - right-edge anchored
    // within that region, same convention as mcLeftViewPill.js.
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
        const current = this.viewModel.valueIterationViewModel ? this.viewModel.valueIterationViewModel.leftView : 'states';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('vi-left-view-pill-btn--active', key === current);
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
