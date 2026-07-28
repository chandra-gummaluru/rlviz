// Floating pill, top-RIGHT of the RIGHT (MDP graph) pane specifically, in Values -> Iteration's
// 3 split quadrants: a [Equation | Chart] segmented switch for valueIterationViewModel.rightView.
// Originally [Equation | Graph] (2026-07-17 redesign); Chart moved here from the left pane's own
// (now-removed) pill so Equation and Chart share one pill, and Graph was dropped as a selectable
// option - the live MDP graph (ValueIterationView) and this pill's own former 'graph' entry are
// kept in the codebase, just no longer reachable from here (see mainView.js's draw() dispatch,
// which still checks rightView === 'graph' explicitly rather than deleting that branch). Modeled
// directly on viLeftViewPill.js's DOM/CSS skeleton (that file itself is now unused, kept for the
// same reason). Right-edge anchored (moved from its original left-edge placement) so it clears
// the Q-table/Convergence chart cards' own header row in the Chart state.
// 'equation' is relabeled "Explain" (handoff 2's plain-language narrator, see viEquationView.js -
// the internal key stays 'equation' everywhere else in the codebase; only this button's label
// changed, to avoid touching every rightView === 'equation' check for a purely cosmetic rename).
const VI_RIGHT_VIEW_PILL_OPTIONS = [
    { key: 'equation', label: 'Explain' },
    { key: 'backward', label: 'Backward' },
    { key: 'chart',    label: 'Chart' }
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
        // +24 (not +64) - the Chart state's cards now start at topOffset+56 (see main.js's
        // setUpVISplitChrome()/mainView.js's own topInset), so +64 sat INSIDE the top card's own
        // header row instead of clearing it. +24 matches the same row height as the top-left
        // method badge/stop-condition chip, sitting cleanly above the cards instead.
        this._topOffset = topOffset + 24;

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

    // x, width: the RIGHT pane's own bounds - RIGHT-edge anchored within that region, same
    // convention as mcLeftViewPill.js/viLeftViewPill.js's own right-edge anchor.
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
        const current = this.viewModel.valueIterationViewModel ? this.viewModel.valueIterationViewModel.rightView : 'equation';

        // "Backward" (Evaluate redesign Phase 6) is only offered in the known:full quadrant (the
        // one quadrant with real per-state backup data) while a time-dependent policy is active -
        // matching the reference handoff's own "Backward appears only in π_t mode" gating.
        const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
        const backwardAvailable = quadrant === 'known:full'
            && this.viewModel.simulationState
            && this.viewModel.simulationState.isTimeDependent();
        if (this.buttons.backward) {
            this.buttons.backward.style.display = backwardAvailable ? '' : 'none';
        }
        // If Backward was showing and stopped being available (policy switched back to
        // Stationary, or the quadrant changed), fall back to Equation rather than leaving the
        // pill pointed at a hidden button / the right pane stuck on a view nothing shows anymore.
        if (!backwardAvailable && current === 'backward' && this.callbacks.onSelectRightView) {
            this.callbacks.onSelectRightView('equation');
        }

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
