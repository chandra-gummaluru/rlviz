// Floating, top-left Values-mode method badge - "Monte Carlo" (orange) while on the MC pane, or
// the resolved method title/accent (ValuesMethodMatrix) while on the Method pane. The segmented
// [Monte Carlo | <method>] switcher this class used to also render was removed as redundant with
// the top bar's own Build | Policy | Monte Carlo | Iteration mode toggle (topBar.js's
// monteCarloToggleBtn/iterationToggleBtn, which already calls enterValuesScene('mc'/'vi') and
// works as a within-Values-mode sub-view switcher too once the goal card is muted) - keeping both
// was pure duplicate UI, and removing the centered one also frees up the row for
// viSweepChip.js's stop-condition chip, which docks immediately right of this badge.
class EstimatorPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.badgeEl = null;

        this._bounds = { x: 0, width: 0 };
    }

    setup(topOffset) {
        if (this.badgeEl) return;
        this._topOffset = topOffset + 24;

        const badge = document.createElement('div');
        badge.className = 'values-method-badge';
        badge.style.top = this._topOffset + 'px';
        document.body.appendChild(badge);
        this.badgeEl = badge;

        this.refresh();
    }

    // x, width: the canvas region (same bounds ChartDock/others use).
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.badgeEl) return;
        const { x } = this._bounds;
        this.badgeEl.style.left = (x + 12) + 'px';
    }

    // Re-derives the badge's label/color from current viewModel state - called on sub-view
    // change and whenever modelKnown/observability change.
    refresh() {
        if (!this.badgeEl) return;

        const entry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
        const isMC = this.viewModel.valuesSubView === 'mc';

        if (isMC) {
            this.badgeEl.textContent = 'Monte Carlo';
            this.badgeEl.style.color = 'var(--accent-orange)';
            this.badgeEl.style.borderColor = 'var(--accent-orange)';
        } else {
            this.badgeEl.textContent = entry.title;
            this.badgeEl.style.color = `var(--accent-${entry.accent})`;
            this.badgeEl.style.borderColor = `var(--accent-${entry.accent})`;
        }
    }

    show() {
        if (this.badgeEl) this.badgeEl.style.display = '';
    }

    hide() {
        if (this.badgeEl) this.badgeEl.style.display = 'none';
    }
}
