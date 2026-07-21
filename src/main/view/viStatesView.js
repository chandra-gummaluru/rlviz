// New States view for the Iteration left pane (Phase 3b) - a real DOM component (like
// expectationChartView.js, not a p5-canvas overlay), layered over the canvas region
// mainView.js's VI draw dispatch leaves for the left pane. One section per computed sweep
// (k = 0..currentSweepIndex), newest at the bottom, each holding one card per state built
// straight from ValueIterationState.getBackupDetail() - no new domain computation. Hovering a
// section previews that sweep on the shared right-pane graph (transient); clicking pins it
// (click again to unpin) - same convention ExpectationViewModel.hoveredRun/selectedRunIndex
// established for Monte Carlo's grid, applied here to sweeps instead of runs.
// Brief pause between the "t = k" header appearing and the first state's card populating - a real
// beat on the bare time-step box before anything else shows up, scaled by getSpeedScale() the same
// way every other reveal timing in this view is.
const VI_STATES_FREEZE_MS = 400;
// Duration of the shrink-to-pill transition a card plays the instant its own reveal completes -
// scaled by getSpeedScale(), same convention as VI_STATES_FREEZE_MS.
const VI_STATES_SHRINK_MS = 320;
// Logical (CSS-pixel) height of a diagram card's canvas - must stay in sync with the CSS rule
// sizing '.vi-states-view-card--diagram canvas' (style.css). The canvas's actual backing-buffer
// height is this value times devicePixelRatio - see _sizeDiagramCanvas().
const VI_STATES_DIAGRAM_HEIGHT = 310;

// A setTimeout wrapper supporting pause/resume - used for the pre-first-card freeze delay, since
// a plain setTimeout can't be paused/resumed natively. pause() records how much delay was left;
// resume() restarts a fresh timer for exactly that remaining amount. Both guard against redundant
// calls (paused flag) - resumeActiveReveal() calls resume() unconditionally on whatever the
// current reveal's resume happens to be, including a freeze timer that's still running and was
// never paused (e.g. the very first Play click of a brand-new sweep) - without this guard,
// resume() on an already-running timer would schedule a SECOND, duplicate setTimeout alongside
// the original pending one, eventually starting two independent, un-coordinated reveal chains for
// the same sweep.
function pausableTimeout(callback, delayMs) {
    let remaining = delayMs;
    let startedAt = Date.now();
    let paused = false;
    let handle = setTimeout(callback, delayMs);
    return {
        cancel() { clearTimeout(handle); },
        pause() {
            if (paused) return;
            paused = true;
            clearTimeout(handle);
            remaining -= (Date.now() - startedAt);
        },
        resume() {
            if (!paused) return;
            paused = false;
            startedAt = Date.now();
            handle = setTimeout(callback, Math.max(0, remaining));
        }
    };
}

class ViStatesView {
    // getSpeedScale: () => number, multiplies the staged-reveal's base pacing (1 = this view's
    // own base rate, >1 slower, <1 faster) - defaults to a fixed rate if the caller doesn't wire
    // it to the app's actual animation-speed slider (see main.js's construction call).
    // onRevealProgress: called every time a live-section card finishes revealing (see
    // _revealOneCard()'s finish()) - unlike the sweep-level canStep/canPlay gate (which only ever
    // changes in response to an explicit Step/Skip/Play/Reset click, so refreshVIButtons() being
    // called right after each of those was always enough), canRevealNextState()/
    // canSkipCurrentState() can flip from false back to true purely because time passed and a
    // card's own animation finished ON ITS OWN - nothing else would ever tell topBar to re-check
    // Step/Skip's disabled state without this hook. Defaults to a no-op so this file stays
    // agnostic of any specific button-refresh mechanism.
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel, getSpeedScale = () => 1, onRevealProgress = () => {}) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;
        this.getSpeedScale = getSpeedScale;
        this.onRevealProgress = onRevealProgress;

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
        // Whichever sweep's card-by-card reveal is currently in flight (at most one, ever) -
        // { sweepIndex, cardEntries, cancel }. If a NEW sweep arrives (e.g. continuous Play
        // advancing faster than one sweep's now much more elaborate per-transition animation can
        // finish), refresh() cancels this and instantly snaps its remaining cards to their
        // resolved state before starting the new sweep's own reveal - without this, two sweeps'
        // reveal chains could run concurrently, each still mutating its own (superseded) canvases,
        // which read as the view randomly jumping between unrelated time steps.
        this._activeReveal = null;
        // The most-recently-appended section's own cards/cursor - persists ACROSS separate
        // Step/Skip click-driven calls (unlike a closure-local loop index), so "reveal one state,
        // then stop" can resume from wherever the previous click left off. _liveCursor is the
        // index into _liveCardEntries of the next NOT-YET-revealed card; _liveCursor >=
        // _liveCardEntries.length means the live section is fully revealed (Step/Skip disabled -
        // see canRevealNextState()/canSkipCurrentState()).
        this._liveCardsEl = null;
        this._liveCardEntries = null;
        this._liveSweepIndex = null;
        this._liveCursor = 0;
        // setTimeout handle backing _flashCard()'s brief highlight-then-fade.
        this._flashTimeout = null;
        // position:fixed overlay div (lazily created, see _ensureFlyOverlay()) holding any
        // in-flight "fly the prior value to the triangle" chips - mirrors
        // rewardParticleSystem.js's own long-lived-overlay convention.
        this._flyOverlayEl = null;
        // Chips currently animating from a prior card to a diagram's triangle anchor - tracked so
        // _cancelActiveReveal() can force them all to clean up instead of leaving orphaned
        // floating numbers on screen.
        this._activeFlyChips = [];
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
            this._cancelActiveReveal();
            this._animatedSweeps.clear();
            this._liveCardsEl = null;
            this._liveCardEntries = null;
            this._liveSweepIndex = null;
            this._liveCursor = 0;
            return;
        }

        const totalSweeps = this.viState.totalSweeps;
        if (totalSweeps < this._renderedSweepCount) {
            // Defensive - not currently reachable (a shrinking totalSweeps while still
            // initialized doesn't happen in this codebase today), but rebuild from scratch the
            // same way, for the same reason, if it ever does.
            this._sectionsEl.innerHTML = '';
            this._renderedSweepCount = 0;
            this._cancelActiveReveal();
            this._animatedSweeps.clear();
            this._liveCardsEl = null;
            this._liveCardEntries = null;
            this._liveSweepIndex = null;
            this._liveCursor = 0;
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
        newSections.forEach(({ sweepIndex, cardsEl, cardEntries }) => this._prepareLiveSection(cardsEl, cardEntries, sweepIndex));

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
        this._cancelActiveReveal();
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
            let expanding = false;
            if (this._manuallyExpanded.has(sweepIndex)) {
                this._manuallyExpanded.delete(sweepIndex);
            } else {
                this._manuallyExpanded.add(sweepIndex);
                expanding = true;
            }
            this._applyExpansion();
            if (expanding) {
                // While collapsed, a diagram canvas's clientWidth reads as 0 (display:none) -
                // redrawStaticCards() (an unrelated image-loaded callback) may have re-sized its
                // backing buffer down to that degenerate width in the meantime. _applyExpansion()
                // above already removed the --collapsed class, so clientWidth is meaningful again
                // right now - re-size+redraw every card in this section so it never shows a stale,
                // wrongly-sized buffer stretched by CSS into smeared bands.
                (section._cardEntries || []).forEach(({ job }) => { if (job) this._drawJobStatic(job); });
            }
        });

        const cards = document.createElement('div');
        cards.className = 'vi-states-view-cards';
        // Cards are built now but appended by _prepareLiveSection() once this section is attached to the
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
        // Looked up by _flashCard() to find this exact state's card within an older section.
        card.dataset.stateId = String(stateId);
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
        // Actual sizing (backing-buffer width/height, scaled by devicePixelRatio for crisp
        // rendering on HiDPI displays - see _sizeDiagramCanvas()) is deferred to _prepareLiveSection()/
        // _drawJobStatic() (called once this card is attached to the live document, so
        // clientWidth reflects real, laid-out width) - each state's diagram stretches to fill its
        // full row instead of a fixed logical width, whatever that row's actual pane width turns
        // out to be.
        card.appendChild(canvas);

        // Hovering one of the diagram's green "prior value" triangles scrolls to and flashes the
        // SPECIFIC state's card (not the whole time box) in the sweep that value actually came
        // from (sweepIndex - 1) - ViBackupDiagram stashes canvas._triangleHitRegions on every
        // render, so this hit-tests against whatever was drawn most recently rather than
        // duplicating layout math here.
        let hoveredNextStateId = null;
        canvas.addEventListener('mousemove', (e) => {
            const regions = canvas._triangleHitRegions || [];
            const rect = canvas.getBoundingClientRect();
            // Hit regions are stashed in LOGICAL (CSS-pixel) coordinates (see ViBackupDiagram's
            // _renderFrame()), not the devicePixelRatio-scaled backing buffer - compare against
            // canvas._logicalWidth/Height, not the raw canvas.width/height.
            const logicalWidth = canvas._logicalWidth || canvas.width;
            const logicalHeight = canvas._logicalHeight || canvas.height;
            const scaleX = rect.width > 0 ? logicalWidth / rect.width : 1;
            const scaleY = rect.height > 0 ? logicalHeight / rect.height : 1;
            const mx = (e.clientX - rect.left) * scaleX;
            const my = (e.clientY - rect.top) * scaleY;
            const hit = regions.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
            canvas.style.cursor = hit ? 'pointer' : 'default';
            if (!hit || hit.nextStateId === hoveredNextStateId) return;
            hoveredNextStateId = hit.nextStateId;
            if (sweepIndex > 0) this._flashCard(sweepIndex - 1, hit.nextStateId);
        });
        canvas.addEventListener('mouseleave', () => {
            hoveredNextStateId = null;
            canvas.style.cursor = 'default';
        });

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        // Left blank until this card's own reveal actually completes (see _revealOneCard()) -
        // populating it immediately would show every state's answer up front while the diagrams
        // below still trickle in one at a time, defeating the "state 0 computes V, then state 1,
        // then state 2" sequencing the reveal is meant to convey.
        valueEl.textContent = '';

        const priorValues = sweepIndex > 0
            ? this.viState.getValues(sweepIndex - 1)
            : this.viState.getValues(0);
        const rewardRange = this._rewardRange();
        const colors = {
            state: AppPalette.node.state,
            action: AppPalette.node.action,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result,
            // Same "active edge" color Graph/Tree view's own simulation reveal uses - marks
            // whichever state->action/action->outcome edge is currently mid-arithmetic.
            highlighted: AppPalette.edge.highlighted,
            // Matches EdgeViewModel's own state->action default (no policy set) edge color.
            default: AppPalette.edge.default,
            minReward: rewardRange.minReward,
            maxReward: rewardRange.maxReward
        };

        // Plain { nodeId: imageUrl|null } lookup for every node this diagram can possibly draw -
        // the state itself, every action, every outcome - built once here (this view has the real
        // graph via this.viewModel.graph) so ViBackupDiagram itself never has to know what a
        // "graph" is (same reasoning as passing `colors`/`priorValues` in as plain data).
        const images = { [stateId]: this._nodeImage(stateId) };
        if (detail && detail.actions) {
            detail.actions.forEach(action => {
                images[action.actionId] = this._nodeImage(action.actionId);
                action.transitions.forEach(t => { images[t.nextState] = this._nodeImage(t.nextState); });
            });
        }

        return { card, job: { canvas, detail, priorValues, colors, stateName, stateId, images, valueEl, gamma: this.viState.gamma } };
    }

    _nodeImage(nodeId) {
        const node = this.viewModel.graph.getNodeById(nodeId);
        return (node && node.image) || null;
    }

    // Sizes a diagram canvas's backing buffer to devicePixelRatio, so it renders as crisply as
    // Build mode's p5 canvas (which does this automatically) instead of stretching a 1x-density
    // buffer up to fill its CSS box (grainy on any HiDPI/Retina display). Stashes the LOGICAL
    // (CSS-pixel) width/height as canvas._logicalWidth/_logicalHeight - ViBackupDiagram's
    // _renderFrame() reads these (not the raw, now-larger canvas.width/height) for all its layout
    // math and its own devicePixelRatio transform, so none of that math has to change; the
    // mousemove hit-test and _flyPriorValue()'s coordinate conversion read the same two
    // properties for the same reason.
    _sizeDiagramCanvas(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const logicalWidth = Math.max(1, Math.round(canvas.clientWidth));
        const logicalHeight = VI_STATES_DIAGRAM_HEIGHT;
        canvas.width = Math.round(logicalWidth * dpr);
        canvas.height = Math.round(logicalHeight * dpr);
        canvas._logicalWidth = logicalWidth;
        canvas._logicalHeight = logicalHeight;
    }

    // Mirrors EdgeViewModel._getRewardRange() exactly - the graph's real action->state reward
    // range, so ViBackupDiagram's own reward-colored edges normalize identically to Graph view's.
    _rewardRange() {
        const actionStateEdges = this.viewModel.graph.edges.filter(e =>
            e.getFromNode().type === 'action' && e.getToNode().type === 'state'
        );
        if (actionStateEdges.length === 0) return { minReward: 0, maxReward: 0 };
        let minReward = Infinity;
        let maxReward = -Infinity;
        actionStateEdges.forEach(e => {
            const r = e.getReward();
            minReward = Math.min(minReward, r);
            maxReward = Math.max(maxReward, r);
        });
        if (minReward === maxReward) return { minReward, maxReward: minReward };
        return { minReward, maxReward };
    }

    // Attaches one section's cards, called only once that section is attached to the live
    // document (so a diagram canvas's clientWidth reflects real, laid-out width).
    // cardEntries: [{card, job}] in state order, built (but not yet appended) by _buildSection().
    //
    // For a historical or already-seen sweep (!shouldAnimate) every card appends immediately and
    // every diagram job draws straight to fully resolved - unchanged from before. For a
    // freshly-live sweep, this ONLY appends every card and draws diagram jobs in skeleton form
    // (the whole tree, nothing resolved) - it does NOT start revealing anything. Populates
    // _liveCardsEl/_liveCardEntries/_liveSweepIndex/_liveCursor = 0 so revealNextState()/
    // skipCurrentState() (Step/Skip) or playRemainingLiveSweep() (Play/"Find Optimal") can drive
    // the actual per-state reveal from here, one explicit call at a time.
    _prepareLiveSection(cardsEl, cardEntries, sweepIndex) {
        if (!cardEntries || cardEntries.length === 0) return;

        // "Animations · per mode" (Iteration) off forces every sweep down the same static
        // render path already used for historical/already-seen sweeps - computation still
        // proceeds sweep-by-sweep (VIAnimator/getPauseMs untouched), only the per-card
        // Bellman-arithmetic tween is skipped. Read live so toggling mid-run takes effect
        // starting the next sweep.
        const shouldAnimate = !this._animatedSweeps.has(sweepIndex) && this.viewModel.iterationAnimationEnabled;
        if (!shouldAnimate) {
            cardEntries.forEach(({ card }) => cardsEl.appendChild(card));
            cardEntries.forEach(({ job }) => { if (job) this._drawJobStatic(job); });
            // Still the live section's bookkeeping (canRevealNextState()/canSkipCurrentState()
            // and playRemainingLiveSweep() all read _live*) even though nothing needs revealing -
            // previously this branch only ever ran for OLDER, non-live sweeps (which never
            // touched _live* at all), but with animation off the CURRENT live sweep takes this
            // path too. Mark it fully-revealed rather than leaving _live* stale/unset, so Step/
            // Skip correctly report "nothing left in this sweep" (same as after a normal reveal
            // finishes - crossing into a new sweep stays Play's job alone) instead of drifting
            // out of sync with whatever sweep is actually live.
            this._liveCardsEl = cardsEl;
            this._liveCardEntries = cardEntries;
            this._liveSweepIndex = sweepIndex;
            this._liveCursor = cardEntries.length;
            return;
        }

        // Only one sweep's cards ever animate at a time - if a previous sweep's reveal is
        // somehow still running (shouldn't normally happen - animateOneSweep() always finishes
        // revealing the current live section before computing a new one), stop it and snap its
        // own cards straight to resolved rather than let two sweeps' reveals run concurrently.
        this._cancelActiveReveal();

        cardEntries.forEach(({ card, job }) => {
            if (!card.parentNode) cardsEl.appendChild(card);
            if (job) {
                this._sizeDiagramCanvas(job.canvas);
                ViBackupDiagram.drawSkeleton(job.canvas, job.detail, job.priorValues, job.colors, job.stateName, job.stateId, job.images);
            }
        });
        this._liveCardsEl = cardsEl;
        this._liveCardEntries = cardEntries;
        this._liveSweepIndex = sweepIndex;
        this._liveCursor = 0;
    }

    // Reveals exactly the card at `index` of the live section - sets up _activeReveal for it,
    // and returns a promise that resolves once THIS card's own reveal finishes (naturally or via
    // cancellation). Does not advance further on its own; _revealAt()/playRemainingLiveSweep()
    // decide whether to chain into the next one.
    // stepMode: when true (Step), the card's own reveal auto-pauses after EVERY move instead of
    // chaining through all of them - a mutable property on the reveal object (not baked in), so
    // playRemainingLiveSweep() ("Find Optimal" taking over a Step-paused reveal) can flip it off
    // mid-reveal and have playback continue seamlessly instead of re-pausing.
    _revealOneCard(index, { stepMode = false } = {}) {
        const cardsEl = this._liveCardsEl;
        const cardEntries = this._liveCardEntries;
        const sweepIndex = this._liveSweepIndex;
        const { card, job } = cardEntries[index];

        let resolveReveal = () => {};
        const revealPromise = new Promise(resolve => { resolveReveal = resolve; });
        // Declared (not yet assigned) before finish() so a flat card's immediate, synchronous
        // finish() call below - which runs before the real reveal object exists at all for a
        // job-less card - reads `null` instead of throwing a temporal-dead-zone ReferenceError.
        let reveal = null;

        const finish = () => {
            this._liveCursor = index + 1;
            if (this._activeReveal === reveal) this._activeReveal = null;
            resolveReveal();
            this.onRevealProgress();
        };

        if (!card.parentNode) cardsEl.appendChild(card);
        if (!job) {
            finish();
            return revealPromise;
        }

        reveal = {
            sweepIndex, cardsEl, cardEntries, paused: false, stepMode,
            cancel: () => {}, pause: () => {}, resume: () => {},
            promise: revealPromise, resolve: resolveReveal
        };
        this._activeReveal = reveal;

        const beginAnimation = () => {
            const animHandle = ViBackupDiagram.drawAnimated(
                // Live callback (not a pre-computed number) - drawAnimated() re-reads it every
                // frame so a mid-reveal slider change takes effect immediately, not just on the
                // next reveal.
                job.canvas, job.detail, job.priorValues, job.colors, job.stateName, job.stateId, job.images, job.gamma, () => this.getSpeedScale(),
                // Also a live read (via the reveal object, not a captured boolean) - see
                // playRemainingLiveSweep()'s own comment for why that matters.
                () => reveal.stepMode,
                (nextStateId) => {
                    // "Highlight the specific state in the prior step" - not the whole time box.
                    if (sweepIndex > 0) this._flashCard(sweepIndex - 1, nextStateId);
                },
                ({ nextStateId, canvasX, canvasY, durationMs }) => {
                    // Fly the ACTUAL prior card's value (wherever it really sits on screen right
                    // now) over to arrive at this diagram's triangle anchor.
                    if (sweepIndex > 0) {
                        this._flyPriorValue(sweepIndex - 1, nextStateId, job.priorValues[nextStateId] ?? 0, job.canvas, canvasX, canvasY, durationMs);
                    }
                },
                () => {
                    // The engine auto-paused after one move (Step) - keep this card's own paused
                    // flag (and therefore canRevealNextState()'s enablement check) in sync, same
                    // as finish() already does for the "fully done" case.
                    reveal.paused = true;
                    this.onRevealProgress();
                },
                () => {
                    job.valueEl.textContent = `V = ${(job.detail ? job.detail.value : 0).toFixed(2)}`;
                    // Shrinks this one card to a compact pill the instant its own calculation
                    // finishes - the next state's card (still full-size) stays the visual focus,
                    // and already-done states no longer take up space. Cleared by _applyExpansion()
                    // once this section stops being the live one (see its own comment).
                    this._collapseCardToPill(card, true);
                    finish();
                });
            reveal.cancel = animHandle.cancel;
            reveal.pause = animHandle.pause;
            reveal.resume = animHandle.resume;
        };

        if (index === 0) {
            // Only the FIRST card of a freshly-live section gets the "let the header breathe"
            // pause before its own animation begins - matches the old auto-chain's one-time
            // freeze. Subsequent states (via later Step/Skip clicks, or auto-chain continuing)
            // start immediately - no artificial delay on an already-deliberate click.
            const freezeTimer = pausableTimeout(beginAnimation, VI_STATES_FREEZE_MS * this.getSpeedScale());
            reveal.cancel = () => freezeTimer.cancel();
            reveal.pause = () => freezeTimer.pause();
            reveal.resume = () => freezeTimer.resume();
        } else {
            beginAnimation();
        }

        return revealPromise;
    }

    // Reveals card(s) of the live section starting at `index`, chaining automatically into
    // subsequent ones only when autoAdvance is true (Play/"Find Optimal") - stops after exactly
    // one card otherwise (Step/Skip). Returns a promise resolving once the whole requested chain
    // is done. stepMode only ever applies to THIS card (Step starting a fresh state) - a chained
    // next state (autoAdvance path) never inherits it, so it always plays in full, matching Skip/
    // Play's own established behavior.
    //
    // The autoAdvance recursion below also re-checks viState.isPlaying, not just autoAdvance and
    // cursor position - this chain lives entirely inside its own promise (not re-entering
    // playRemainingLiveSweep()), so pausing mid-chain doesn't stop it by itself: the current
    // card's promise just sits unresolved while paused, same as intended, but if something
    // UNRELATED later resolves that promise (e.g. Skip cancelling this same paused card to start
    // its own fresh reveal elsewhere), this .then() would otherwise fire anyway and kick off a
    // SECOND reveal for whatever the cursor now points at - clobbering Skip's own reveal object
    // (stepMode reset to false) even though Play was already paused and no one asked it to keep
    // auto-advancing.
    _revealAt(index, { autoAdvance, stepMode = false }) {
        if (!this._liveCardEntries || index >= this._liveCardEntries.length) return Promise.resolve();
        return this._revealOneCard(index, { stepMode }).then(() => {
            if (autoAdvance && this.viState.isPlaying && this._liveCursor < this._liveCardEntries.length) {
                return this._revealAt(this._liveCursor, { autoAdvance });
            }
        });
    }

    // known:full (real Value Iteration) is the only quadrant with a per-state reveal to step
    // through at all - the other 3 quadrants' flat cards have no animation to pace against, so
    // Step/Skip keep their old sweep-level behavior there (see VIStepInteractor/VISkipInteractor).
    _isDiagramQuadrant() {
        return ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability) === 'known:full';
    }
    isDiagramQuadrant() {
        return this._isDiagramQuadrant();
    }

    // Step. Returns true if this view owns the click (diagram quadrant) so
    // VIStepInteractor should NOT fall through to the old sweep-level stepOneSweep() - false lets
    // it fall through, for the other 3 quadrants. Three cases:
    //  - A reveal is PAUSED: resume it - since it's in step mode, this plays exactly ONE more
    //    move and auto-pauses again (see ViBackupDiagram.drawAnimated()'s own getStepMode logic),
    //    not the rest of the state.
    //  - A reveal is ACTIVELY PLAYING: no-op - Step only acts once there's nothing already in
    //    flight; a still-playing reveal needs Skip (to cancel it) instead.
    //  - Nothing is in flight and there's a next state: reveal it IN STEP MODE - plays its first
    //    move then auto-pauses, same as every subsequent move a further Step click reveals.
    // Forces stepMode back on before resuming, even if the paused reveal didn't start that way
    // (e.g. it was Play/"Find Optimal" that got paused) - Step always means "one move, then stop"
    // regardless of how the in-flight reveal originally began.
    revealNextState() {
        if (!this._isDiagramQuadrant()) return false;
        if (this._activeReveal && this._activeReveal.paused) {
            this._activeReveal.stepMode = true;
            this.resumeActiveReveal();
            return true;
        }
        if (this._liveCardEntries && !this._activeReveal && this._liveCursor < this._liveCardEntries.length) {
            this._revealAt(this._liveCursor, { autoAdvance: false, stepMode: true });
        }
        return true;
    }

    // Skip. Same true/false "did I own it" signal as revealNextState(). If a reveal exists right
    // now (playing or paused), snaps JUST that one card to resolved (_cancelCurrentCardOnly() -
    // NOT _cancelActiveReveal(), which would incorrectly snap the REST of the live section too)
    // and advances past it, then reveals the new cursor position - in step mode, same as
    // revealNextState()'s own "start a new card" branch, so the next card plays its first move and
    // auto-pauses rather than auto-chaining through the whole state. Skip is only ever a jump PAST
    // the current state, never an invitation to autoplay the next one - only Play/Find Optimal
    // autoplays.
    skipCurrentState() {
        if (!this._isDiagramQuadrant()) return false;
        if (!this._liveCardEntries) return true;
        if (this._activeReveal) this._cancelCurrentCardOnly();
        if (this._liveCursor < this._liveCardEntries.length) this._revealAt(this._liveCursor, { autoAdvance: false, stepMode: true });
        return true;
    }

    // Read-only queries for button enablement (refreshVIButtons() in main.js). Both stay true
    // before VI is ever initialized (mirrors ValueIterationState.getButtonEnablement()'s own
    // `!this.initialized || canAdvance` - before the first Run/Reset-triggered initialize(),
    // Step/Skip must stay enabled so the user can kick off the first run, and REMAIN enabled
    // after any later Reset too, not just the very first time) - without this, a live section
    // that's null (never built yet, or just cleared by Reset) would otherwise disable both
    // buttons with no click left able to re-enable them. Once initialized, both are false once
    // the live section has no more states left - crossing into a new sweep is no longer Step/
    // Skip's job at all in this quadrant; only "Find Optimal"/Reset remain available. Step stays
    // enabled while paused (revealNextState() resumes in that case) - only an ACTIVELY PLAYING
    // reveal disables it.
    canRevealNextState() {
        if (!this._isDiagramQuadrant()) return false;
        if (!this.viState.initialized) return true;
        return !!this._liveCardEntries && this._liveCursor < this._liveCardEntries.length
            && (!this._activeReveal || this._activeReveal.paused);
    }
    canSkipCurrentState() {
        if (!this._isDiagramQuadrant()) return false;
        if (!this.viState.initialized) return true;
        return !!this._liveCardEntries && this._liveCursor < this._liveCardEntries.length;
    }

    // Auto-chains through whatever the live section still owes - from wherever manual Step/Skip
    // left the cursor (0 states in, all of them, or partway) - and resolves once the WHOLE
    // section is fully revealed. No-ops (resolves immediately) once it's already fully revealed,
    // or there's no live section at all (including non-diagram quadrants, whose flat cards were
    // already fully appended by _prepareLiveSection() with nothing left to chain through). Used
    // by VIAnimator.animateOneSweep() (Play/"Find Optimal") so it always catches up on any
    // manual Step/Skip progress before moving on, keeping its own sweep-by-sweep animated pacing
    // regardless of how much of the current sweep was already manually revealed.
    playRemainingLiveSweep() {
        if (!this._liveCardEntries || this._liveCursor >= this._liveCardEntries.length) return Promise.resolve();
        if (this._activeReveal) {
            // Guards against a stale call: this method's own recursive `.then()` re-invokes itself
            // once whatever it was awaiting resolves - which can happen because Play genuinely kept
            // going, OR because something UNRELATED (e.g. a Skip click cancelling a paused reveal
            // that a now-paused Play loop happened to still be dangling on) incidentally resolved
            // that same promise. Only a genuinely live Play session (viState.isPlaying) gets to
            // "take over" whatever reveal is current - otherwise a paused-Play's leftover
            // continuation would clobber a reveal Step/Skip just started fresh (clearing its step
            // mode / resuming it) despite no one having clicked Play again.
            if (!this.viState.isPlaying) return Promise.resolve();
            // "Find Optimal" taking over whatever's currently in flight, including a Step-paused,
            // step-mode reveal - see clearStepMode()'s own comment - then resume it if it was
            // paused (harmless no-op if it's already actively playing).
            this.clearStepMode();
            if (this._activeReveal.paused) this.resumeActiveReveal();
            return this._activeReveal.promise.then(() => this.playRemainingLiveSweep());
        }
        return this._revealAt(this._liveCursor, { autoAdvance: true });
    }

    // Skip's own "cancel JUST the currently-active card" - distinct from _cancelActiveReveal()
    // (below), which snaps EVERY remaining card in the live section (used for teardown/Reset/
    // theme-rebuild and the defensive supersede in _prepareLiveSection(), where the whole rest of
    // a sweep genuinely needs to look done). Skipping one state must never resolve states after
    // it that the user hasn't reached yet - those stay in skeleton form until their own turn.
    _cancelCurrentCardOnly() {
        if (!this._activeReveal) return;
        const { cancel, resolve } = this._activeReveal;
        const index = this._liveCursor;
        const entry = this._liveCardEntries[index];
        cancel();
        this._cancelFlyChips();
        if (entry) {
            const { card, job } = entry;
            if (!card.parentNode) this._liveCardsEl.appendChild(card);
            if (job) {
                this._drawJobStatic(job);
                this._collapseCardToPill(card, false);
            }
        }
        resolve();
        this._activeReveal = null;
        this._liveCursor = index + 1;
    }

    // Freezes/resumes whichever sweep's reveal is currently in flight, exactly where it is -
    // called from main.js's onVIPause()/onVIPlay() so continuous Play's pause genuinely halts the
    // currently-animating state's own backward-pass animation, instead of only preventing the
    // NEXT sweep from starting once the whole current one finishes. Each underlying pause()/
    // resume() (the freeze timer, or ViBackupDiagram.drawAnimated()'s own handle) is already
    // idempotent-safe, so no extra state needs tracking here.
    pauseActiveReveal() {
        if (this._activeReveal) {
            this._activeReveal.pause();
            this._activeReveal.paused = true;
        }
    }

    resumeActiveReveal() {
        if (this._activeReveal) {
            this._activeReveal.resume();
            this._activeReveal.paused = false;
        }
    }

    // "Find Optimal" taking over whatever's currently in flight - clears step mode (a live read
    // inside ViBackupDiagram.drawAnimated()'s own tick(), so this takes effect immediately even
    // if a move is already mid-tween) so the rest of this state plays continuously instead of
    // re-pausing after every move. Called from main.js's onVIPlay() (which resumes directly when
    // a continuousPlay() loop is already suspended awaiting an in-flight reveal, rather than
    // starting a fresh one - see VIPlayInteractor's own isLoopRunning() guard) and from
    // playRemainingLiveSweep() below (the fresh-loop-iteration path) - both need this, since
    // either one might be the one that actually wakes a Step-paused reveal back up.
    clearStepMode() {
        if (this._activeReveal) this._activeReveal.stepMode = false;
    }

    // Stops whatever sweep's reveal is currently in flight (if any) and instantly snaps EVERY one
    // of its cards to their fully resolved, appended state - used both for a genuine teardown
    // (Reset/theme rebuild, where the DOM is about to be wiped anyway) and for the defensive
    // supersede in _prepareLiveSection() (a new sweep's section being built while the old one's
    // reveal is somehow still active). Deliberately resolves the WHOLE remaining section, unlike
    // _cancelCurrentCardOnly() (Skip's own, much more targeted cancel) - a teardown/supersede
    // needs every card to look "done," not half-drawn or never-appended, forever. Also resolves
    // the pending reveal promise so anything awaiting it (playRemainingLiveSweep(), _activeReveal
    // itself) doesn't hang.
    _cancelActiveReveal() {
        if (!this._activeReveal) return;
        const { cardsEl, cardEntries, cancel, resolve } = this._activeReveal;
        cancel();
        this._cancelFlyChips();
        cardEntries.forEach(({ card, job }) => {
            if (!card.parentNode) cardsEl.appendChild(card);
            if (!job) return;
            this._drawJobStatic(job);
            // Instant snap, not animated - a supersede/teardown needs every card to look "done"
            // immediately, not mid-shrink.
            this._collapseCardToPill(card, false);
        });
        resolve();
        this._activeReveal = null;
    }

    // Lets VIAnimator's stepOneSweep() (Step/Skip) check, synchronously, whether a reveal is
    // ACTIVELY PLAYING (not merely present) before computing the next sweep - see its own comment
    // for why a re-entrant Step click needs to be ignored rather than superseding an in-flight
    // reveal. Deliberately false while a reveal exists but is PAUSED - a paused reveal has already
    // been shown to the user (they chose to pause it), so Step/Skip should be free to instantly
    // supersede it (via the existing _cancelActiveReveal() "snap to resolved" path, same as
    // before this guard existed) and start its own fresh sweep's reveal, rather than being stuck
    // forever since a paused reveal never resolves on its own.
    hasActiveReveal() {
        return !!this._activeReveal && !this._activeReveal.paused;
    }

    _drawJobStatic(job) {
        this._sizeDiagramCanvas(job.canvas);
        ViBackupDiagram.draw(job.canvas, job.detail, job.priorValues, job.colors, job.stateName, job.stateId, job.images);
        job.valueEl.textContent = `V = ${(job.detail ? job.detail.value : 0).toFixed(2)}`;
    }

    // Repaints every already-built, non-animating diagram card - called once whenever
    // ViBackupDiagram finishes loading a photo (see main.js's setOnImageLoaded wiring), so a card
    // painted before that photo was ready doesn't keep showing a plain label forever. Skips
    // whichever sweep currently owns the live reveal (its own rAF loop already repaints every
    // frame and will pick up the image on its own next frame) to avoid stomping on an in-flight
    // animation.
    redrawStaticCards() {
        if (!this._sectionsEl) return;
        const liveSweepIndex = this._activeReveal ? this._activeReveal.sweepIndex : null;
        Array.from(this._sectionsEl.children).forEach(section => {
            if (Number(section.dataset.sweepIndex) === liveSweepIndex) return;
            // A collapsed section's diagram canvases are display:none - clientWidth reads as 0,
            // so _drawJobStatic() (which re-measures/resizes the canvas before drawing) would
            // shrink the backing buffer down to a degenerate size. That corrupted size then gets
            // stretched back up by CSS the next time the section is expanded, rendering as smeared
            // horizontal bands instead of the diagram. Skip collapsed sections here entirely - the
            // header's own expand click (see _buildSection()) re-sizes+redraws on expand instead,
            // when clientWidth is actually meaningful again.
            if (section.classList.contains('vi-states-view-section--collapsed')) return;
            (section._cardEntries || []).forEach(({ job }) => { if (job) this._drawJobStatic(job); });
        });
    }

    // Scrolls to and briefly flashes the SPECIFIC state's card (not the whole time box) within an
    // older sweep's section - triggered automatically as the live reveal's highlight phase for
    // that outcome begins (see _revealOneCard()), and also on hovering the same triangle later (see
    // _buildDiagramCard()'s canvas mousemove handler). The prior card already shows "the prior
    // step's calculation" (its own V), so surfacing it this way needs no separate tooltip.
    _flashCard(sweepIndex, stateId) {
        const card = this._findCard(sweepIndex, stateId);
        if (!card) return;
        card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        card.classList.add('vi-states-view-card--flash');
        clearTimeout(this._flashTimeout);
        this._flashTimeout = setTimeout(() => card.classList.remove('vi-states-view-card--flash'), 900);
    }

    // Shared lookup: the specific state's card within a specific (older) sweep's section. Used by
    // _flashCard() and _flyPriorValue() alike - looking up "sweep k's card for state s" is a
    // frequent enough operation across both features that it deserves one implementation.
    _findCard(sweepIndex, stateId) {
        if (!this._sectionsEl) return null;
        const section = Array.from(this._sectionsEl.children)
            .find(s => Number(s.dataset.sweepIndex) === sweepIndex);
        if (!section) return null;
        return section.querySelector(`.vi-states-view-card[data-state-id="${stateId}"]`);
    }

    // Shrinks a card down to its compact pill footprint. animate=true plays a real width/height
    // transition (the card visibly shrinks in place; the row reflows around it as its footprint
    // changes) - used the instant a live card's own reveal finishes. animate=false snaps instantly
    // to the settled pill state - used for teardown/supersede, where a card must look "done" right
    // away, never mid-shrink.
    _collapseCardToPill(card, animate) {
        if (!animate) {
            this._forceSettleShrink(card);
            if (!card.classList.contains('vi-states-view-card--pill')) {
                card.classList.add('vi-states-view-card--pill');
            }
            return;
        }

        if (card.classList.contains('vi-states-view-card--pill') || card.classList.contains('vi-states-view-card--shrinking')) {
            return;
        }

        const fromRect = card.getBoundingClientRect();
        // Measure the pill footprint by toggling the class on and back off within the same task,
        // so nothing actually paints the pill look before the transition begins.
        card.classList.add('vi-states-view-card--pill');
        const toRect = card.getBoundingClientRect();
        card.classList.remove('vi-states-view-card--pill');

        card.style.width = fromRect.width + 'px';
        card.style.height = fromRect.height + 'px';
        card.classList.add('vi-states-view-card--shrinking');
        card.style.transitionDuration = (VI_STATES_SHRINK_MS * this.getSpeedScale()) + 'ms';

        // Force a reflow so the pinned "from" values commit before the "to" values are set below -
        // otherwise the browser could coalesce both writes into one and skip the transition.
        void card.offsetHeight;

        card.style.width = toRect.width + 'px';
        card.style.height = toRect.height + 'px';

        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            card.removeEventListener('transitionend', onTransitionEnd);
            clearTimeout(fallbackTimeout);
            card.classList.remove('vi-states-view-card--shrinking');
            card.style.width = '';
            card.style.height = '';
            card.style.transitionDuration = '';
            card.classList.add('vi-states-view-card--pill');
            card._shrinkCleanup = null;
        };
        const onTransitionEnd = (e) => {
            if (e.target === card && e.propertyName === 'width') finish();
        };
        card.addEventListener('transitionend', onTransitionEnd);
        const fallbackTimeout = setTimeout(finish, VI_STATES_SHRINK_MS * this.getSpeedScale() + 150);
        card._shrinkCleanup = finish;
    }

    // Cancels an in-flight shrink transition (if any) on this card, snapping it straight to the
    // fully-settled, inline-style-free state - without deciding whether to add the pill class
    // itself (the caller does that). Idempotent no-op if nothing is in flight.
    _forceSettleShrink(card) {
        if (card._shrinkCleanup) card._shrinkCleanup();
    }

    // Lazily creates the once-per-instance position:fixed overlay holding any in-flight
    // "fly the prior value to the triangle" chips - mirrors rewardParticleSystem.js's own
    // long-lived-overlay convention.
    _ensureFlyOverlay() {
        if (this._flyOverlayEl && document.body.contains(this._flyOverlayEl)) return this._flyOverlayEl;
        const overlay = document.createElement('div');
        overlay.className = 'vi-states-view-fly-overlay';
        document.body.appendChild(overlay);
        this._flyOverlayEl = overlay;
        return overlay;
    }

    // Flies a small chip showing `value` (the prior sweep's V for nextStateId) from wherever that
    // state's ACTUAL card sits right now (in sweepIndex's section) to the (canvasX, canvasY)
    // point on destCanvas - the same pixel the diagram's own traveling triangle copy picks up
    // from once this flight lands, giving a seamless DOM -> canvas handoff.
    _flyPriorValue(sweepIndex, nextStateId, value, destCanvas, canvasX, canvasY, durationMs) {
        const sourceCard = this._findCard(sweepIndex, nextStateId);
        if (!sourceCard) return;

        // Deliberately instant (not smooth) - forces any smooth scroll still in flight from this
        // same transition's own highlight phase (_flashCard(), moments earlier) to complete right
        // now, so the rect read below reflects the truly-settled scroll position rather than
        // racing it.
        sourceCard.scrollIntoView({ block: 'nearest', behavior: 'auto' });

        const valueEl = sourceCard.querySelector('.vi-states-view-card-header span:last-child') || sourceCard;
        const fromRect = valueEl.getBoundingClientRect();
        const fromX = fromRect.left + fromRect.width / 2;
        const fromY = fromRect.top + fromRect.height / 2;

        // canvasX/canvasY arrive in LOGICAL (CSS-pixel) coordinates (see ViBackupDiagram's
        // _renderFrame()/_sizeDiagramCanvas() above) - convert against destCanvas._logicalWidth/
        // Height, not the raw, devicePixelRatio-scaled destCanvas.width/height.
        const destRect = destCanvas.getBoundingClientRect();
        const logicalWidth = destCanvas._logicalWidth || destCanvas.width;
        const logicalHeight = destCanvas._logicalHeight || destCanvas.height;
        const scaleX = logicalWidth > 0 ? destRect.width / logicalWidth : 1;
        const scaleY = logicalHeight > 0 ? destRect.height / logicalHeight : 1;
        const toX = destRect.left + canvasX * scaleX;
        const toY = destRect.top + canvasY * scaleY;

        const overlay = this._ensureFlyOverlay();
        const chip = document.createElement('div');
        chip.className = 'vi-states-view-fly-value';
        chip.textContent = value.toFixed(2);
        chip.style.left = fromX + 'px';
        chip.style.top = fromY + 'px';
        overlay.appendChild(chip);
        this._activeFlyChips.push(chip);

        // Force a reflow so the "from" position commits before the "to" position is set below.
        void chip.offsetWidth;
        chip.style.transitionDuration = durationMs + 'ms';
        chip.classList.add('vi-states-view-fly-value--flying');
        chip.style.left = toX + 'px';
        chip.style.top = toY + 'px';

        let settled = false;
        const cleanup = () => {
            if (settled) return;
            settled = true;
            chip.removeEventListener('transitionend', onTransitionEnd);
            clearTimeout(fallbackTimeout);
            chip.remove();
            const idx = this._activeFlyChips.indexOf(chip);
            if (idx !== -1) this._activeFlyChips.splice(idx, 1);
            chip._cleanup = null;
        };
        const onTransitionEnd = (e) => {
            if (e.target === chip) cleanup();
        };
        chip.addEventListener('transitionend', onTransitionEnd);
        const fallbackTimeout = setTimeout(cleanup, durationMs + 150);
        chip._cleanup = cleanup;
    }

    // Force-invokes cleanup() on every in-flight fly-value chip - used by _cancelActiveReveal()
    // so a supersede/teardown never leaves an orphaned floating number on screen.
    _cancelFlyChips() {
        this._activeFlyChips.slice().forEach(chip => { if (chip._cleanup) chip._cleanup(); });
        this._activeFlyChips = [];
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
                // transient per-card marker _revealOneCard() adds as each state finishes its live
                // reveal - clear it here so a manually re-expanded historical section still shows
                // its full diagrams, not leftover pills from when it was the live one. Also
                // force-settles any card still mid-shrink-transition so it doesn't retain stale
                // inline width/height pins once the pill class is stripped.
                section.querySelectorAll('.vi-states-view-card--pill, .vi-states-view-card--shrinking')
                    .forEach(card => {
                        this._forceSettleShrink(card);
                        card.classList.remove('vi-states-view-card--pill');
                    });
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
