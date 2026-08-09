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
    constructor(callbacks, canvasViewModel) {
        this.callbacks = callbacks;
        this.viewModel = canvasViewModel;

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
        if (this._panelEl) {
            // Anchor pill to top-left corner of the mc-panel, with a small inset.
            const rect = this._panelEl.getBoundingClientRect();
            this.containerEl.style.left = (rect.left + 10) + 'px';
            this.containerEl.style.top = (rect.top + 10) + 'px';
            this.containerEl.style.transform = '';
        } else {
            // Fallback: fixed top-left position when panel element isn't available.
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
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
