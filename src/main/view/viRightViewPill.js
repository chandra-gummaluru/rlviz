// Floating pill, top-left of the RIGHT (MDP graph) pane specifically, in Values -> Iteration's
// 3 split quadrants: a [Equation | Graph] segmented switch for valueIterationViewModel.rightView
// (2026-07-17 redesign). Modeled directly on viLeftViewPill.js (same DOM/CSS skeleton), anchored
// to the opposite (left) edge of the right pane so the two pills sit on the two facing inner
// edges of the split rather than stacking on one side.
const VI_RIGHT_VIEW_PILL_OPTIONS = [
    { key: 'equation', label: 'Equation' },
    { key: 'graph',    label: 'Graph' }
];

class ViRightViewPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        // Same +64 row-collision fix viLeftViewPill.js/mcLeftViewPill.js already established for
        // the estimatorPill/mcRunsPill row this shares vertical space with.
        this._topOffset = topOffset + 64;

        const container = document.createElement('div');
        container.className = 'vi-right-view-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const track = document.createElement('div');
        track.className = 'vi-right-view-pill-track';
        container.appendChild(track);

        VI_RIGHT_VIEW_PILL_OPTIONS.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vi-right-view-pill-btn';
            btn.textContent = opt.label;
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectRightView) this.callbacks.onSelectRightView(opt.key);
            });
            track.appendChild(btn);
            this.buttons[opt.key] = btn;
        });

        this.refresh();
        this.hide();
    }

    // x, width: the RIGHT pane's own bounds - LEFT-edge anchored within that region (opposite of
    // viLeftViewPill.js's right-edge anchor within the same region), so the two pills sit on the
    // two facing inner edges of the split.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + 12) + 'px';
    }

    refresh() {
        if (!this.containerEl) return;
        const current = this.viewModel.valueIterationViewModel ? this.viewModel.valueIterationViewModel.rightView : 'equation';
        Object.entries(this.buttons).forEach(([key, btn]) => {
            btn.classList.toggle('vi-right-view-pill-btn--active', key === current);
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
