// New States view for the Iteration left pane (Phase 3b) - a real DOM component (like
// expectationChartView.js, not a p5-canvas overlay), layered over the canvas region
// mainView.js's VI draw dispatch leaves for the left pane. One section per computed sweep
// (k = 0..currentSweepIndex), newest at the bottom, each holding one card per state built
// straight from ValueIterationState.getBackupDetail() - no new domain computation. Hovering a
// section previews that sweep on the shared right-pane graph (transient); clicking pins it
// (click again to unpin) - same convention ExpectationViewModel.hoveredRun/selectedRunIndex
// established for Monte Carlo's grid, applied here to sweeps instead of runs.
class ViStatesView {
    // getSpeedScale: () => number, multiplies the staged-reveal's base pacing (1 = this view's
    // own base rate, >1 slower, <1 faster) - defaults to a fixed rate if the caller doesn't wire
    // it to the app's actual animation-speed slider (see main.js's construction call).
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel, getSpeedScale = () => 1) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;
        this.getSpeedScale = getSpeedScale;

        this.containerEl = null;
        this._sectionsEl = null;
        this._bounds = null;
        this._renderedSweepCount = 0;
        // Sweeps the user has explicitly clicked open (independent of which sweep is "live") -
        // the live sweep always shows expanded regardless of this set's contents; this set is
        // purely for re-opening older, otherwise-collapsed sweeps. Not cleared by refresh(),
        // rebuildAll(), or Reset - stale indices left behind by a Reset/theme-toggle/quadrant-
        // switch are harmless, since _applyExpansion() only ever iterates sections that actually
        // exist, so manual expansions simply persist across those events (arguably better UX than
        // losing them) rather than being reset to a "start clean" state.
        this._manuallyExpanded = new Set();
        // Sweep indices whose diagram cards have already played their staged reveal once - a
        // section that re-expands via its pill (already computed, already seen) renders instantly
        // via draw(), not drawAnimated(), so re-opening history doesn't replay the animation every
        // time.
        this._animatedSweeps = new Set();
        // Per-canvas cancel() handles from any in-flight drawAnimated() calls, so rebuildAll()
        // (theme toggle) can stop them before tearing down their canvases.
        this._revealCancels = [];
        // setTimeout handle backing _flashSection()'s brief highlight-then-fade.
        this._flashTimeout = null;
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
            // Reset (ValueIterationState.reset() sets initialized = false) lands here, not in the
            // totalSweeps-shrank branch below - a Reset always makes initialized false, so this is
            // the actual Reset detection point. Clear the already-animated tracking (mirroring
            // rebuildAll()'s own cleanup) so replaying a run after Reset stages the diagrams in
            // again instead of silently rendering every sweep instantly just because its index
            // happens to have been seen in a prior run.
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
            this._revealCancels.forEach(cancel => cancel());
            this._revealCancels = [];
            this._animatedSweeps.clear();
            return;
        }

        const totalSweeps = this.viState.totalSweeps;
        if (totalSweeps < this._renderedSweepCount) {
            // Defensive - not currently reachable (a shrinking totalSweeps while still
            // initialized doesn't happen in this codebase today), but rebuild from scratch the
            // same way, for the same reason, if it ever does.
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
            this._revealCancels.forEach(cancel => cancel());
            this._revealCancels = [];
            this._animatedSweeps.clear();
        }

        // Captured BEFORE any new section is appended (which grows scrollHeight) - only auto-
        // follow to the newest sweep if the user was already looking at the bottom, the same
        // convention a chat log uses. Without this check, every single Step during continuous
        // Play yanked the view back to the bottom even if the user had deliberately scrolled up
        // to review an earlier state's card - a real reported bug, not just a nicety.
        const wasNearBottom = this._sectionsEl.scrollHeight - this._sectionsEl.scrollTop - this._sectionsEl.clientHeight < 40;

        let addedNew = false;
        const newSections = [];
        for (let k = this._renderedSweepCount; k < totalSweeps; k++) {
            const section = this._buildSection(k);
            this._sectionsEl.appendChild(section);
            newSections.push({ sweepIndex: k, cardsEl: section._cardsEl, cardEntries: section._cardEntries });
            addedNew = true;
        }
        this._renderedSweepCount = totalSweeps;
        // Every sweep strictly before the live one has now had its cards built at least once (the
        // loop above only builds NEW sections, so any sweep reached here already went through
        // _buildDiagramCard() previously) - mark them as "already animated" so a later pill
        // re-expand renders instantly rather than replaying the stage-in. This assumes callers
        // never advance more than one sweep between refresh() calls (true today: Play/Step/Skip
        // all complete exactly one sweep per presentSweepComplete()/refresh() call) - if a future
        // change ever appends 2+ brand-new sections in one refresh() call, every one of them would
        // incorrectly animate here instead of just the truly-live one, since this loop can't tell
        // "newly built this call" apart from "already animated in an earlier call" without that
        // assumption.
        for (let k = 0; k < totalSweeps - 1; k++) this._animatedSweeps.add(k);

        // Only now that every new section is attached to the live document (so each diagram
        // canvas has a real, measurable width to fill) do we size and draw/animate its cards -
        // _buildSection() itself only constructs the DOM, deferring the actual render.
        newSections.forEach(({ sweepIndex, cardsEl, cardEntries }) => this._renderCards(cardsEl, cardEntries, sweepIndex));

        this._applyHighlight();
        this._applyExpansion();

        // Auto-scroll only when a genuinely new sweep was added AND the user was already at the
        // bottom - not on every refresh() call (Play's continuous ticking calls refresh() far
        // more often than sweeps actually advance), and never overriding a deliberate scroll-up.
        if (addedNew && wasNearBottom) {
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
        this._revealCancels.forEach(cancel => cancel());
        this._revealCancels = [];
        this._animatedSweeps.clear();
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
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            // Only past (non-live) sections are collapsible - the live sweep always stays
            // expanded, matching "only the current sweep stays large" (see _applyExpansion()).
            if (sweepIndex === this.viState.currentSweepIndex) return;
            if (this._manuallyExpanded.has(sweepIndex)) {
                this._manuallyExpanded.delete(sweepIndex);
            } else {
                this._manuallyExpanded.add(sweepIndex);
            }
            this._applyExpansion();
        });

        const cards = document.createElement('div');
        cards.className = 'vi-states-view-cards';
        // Cards are built now but appended by _renderCards() once this section is attached to the
        // live document (a diagram canvas needs real layout to measure its own width against -
        // see _buildDiagramCard()). Every card - the entire tree, for every state - is visible
        // from the very first frame; only the backward-pass animation inside each diagram (see
        // ViBackupDiagram) stages in over time, never the cards/structure themselves.
        const cardEntries = this.viState.stateIds.map(stateId => this._buildCard(sweepIndex, stateId));
        section.appendChild(cards);
        // Stashed for refresh() to pick up once this section is attached to the live document -
        // a plain property (not dataset) since it holds objects/functions, not strings.
        section._cardsEl = cards;
        section._cardEntries = cardEntries;

        // Hover/leave still preview the sweep on the shared right pane (Phase 3b's own
        // convention), scoped to the header row only - individual card clicks (state selection)
        // are a separate, more specific interaction (see _buildDiagramCard()/_buildFlatCard()).
        header.addEventListener('mouseenter', () => {
            this.viViewModel.hoveredSweepIndex = sweepIndex;
            this._applyHighlight();
            if (typeof redraw === 'function') redraw();
        });
        header.addEventListener('mouseleave', () => {
            this.viViewModel.hoveredSweepIndex = null;
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
        const { card, job } = quadrant === 'known:full'
            ? this._buildDiagramCard(sweepIndex, stateId)
            : { card: this._buildFlatCard(sweepIndex, stateId), job: null };
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            const alreadyActive = this.viViewModel.activeStateId === stateId
                && this.viViewModel.pinnedSweepIndex === sweepIndex;
            this.viViewModel.activeStateId = alreadyActive ? null : stateId;
            this.viViewModel.pinnedSweepIndex = sweepIndex;
            this._applyHighlight();
            if (this.onActiveStateChanged) this.onActiveStateChanged();
            if (typeof redraw === 'function') redraw();
        });
        return { card, job };
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

        const stateName = this.viState.stateNames[stateId] || `S${stateId}`;
        const header = document.createElement('div');
        header.className = 'vi-states-view-card-header';
        const nameEl = document.createElement('span');
        nameEl.textContent = stateName;
        const valueEl = document.createElement('span');
        header.appendChild(nameEl);
        header.appendChild(valueEl);
        card.appendChild(header);

        const canvas = document.createElement('canvas');
        // Height is fixed; width is deferred to _renderCards() (called once this card is attached
        // to the live document) and set to the card's own real, measured width via CSS
        // `width: 100%` + canvas.clientWidth - so each state's diagram stretches to fill its full
        // row instead of a fixed logical width, whatever that row's actual pane width turns out
        // to be.
        canvas.height = 140;
        card.appendChild(canvas);

        // Hovering one of the diagram's green "prior value" triangles scrolls to and flashes the
        // sweep that value actually came from (sweepIndex - 1) - ViBackupDiagram stashes
        // canvas._triangleHitRegions on every render, so this hit-tests against whatever was
        // drawn most recently rather than duplicating layout math here.
        let hoveredNextStateId = null;
        canvas.addEventListener('mousemove', (e) => {
            const regions = canvas._triangleHitRegions || [];
            const rect = canvas.getBoundingClientRect();
            const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
            const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            const hit = regions.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
            canvas.style.cursor = hit ? 'pointer' : 'default';
            if (!hit || hit.nextStateId === hoveredNextStateId) return;
            hoveredNextStateId = hit.nextStateId;
            if (sweepIndex > 0) this._flashSection(sweepIndex - 1);
        });
        canvas.addEventListener('mouseleave', () => {
            hoveredNextStateId = null;
            canvas.style.cursor = 'default';
        });

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        // Left blank until this card's own reveal actually completes (see _renderDiagramJobs()) -
        // populating it immediately would show every state's answer up front while the diagrams
        // below still trickle in one at a time, defeating the "state 0 computes V, then state 1,
        // then state 2" sequencing the reveal is meant to convey.
        valueEl.textContent = '';

        const priorValues = sweepIndex > 0
            ? this.viState.getValues(sweepIndex - 1)
            : this.viState.getValues(0);
        const colors = {
            state: AppPalette.node.state,
            action: AppPalette.node.action,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result
        };

        return { card, job: { canvas, detail, priorValues, colors, stateName, valueEl } };
    }

    // Appends and draws/animates one section's cards, called only once that section is attached
    // to the live document (so a diagram canvas's clientWidth reflects real, laid-out width).
    // cardEntries: [{card, job}] in state order, built (but not yet appended) by _buildSection().
    //
    // Every card appends immediately, for every sweep - the entire tree (every state, every
    // action, every outcome) is visible from frame one; nothing about the DOM/structure itself
    // ever stages in. For a historical or already-seen sweep (!shouldAnimate) each diagram also
    // draws fully resolved right away. For a freshly-live sweep, each diagram instead runs its own
    // backward-pass reveal (ViBackupDiagram.drawAnimated) - one state's calculation animates,
    // then (chained via its onComplete) the next state's does, matching "state 0 computes V, then
    // state 1, ..." - but every card is already sitting there in full, static form the whole time.
    // Flat cards (job === null, the other 3 quadrants) have no reveal to pace against, so they're
    // just drawn immediately regardless of shouldAnimate. Each diagram card's header V value is
    // still populated in lockstep with its own reveal completing (not upfront) - see
    // _buildDiagramCard()'s own comment for why.
    _renderCards(cardsEl, cardEntries, sweepIndex) {
        if (!cardEntries || cardEntries.length === 0) return;
        cardEntries.forEach(({ card }) => cardsEl.appendChild(card));

        const shouldAnimate = !this._animatedSweeps.has(sweepIndex);
        if (!shouldAnimate) {
            cardEntries.forEach(({ job }) => { if (job) this._drawJobStatic(job); });
            return;
        }

        const runNext = (i) => {
            if (i >= cardEntries.length) return;
            const { card, job } = cardEntries[i];
            if (!job) {
                runNext(i + 1);
                return;
            }
            job.canvas.width = Math.max(1, Math.round(job.canvas.clientWidth));
            const cancel = ViBackupDiagram.drawAnimated(
                job.canvas, job.detail, job.priorValues, job.colors, job.stateName, this.getSpeedScale(),
                () => {
                    job.valueEl.textContent = `V = ${(job.detail ? job.detail.value : 0).toFixed(2)}`;
                    // Shrinks this one card to a compact pill the instant its own calculation
                    // finishes - the next state's card (still full-size) stays the visual focus,
                    // and already-done states no longer take up space. Cleared by _applyExpansion()
                    // once this section stops being the live one (see its own comment).
                    card.classList.add('vi-states-view-card--pill');
                    runNext(i + 1);
                });
            this._revealCancels.push(cancel);
        };
        runNext(0);
    }

    _drawJobStatic(job) {
        job.canvas.width = Math.max(1, Math.round(job.canvas.clientWidth));
        ViBackupDiagram.draw(job.canvas, job.detail, job.priorValues, job.colors, job.stateName);
        job.valueEl.textContent = `V = ${(job.detail ? job.detail.value : 0).toFixed(2)}`;
    }

    // Scrolls to and briefly flashes the sweep a hovered green triangle's value actually came
    // from (see _buildDiagramCard()'s canvas mousemove handler) - the prior section IS "the prior
    // step's calculation," so surfacing it this way needs no separate tooltip/duplicate render.
    _flashSection(sweepIndex) {
        if (!this._sectionsEl) return;
        const target = Array.from(this._sectionsEl.children)
            .find(section => Number(section.dataset.sweepIndex) === sweepIndex);
        if (!target) return;
        target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        target.classList.add('vi-states-view-section--flash');
        clearTimeout(this._flashTimeout);
        this._flashTimeout = setTimeout(() => target.classList.remove('vi-states-view-section--flash'), 900);
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

    // Toggles the collapsed/expanded CSS class per section: the live sweep is always expanded;
    // everything else follows _manuallyExpanded's membership. Independent of _applyHighlight()'s
    // own hover/pin class - a section can be expanded without being the hovered/pinned one. Also
    // toggles --live, which drives the yellow-vs-gray "t = k" box color (see style.css) - yellow
    // marks only the one sweep actually being computed right now; every other sweep (including a
    // manually re-expanded historical one) reads as gray, regardless of its own expanded/collapsed
    // state.
    _applyExpansion() {
        if (!this._sectionsEl) return;
        const liveSweep = this.viState.currentSweepIndex;
        Array.from(this._sectionsEl.children).forEach(section => {
            const idx = Number(section.dataset.sweepIndex);
            const expanded = idx === liveSweep || this._manuallyExpanded.has(idx);
            section.classList.toggle('vi-states-view-section--collapsed', !expanded);
            section.classList.toggle('vi-states-view-section--live', idx === liveSweep);
            if (idx !== liveSweep) {
                // A non-live section's compact-vs-full look is entirely owned by the
                // --collapsed CSS above (toggled via its own expand/collapse click), not by the
                // transient per-card marker _renderCards() adds as each state finishes its live
                // reveal - clear it here so a manually re-expanded historical section still shows
                // its full diagrams, not leftover pills from when it was the live one.
                section.querySelectorAll('.vi-states-view-card--pill')
                    .forEach(card => card.classList.remove('vi-states-view-card--pill'));
            }
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
