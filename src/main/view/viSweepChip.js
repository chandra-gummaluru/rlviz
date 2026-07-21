// Floating Values -> Method (vi) stop-condition chip, right-aligned to the canvas region on the
// same row as estimatorPill.js's top-left method badge ("Value Iteration" etc.) - mirrors
// rightPanel.js's own "title top-left, stop condition right-aligned" header-row convention.
// Leads with the convergence stop condition, never "sweep" language (Evaluate redesign Phase 4):
//   pre-init       -> "press Run to start"
//   k=0            -> label + formula, value = "init"
//   unconverged    -> label + formula, value = live Δ (orange)
//   converged      -> label + formula, value = Δ + ✓ (green)
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
        label.textContent = 'Stop condition';
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
        this.containerEl.classList.remove('vi-sweep-chip--converged', 'vi-sweep-chip--unconverged', 'vi-sweep-chip--plain');
        const vi = this.viewModel.valueIterationState;

        if (!vi || !vi.initialized) {
            this.containerEl.classList.add('vi-sweep-chip--plain');
            this.plainTextEl.textContent = 'press Run to start';
        } else {
            const epsilonStr = vi.epsilon.toFixed(3);
            const k = vi.currentSweepIndex;

            if (k === 0) {
                // No live delta yet - just the bare stop condition, same as before.
                this.formulaEl.innerHTML = KatexRenderer.render(`\\|V_{t+1} - V_t\\| < ${epsilonStr}`, false);
                this.valueEl.textContent = 'init';
            } else {
                // Live delta folded INTO the inequality (\|V_{t+1}-V_t\| = <delta> < epsilon)
                // instead of appended as a disconnected number off to the right - one coherent
                // chain the reader can follow left-to-right.
                const d = vi.getDelta(k) ?? 0;
                const deltaStr = d.toFixed(3);
                const color = vi.converged ? AppPalette.reward.positive : AppPalette.accent.yellow;
                this.formulaEl.innerHTML = KatexRenderer.render(
                    `\\|V_{t+1} - V_t\\| = \\textcolor{${color}}{${deltaStr}} < ${epsilonStr}`, false
                );
                if (vi.converged) {
                    this.valueEl.textContent = '✓';
                    this.containerEl.classList.add('vi-sweep-chip--converged');
                } else {
                    this.valueEl.textContent = '';
                    this.containerEl.classList.add('vi-sweep-chip--unconverged');
                }
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
