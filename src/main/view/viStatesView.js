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
        this._sectionsEl = null;
        this._bounds = null;
        this._renderedSweepCount = 0;
    }

    setup() {
        if (this.containerEl) return;

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
    // expectationChartView.js's updateBounds(). No independent chip to position anymore - the
    // [States|Chart] toggle is now a real pill (viLeftViewPill.js) anchored to the RIGHT pane
    // instead, positioned by main.js directly.
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

    // Forces every already-built section to be rebuilt from scratch, so known:full's diagram
    // canvases (whose colors are baked into raster pixels at build time via ViBackupDiagram,
    // unlike the flat cards' live CSS custom properties) pick up a new theme's palette - refresh()
    // itself only ever APPENDS sections for sweeps it hasn't seen yet, so a plain refresh() call
    // after a theme change would leave every already-rendered diagram canvas showing the old
    // theme's colors until the next sweep or a Reset. Preserves scroll position across the
    // rebuild (a theme toggle shouldn't feel like a navigation event) since resetting
    // _renderedSweepCount to 0 makes refresh() treat every sweep as newly-added, which would
    // otherwise trigger its own scroll-to-bottom behavior.
    rebuildAll() {
        if (!this.containerEl) return;
        const scrollTop = this._sectionsEl.scrollTop;
        this._sectionsEl.innerHTML = '';
        this._renderedSweepCount = 0;
        this.refresh();
        this._sectionsEl.scrollTop = scrollTop;
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

    // known:full (real Value Iteration) gets a rich per-state backup diagram; the other 3
    // quadrants (Belief Iteration, PO Q-Learning, Learning Iteration) keep the flat state:value
    // card - decided once per card, not per-frame, and Learning Iteration never reaches this
    // method at all (the whole States view is hidden for it).
    _buildCard(sweepIndex, stateId) {
        const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
        return quadrant === 'known:full'
            ? this._buildDiagramCard(sweepIndex, stateId)
            : this._buildFlatCard(sweepIndex, stateId);
    }

    _buildFlatCard(sweepIndex, stateId) {
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

    _buildDiagramCard(sweepIndex, stateId) {
        const card = document.createElement('div');
        card.className = 'vi-states-view-card vi-states-view-card--diagram';

        const canvas = document.createElement('canvas');
        // Fixed logical size (CSS controls display size via the card's own layout; the canvas's
        // pixel buffer is set to match at 1x - devicePixelRatio scaling is a nice-to-have not
        // needed for this static, small diagram).
        canvas.width = 220;
        canvas.height = 96;
        card.appendChild(canvas);

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const priorValues = sweepIndex > 0
            ? this.viState.getValues(sweepIndex - 1)
            : this.viState.getValues(0);
        const colors = {
            action: AppPalette.valueIteration.actionBlue,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result
        };
        ViBackupDiagram.draw(canvas, detail, priorValues, colors);

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
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
