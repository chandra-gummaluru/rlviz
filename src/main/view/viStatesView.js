// New States view for the Iteration left pane (Phase 3b) - a real DOM component (like
// expectationChartView.js, not a p5-canvas overlay), layered over the canvas region
// mainView.js's VI draw dispatch leaves for the left pane. One section per computed sweep
// (k = 0..currentSweepIndex), newest at the bottom, each holding one card per state built
// straight from ValueIterationState.getBackupDetail() - no new domain computation. Hovering a
// section previews that sweep on the shared right-pane graph (transient); clicking pins it
// (click again to unpin) - same convention ExpectationViewModel.hoveredRun/selectedRunIndex
// established for Monte Carlo's grid, applied here to sweeps instead of runs.
class ViStatesView {
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;

        this.containerEl = null;
        this._labelChipEl = null;
        this._sectionsEl = null;
        this._bounds = null;
        this._renderedSweepCount = 0;
    }

    setup() {
        if (this.containerEl) return;

        const chip = document.createElement('div');
        chip.className = 'vi-states-view-chip';
        chip.textContent = 'States';
        document.body.appendChild(chip);
        this._labelChipEl = chip;

        const container = document.createElement('div');
        container.className = 'vi-states-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const sections = document.createElement('div');
        sections.className = 'vi-states-view-sections';
        container.appendChild(sections);
        this._sectionsEl = sections;

        this.hide();
    }

    // x, y, width, height: the left pane's full box, same convention as
    // expectationChartView.js's updateBounds(). The label chip is positioned independently,
    // right-edge-anchored within the same x/width (matching mcLeftViewPill.js's own
    // right-edge-anchor convention), dropped a full row below the pane's top to clear
    // estimatorPill's own row (see _applyLayout()'s own comment for why).
    updateBounds(x, y, width, height) {
        this._bounds = { x, y, width, height };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        const { x, y, width, height } = this._bounds;
        this.containerEl.style.left = x + 'px';
        this.containerEl.style.top = y + 'px';
        this.containerEl.style.width = width + 'px';
        this.containerEl.style.height = height + 'px';
        if (this._labelChipEl) {
            this._labelChipEl.style.left = (x + width - 12) + 'px';
            // +64 (not +12) - `y` is the pane's own top edge (mainView.TOP_BARS_HEIGHT), flush
            // against the topbar's bottom edge, so a small +12 inset still lands within
            // estimatorPill's own row (topOffset+24, ~35px tall) - the LEFT pane's right edge
            // (this chip's anchor) sits close enough to estimatorPill's centered position that
            // sharing a row visibly overlaps both, the same collision mcLeftViewPill.js hit
            // against estimatorPill in Phase 3a (fixed there the same way: drop to a second row
            // that clears it regardless of window width).
            this._labelChipEl.style.top = (y + 64) + 'px';
            this._labelChipEl.style.transform = 'translateX(-100%)';
        }
    }

    // Rebuilds only the sections that don't exist yet (new sweeps since the last refresh), and
    // re-applies the hovered/pinned highlight class to every existing section - avoids tearing
    // down and rebuilding the whole scrollable list (and losing scroll position) on every redraw
    // during continuous Play.
    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        if (!this.viState || !this.viState.initialized) {
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
            return;
        }

        const totalSweeps = this.viState.totalSweeps;
        if (totalSweeps < this._renderedSweepCount) {
            // A Reset happened (history shrank) - rebuild from scratch.
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
        }

        let addedNew = false;
        for (let k = this._renderedSweepCount; k < totalSweeps; k++) {
            this._sectionsEl.appendChild(this._buildSection(k));
            addedNew = true;
        }
        this._renderedSweepCount = totalSweeps;

        this._applyHighlight();

        // Auto-scroll only when a genuinely new sweep was added, not on every refresh() call
        // (Play's continuous ticking calls refresh() far more often than sweeps actually
        // advance) - keeps the newest section in view without fighting the user for scroll
        // position mid-sweep.
        if (addedNew) {
            this._sectionsEl.scrollTop = this._sectionsEl.scrollHeight;
        }
    }

    _buildSection(sweepIndex) {
        const section = document.createElement('div');
        section.className = 'vi-states-view-section';
        section.dataset.sweepIndex = String(sweepIndex);

        const header = document.createElement('div');
        header.className = 'vi-states-view-section-header';
        header.textContent = `t = ${sweepIndex}`;
        section.appendChild(header);

        const cards = document.createElement('div');
        cards.className = 'vi-states-view-cards';
        this.viState.stateIds.forEach(stateId => {
            cards.appendChild(this._buildCard(sweepIndex, stateId));
        });
        section.appendChild(cards);

        section.addEventListener('mouseenter', () => {
            this.viViewModel.hoveredSweepIndex = sweepIndex;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });
        section.addEventListener('mouseleave', () => {
            this.viViewModel.hoveredSweepIndex = null;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });
        section.addEventListener('click', () => {
            this.viViewModel.pinnedSweepIndex =
                this.viViewModel.pinnedSweepIndex === sweepIndex ? null : sweepIndex;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });

        return section;
    }

    _buildCard(sweepIndex, stateId) {
        const card = document.createElement('div');
        card.className = 'vi-states-view-card';

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const name = this.viState.stateNames[stateId] || `S${stateId}`;
        const value = detail ? detail.value : 0;

        const nameEl = document.createElement('span');
        nameEl.className = 'vi-states-view-card-name';
        nameEl.textContent = name;
        card.appendChild(nameEl);

        const valueEl = document.createElement('span');
        valueEl.className = 'vi-states-view-card-value';
        valueEl.textContent = value.toFixed(2);
        card.appendChild(valueEl);

        return card;
    }

    // Toggles the active-highlight class on whichever section matches previewedSweepIndex - a
    // plain class list scan rather than a full rebuild, since sections themselves never change
    // once appended (only which one is marked "active" does).
    _applyHighlight() {
        if (!this._sectionsEl) return;
        const previewed = this.viViewModel.previewedSweepIndex;
        Array.from(this._sectionsEl.children).forEach(section => {
            const isActive = previewed !== null && Number(section.dataset.sweepIndex) === previewed;
            section.classList.toggle('vi-states-view-section--active', isActive);
        });
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        if (this._labelChipEl) this._labelChipEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
        if (this._labelChipEl) this._labelChipEl.style.display = 'none';
    }
}
