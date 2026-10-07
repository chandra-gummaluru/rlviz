// Floating Values -> Method (vi) time-mode chip, right-aligned to the canvas region on the
// same row as estimatorPill.js's top-left method badge ("Value Iteration" etc.) - mirrors
// rightPanel.js's own "title top-left, status right-aligned" header-row convention.
// Leads with which time mode is active, since that's what now governs when Play/Step stop:
//   pre-init       -> "press Run to start"
//   Infinite Time  -> label + "k = <n>" formula, value = "init" or live Δ (informational only)
//   Finite Time    -> label + "t = <T-k> / T" countdown formula, value = "init" / live (orange) /
//                      "✓ done" once k reaches T (green)
// Hidden outside the Method sub-view; wired via the mode-lifecycle hooks in main.js and refreshed
// from VIPresenter's sweep-start/complete/reset callbacks.
class ViSweepChip {
    // estimatorPill: the sibling pill whose badgeEl this chip docks beside - constructed before
    // this one in main.js, so its badgeEl already exists by the time this reads its bounding rect.
    constructor(canvasViewModel, estimatorPill) {
        this.viewModel = canvasViewModel;
        this.estimatorPill = estimatorPill;
        this.containerEl = null;
        this.labelEl = null;
        this.formulaEl = null;
        this.valueEl = null;
        this.plainTextEl = null;
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

        const plainText = document.createElement('span');
        plainText.className = 'vi-sweep-chip-plain';
        container.appendChild(plainText);
        this.plainTextEl = plainText;

        const label = document.createElement('span');
        label.className = 'vi-sweep-chip-label';
        container.appendChild(label);
        this.labelEl = label;

        const formula = document.createElement('span');
        formula.className = 'vi-sweep-chip-formula';
        container.appendChild(formula);
        this.formulaEl = formula;

        const value = document.createElement('span');
        value.className = 'vi-sweep-chip-value';
        container.appendChild(value);
        this.valueEl = value;

        this.refresh();
    }

    // x, width: the canvas region (same bounds convention as EstimatorPill/McRunsPill) - anchors
    // this chip to its right edge instead of docking beside the badge.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    // Right-aligned to the canvas region, same row as estimatorPill.js's top-left method badge -
    // reads the badge's LIVE bounding rect (not a cached value) only for vertical (top) alignment,
    // so this stays correct across quadrant changes that resize the badge's text (e.g.
    // "Value Iteration" vs "PO Q-Learning").
    _applyLayout() {
        if (!this.containerEl) return;
        const badgeEl = this.estimatorPill && this.estimatorPill.badgeEl;
        let top = this._topOffset;
        if (badgeEl && badgeEl.style.display !== 'none') {
            const rect = badgeEl.getBoundingClientRect();
            if (rect.width > 0) top = rect.top;
        }

        if (!this._bounds) return;
        this.containerEl.style.left = (this._bounds.x + this._bounds.width - 12) + 'px';
        this.containerEl.style.transform = 'translateX(-100%)';
        this.containerEl.style.top = top + 'px';
    }

    refresh() {
        if (!this.containerEl) return;
        this.containerEl.classList.remove('vi-sweep-chip--done', 'vi-sweep-chip--running', 'vi-sweep-chip--plain');
        const vi = this.viewModel.valueIterationState;

        if (!vi || !vi.initialized) {
            this.containerEl.classList.add('vi-sweep-chip--plain');
            this.plainTextEl.textContent = 'press Run to start';
            this._applyLayout();
            return;
        }

        const k = vi.currentSweepIndex;

        if (vi.timeMode === 'infinite') {
            // No cap to run toward - just a live sweep counter and, once there's a previous
            // sweep to compare against, the raw max-norm delta as an informational readout (no
            // threshold, nothing to converge toward).
            this.labelEl.textContent = 'Infinite Time';
            this.formulaEl.innerHTML = KatexRenderer.render(`k = ${k}`, false);
            this.valueEl.textContent = k === 0 ? 'init' : `Δ ${(vi.getDelta(k) ?? 0).toFixed(3)}`;
        } else {
            // Countdown from T (untouched V=0) to 0 (final sweep), matching the
            // evaluateTimeIndexed()/pi_t V_horizon=0 -> V_0 convention.
            this.labelEl.textContent = 'Finite Time';
            this.formulaEl.innerHTML = KatexRenderer.render(`t = ${vi.displaySweepIndex(k)} \\,/\\, ${vi.T}`, false);
            if (k === 0) {
                this.valueEl.textContent = 'init';
                this.containerEl.classList.add('vi-sweep-chip--running');
            } else if (k >= vi.T) {
                this.valueEl.textContent = '✓ done';
                this.containerEl.classList.add('vi-sweep-chip--done');
            } else {
                this.valueEl.textContent = '';
                this.containerEl.classList.add('vi-sweep-chip--running');
            }
        }

        this._applyLayout();
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
