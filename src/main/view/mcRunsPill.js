// Floating, top-right Values -> Monte Carlo control: "runs" label + a [4][8][16][32][64]
// segmented switch, replacing the right panel's old "Display Runs" dropdown (same options,
// same underlying expectationState.displayRuns - just relocated and restyled as a pill,
// mirroring EstimatorPill/ZoomPill's floating-chip pattern).
const MC_RUNS_PILL_OPTIONS = [12, 24, 48];

class McRunsPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset + 24;

        const container = document.createElement('div');
        container.className = 'mc-runs-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const label = document.createElement('span');
        label.className = 'mc-runs-pill-label';
        label.textContent = 'runs';
        container.appendChild(label);

        const track = document.createElement('div');
        track.className = 'mc-runs-pill-track';
        container.appendChild(track);

        MC_RUNS_PILL_OPTIONS.forEach(n => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mc-runs-pill-btn';
            btn.textContent = String(n);
            btn.addEventListener('mousedown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (this.callbacks.onSelectRuns) this.callbacks.onSelectRuns(n);
            });
            track.appendChild(btn);
            this.buttons[n] = btn;
        });

        this.refresh();
    }

    // x, width: the canvas region (same bounds convention as EstimatorPill/ChartDock) - anchored
    // to its right edge rather than centered.
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
        const current = this.viewModel.expectationState ? this.viewModel.expectationState.displayRuns : null;
        Object.entries(this.buttons).forEach(([n, btn]) => {
            btn.classList.toggle('mc-runs-pill-btn--active', Number(n) === current);
        });
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
