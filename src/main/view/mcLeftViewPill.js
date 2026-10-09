// Floating pill, top-LEFT of the floating mc-panel in Values -> Monte Carlo:
// a [Grid | Chart] segmented switch for expectationViewModel.leftView. Modeled
// directly on treeViewPill.js (same two-option DOM/CSS skeleton) - kept as a separate file rather
// than a shared parameterized component, matching this codebase's one-file-per-floating-pill
// convention (mcRunsPill.js, treeViewPill.js, zoomPill.js are all separate files too).
const MC_LEFT_VIEW_PILL_OPTIONS = [
    { key: 'grid',  label: 'Grid' },
    { key: 'chart', label: 'Chart' },
    { key: 'tree',  label: 'Tree' }
];

class McLeftViewPill {
    // estimatorPill: the sibling top-left "Monte Carlo" method badge (see estimatorPill.js) this
    // pill docks beside - mirrors viSweepChip.js's own estimatorPill-relative docking pattern.
    // Optional so existing/test call sites without it still fall back to the panel-relative
    // layout below.
    constructor(callbacks, canvasViewModel, estimatorPill) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;
        this.estimatorPill = estimatorPill || null;

        this.containerEl = null;
        this.buttons = {};
    }

    setup(topOffset) {
        if (this.containerEl) return;
        this._topOffset = topOffset;

        const container = document.createElement('div');
        container.className = 'mc-left-view-pill';
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

    // panelEl: the mc-panel DOM element whose top-left the pill anchors to.
    // Falls back to a fixed screen position if no panel element is given.
    updateBounds(panelEl) {
        this._panelEl = panelEl || null;
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl) return;

        // Preferred: dock immediately right of the "Monte Carlo" method badge, same row. There's
        // only ~4px of clear space between that badge's bottom (~topOffset+24 + ~30px tall) and
        // the panel's top (100px) - not enough to also stack this pill above the panel without
        // the two colliding, so this pill shares the badge's row instead of stacking over it.
        const badgeEl = this.estimatorPill && this.estimatorPill.badgeEl;
        if (badgeEl && badgeEl.style.display !== 'none') {
            const badgeRect = badgeEl.getBoundingClientRect();
            if (badgeRect.width > 0) {
                this.containerEl.style.left = (badgeRect.right + 8) + 'px';
                this.containerEl.style.top = badgeRect.top + 'px';
                this.containerEl.style.transform = '';
                return;
            }
        }

        if (this._panelEl) {
            // Fallback: dedicated strip immediately above the panel (used only if the badge
            // isn't available yet, e.g. very first layout pass before estimatorPill.setup() ran).
            const rect = this._panelEl.getBoundingClientRect();
            this.containerEl.style.left = (rect.left + 2) + 'px';
            this.containerEl.style.top = (rect.top - this.containerEl.offsetHeight - 8) + 'px';
            this.containerEl.style.transform = '';
        } else {
            // Fallback: fixed top-left position when neither the badge nor panel is available.
            this.containerEl.style.left = '22px';
            this.containerEl.style.top = ((this._topOffset || 0) + 64) + 'px';
            this.containerEl.style.transform = '';
        }
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
        // Re-run layout now that the element is actually visible: updateBounds() is typically
        // called while the pill is still display:none (e.g. from setUpMCSplitChrome() before
        // this show()), so offsetHeight read 0 at that point and _applyLayout() placed the pill
        // 8px above the panel's top edge assuming zero height — landing it *inside* the panel,
        // over the first grid row's #NN/return labels, instead of in the clear strip above it.
        this._applyLayout();
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
