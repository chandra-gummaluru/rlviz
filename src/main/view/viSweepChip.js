// Floating, top-right Values -> Method (vi) status chip. Mirrors McRunsPill/ZoomPill's
// floating-chip pattern. Shows the live sweep count and convergence delta:
//   sweep 0        -> "sweep 0 / T · π = init"
//   unconverged    -> "sweep k / T · Δ = 0.xxxx"   (yellow)
//   converged      -> "✓ Δ < 0.01"                 (green)
// Hidden outside the Method sub-view; wired via the mode-lifecycle hooks in main.js and refreshed
// from VIPresenter's sweep-start/complete/reset callbacks.
class ViSweepChip {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.containerEl = null;
        this.textEl = null;
        this._bounds = null;
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset + 24;

        const container = document.createElement('div');
        container.className = 'vi-sweep-chip';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        const text = document.createElement('span');
        text.className = 'vi-sweep-chip-text';
        container.appendChild(text);
        this.textEl = text;

        this.refresh();
    }

    // x, width: the canvas region (same convention as McRunsPill) - anchored to its right edge.
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
        if (!this.textEl || !this.containerEl) return;
        const vi = this.viewModel.valueIterationState;
        this.containerEl.classList.remove('vi-sweep-chip--converged', 'vi-sweep-chip--unconverged');

        if (!vi || !vi.initialized) {
            this.textEl.textContent = 'press Run to start';
            return;
        }

        const k = vi.currentSweepIndex;
        const T = vi.T;

        if (vi.converged) {
            this.textEl.textContent = `✓ Δ < ${vi.epsilon.toFixed(2)}`;
            this.containerEl.classList.add('vi-sweep-chip--converged');
            return;
        }

        if (k === 0) {
            this.textEl.textContent = `sweep 0 / ${T} · π = init`;
            return;
        }

        const d = vi.getDelta(k);
        this.textEl.textContent = `sweep ${k} / ${T} · Δ = ${(d ?? 0).toFixed(4)}`;
        this.containerEl.classList.add('vi-sweep-chip--unconverged');
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
