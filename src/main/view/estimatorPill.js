// Floating, top-center Values-mode estimator pill: [Monte Carlo | <method>], replacing
// the old toolbar's in-row hover-reveal sub-view mechanism. The right segment's label and accent
// come from the 2x2 method matrix (ValuesMethodMatrix), not an independent choice. Also owns a
// small top-left badge chip that tracks whichever pane is currently active - "Monte Carlo"
// (orange) while on the MC pane, the resolved method title/accent while on the Method pane.
class EstimatorPill {
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

        this.containerEl = null;
        this.mcBtn = null;
        this.methodBtn = null;
        this.badgeEl = null;

        this._bounds = { x: 0, width: 0 };
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset + 24;

        const container = document.createElement('div');
        container.className = 'estimator-pill';
        container.style.top = this._topOffset + 'px';
        document.body.appendChild(container);
        this.containerEl = container;

        this.mcBtn = this._createSegment('Monte Carlo', () => {
            if (this.callbacks.onSelectSubView) this.callbacks.onSelectSubView('mc');
        });

        this.methodBtn = this._createSegment('', () => {
            if (this.callbacks.onSelectSubView) this.callbacks.onSelectSubView('vi');
        });

        const badge = document.createElement('div');
        badge.className = 'values-method-badge';
        badge.style.top = this._topOffset + 'px';
        document.body.appendChild(badge);
        this.badgeEl = badge;

        this.refresh();
    }

    _createSegment(label, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'estimator-pill-btn';
        btn.textContent = label;
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => {
            e.stopPropagation();
            onClick();
        });
        this.containerEl.appendChild(btn);
        return btn;
    }

    // x, width: the canvas region (same bounds ChartDock/others use) to center the pill over.
    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl) return;
        const { x, width } = this._bounds;
        this.containerEl.style.left = (x + width / 2) + 'px';
        if (this.badgeEl) this.badgeEl.style.left = (x + 12) + 'px';
    }

    // Re-derives every active-state class/color and the method segment's label from current
    // viewModel state - called on sub-view change and whenever modelKnown/observability change.
    refresh() {
        if (!this.containerEl) return;

        const entry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
        const isMC = this.viewModel.valuesSubView === 'mc';
        const isMethod = this.viewModel.valuesSubView === 'vi';

        this.mcBtn.classList.toggle('estimator-pill-btn--active', isMC);
        this.mcBtn.style.background = isMC ? 'var(--accent-orange)' : '';
        this.mcBtn.style.color = isMC ? 'var(--color-primary-contrast)' : '';

        this.methodBtn.textContent = entry.pillLabel;
        this.methodBtn.classList.toggle('estimator-pill-btn--active', isMethod);
        this.methodBtn.style.background = isMethod ? `var(--accent-${entry.accent})` : '';
        this.methodBtn.style.color = isMethod ? 'var(--color-primary-contrast)' : '';

        if (this.badgeEl) {
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
    }

    show() {
        if (this.containerEl) this.containerEl.style.display = '';
        if (this.badgeEl) this.badgeEl.style.display = '';
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
        if (this.badgeEl) this.badgeEl.style.display = 'none';
    }
}
