const EXPECTATION_LABEL_H = 18;
const EXPECTATION_PADDING = 12;
const EXPECTATION_ARROW_SIZE = 8;
const EXPECTATION_DIM_ALPHA = 45;
const EXPECTATION_Y_STEP = 0.12;
// Reserved space at the top of the canvas-local drawing area so the mini-panel grid / focused
// panel never renders behind the floating estimator pill (which overlaps the top of the
// canvas). The scrubber's own DOM position (bottom-anchored, computed in resize()/
// setupScrubber()) is untouched by this - only the top of the content area shrinks.
const EXPECTATION_TOP_CLEARANCE = 90;

class ExpectationView {
    constructor(canvasViewModel, expectationViewModel, expectationState, graph, options = {}) {
        this.viewModel = canvasViewModel;
        this.expectationViewModel = expectationViewModel;
        this.expectationState = expectationState;
        this.graph = graph;
        // Per-tick playback delay; wired to the animation-speed slider in main.js (same slider
        // driving Build/Policy's simulation timing and VI's sweep beat/pause). Range (100-400ms)
        // is centered on the old fixed 250ms default. Falls back to that default if no getter
        // is supplied.
        this.getTickMs = options.getTickMs || (() => 250);
        this._scrubber = null;
        this._scrubberCallbacks = null;
        this._playTimer = null;
        this._rightPanel = null;
        this._chartDock = null;
        this._expectationChartView = null;
        this.onPlaybackStateChange = null;
        this._topOffset = 40; // corrected immediately by resize(), matches the top bar's height
        this._imageCache = new Map();
    }

    setRightPanel(rightPanel) {
        this._rightPanel = rightPanel;
    }

    setChartDock(chartDock) {
        this._chartDock = chartDock;
    }

    // The new inline Chart view for the left pane (Phase 3a) - a sibling DOM component, not a
    // p5-canvas overlay, so it needs its own bounds kept in sync on resize() (see below) and its
    // own refresh() call alongside rightPanel/chartDock whenever the underlying data changes.
    setExpectationChartView(view) {
        this._expectationChartView = view;
    }

    _notifyDataChanged() {
        if (this._rightPanel) this._rightPanel.updateExpectationData();
        if (this._chartDock) this._chartDock.refresh();
        if (this._expectationChartView) this._expectationChartView.refresh();
    }

    draw(canvasW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        background(AppPalette.surface.canvas);

        if (!state.computed || !this.viewModel.startNode) {
            this._drawEmptyPrompt(canvasW, canvasH);
            return;
        }

        this._ensureImagesLoaded();

        const { leftW, rightW } = vm.splitWidths(canvasW);

        if (vm.leftView === 'grid') {
            this._drawGrid(leftW, canvasH);
        } else {
            // Chart view (ExpectationChartView, a DOM component) renders over this region
            // instead - just clear the canvas-space behind it so nothing from a previous
            // grid-mode frame lingers visible at the pane's edges.
            noStroke();
            fill(AppPalette.surface.canvas);
            rect(0, 0, leftW, canvasH);
        }

        push();
        stroke(AppPalette.border.medium);
        strokeWeight(1);
        line(leftW, EXPECTATION_TOP_CLEARANCE, leftW, canvasH);
        pop();

        this._drawGraphPanel(leftW, rightW, canvasH);
    }

    // Episode mini-panel grid, budgeted to the left pane's width (leftW) instead of the full
    // canvas - this is exactly today's pre-split grid-mode rendering, just parameterized.
    _drawGrid(leftW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        if (vm.layoutStale) {
            vm.computeLayout(leftW, canvasH - EXPECTATION_TOP_CLEARANCE, state.displayRuns, this.graph, EXPECTATION_TOP_CLEARANCE);
        }
        if (!vm.panelLayout) {
            this._drawEmptyPrompt(leftW, canvasH);
            return;
        }

        const { panels, fitTransform } = vm.panelLayout;
        if (!fitTransform) {
            this._drawEmptyPrompt(leftW, canvasH);
            return;
        }

        const { offsetX, offsetY, fitScale } = fitTransform;
        const currentT = state.currentT;
        const runColors = AppPalette.expectation.runColors;

        const displaySlice = state.getDisplaySlice();
        const hoveredRun = vm.hoveredRun;
        const selectedRun = vm.selectedRunIndex;
        for (let i = 0; i < displaySlice.length; i++) {
            const panel = panels[i];
            if (!panel) continue;
            const rollout = displaySlice[i];
            const runColor = runColors[i % runColors.length];
            const isHovered = hoveredRun === i;
            const isSelected = selectedRun === i;

            drawingContext.save();
            drawingContext.beginPath();
            drawingContext.rect(panel.x, panel.y, panel.w, panel.h);
            drawingContext.clip();

            // Draw panel background
            fill(isHovered ? AppPalette.surface.hoverCard : AppPalette.surface.card);
            noStroke();
            rect(panel.x, panel.y, panel.w, panel.h, 9);

            push();
            translate(panel.x + offsetX, panel.y + offsetY);
            scale(fitScale);

            // Draw all edges dim
            for (const edge of this.graph.edges) {
                const from = edge.getFromNode();
                const to = edge.getToNode();
                this._drawEdge(from, to, AppPalette.node.state, EXPECTATION_DIM_ALPHA);
            }

            // Draw all nodes dim
            for (const node of this.graph.nodes) {
                this._drawNode(node, AppPalette.node.state, EXPECTATION_DIM_ALPHA, fitScale);
            }

            // Draw text labels
            this._drawTextLabels(fitScale);

            // Highlight visited nodes and edges
            const effectiveT = Math.min(currentT, rollout.numSteps);
            const visitedSlice = rollout.trace.slice(0, 2 * effectiveT + 1);

            // Visited edges
            for (let k = 0; k + 1 < visitedSlice.length; k++) {
                const fromEntry = visitedSlice[k];
                const toEntry = visitedSlice[k + 1];
                const fromNode = this.graph.getNodeById(fromEntry.id);
                const toNode = this.graph.getNodeById(toEntry.id);
                if (fromNode && toNode) {
                    this._drawEdge(fromNode, toNode, runColor, 255);
                }
            }

            // Visited nodes
            for (const entry of visitedSlice) {
                const node = this.graph.getNodeById(entry.id);
                if (node) {
                    this._drawNode(node, runColor, 255, fitScale);
                }
            }

            pop();
            drawingContext.restore();

            // Panel label (screen space, after restore): "#NN" muted mono (left) + "G = x.xx"
            // mono, green/red by sign (right)
            const utility = state._getUtility(rollout, currentT);
            noStroke();
            textSize(10);
            textFont(Typography.mono());

            textAlign(LEFT, TOP);
            fill(AppPalette.text.placeholder);
            text(`#${String(i + 1).padStart(2, '0')}`, panel.x + 4, panel.y + 3);

            textAlign(RIGHT, TOP);
            fill(utility >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative);
            text(`G = ${utility.toFixed(2)}`, panel.x + panel.w - 4, panel.y + 3);

            // Third line: trajectory-so-far readout (e.g. "S0 →Hun→ S1 (+5.00)"), a supplementary
            // readout below the #NN/G= row - skipped on short panels so it doesn't crowd the
            // mini-graph render underneath.
            if (panel.h > 90) {
                const trajectory = RolloutFormatter.formatTrajectory(this.graph, rollout, currentT);
                if (trajectory) {
                    textSize(9);
                    textFont(Typography.mono());
                    textAlign(LEFT, TOP);
                    fill(AppPalette.text.secondary);
                    const maxWidthPx = panel.w - 8;
                    text(this._truncateToWidth(trajectory, maxWidthPx), panel.x + 4, panel.y + 15);
                }
            }

            // Panel border - color reflects hover OR selection; stroke weight never changes so
            // the border doesn't visually "jump" in thickness.
            noFill();
            stroke((isHovered || isSelected) ? AppPalette.accent.orange : AppPalette.border.medium);
            strokeWeight(1);
            rect(panel.x, panel.y, panel.w, panel.h, 9);
        }
    }

    // Shared right-pane graph panel (48% of canvasW, always visible regardless of leftView).
    // Bare graph when nothing is selected; the selected run's visited-so-far path (synced to the
    // shared scrubber's currentT) is highlighted otherwise. Replaces the old full-canvas
    // "focused mode" (_drawFocusedPanel) - same rendering approach, just always-on and pane-
    // scoped instead of a modal takeover.
    _drawGraphPanel(leftW, rightW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        const availH = canvasH - EXPECTATION_TOP_CLEARANCE;
        const fitTransform = vm._computeFitTransform(this.graph, rightW, availH);
        if (!fitTransform) return;

        const { offsetX, offsetY, fitScale } = fitTransform;

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(leftW, EXPECTATION_TOP_CLEARANCE, rightW, availH);
        drawingContext.clip();

        fill(AppPalette.surface.card);
        noStroke();
        rect(leftW, EXPECTATION_TOP_CLEARANCE, rightW, availH);

        push();
        translate(leftW + offsetX, EXPECTATION_TOP_CLEARANCE + offsetY);
        scale(fitScale);

        for (const edge of this.graph.edges) {
            this._drawEdge(edge.getFromNode(), edge.getToNode(), AppPalette.node.state, EXPECTATION_DIM_ALPHA);
        }
        for (const node of this.graph.nodes) {
            this._drawNode(node, AppPalette.node.state, EXPECTATION_DIM_ALPHA, fitScale);
        }

        if (vm.selectedRunIndex !== null) {
            const rollout = state.getDisplaySlice()[vm.selectedRunIndex];
            if (rollout) {
                const runColor = AppPalette.expectation.runColors[vm.selectedRunIndex % AppPalette.expectation.runColors.length];
                const currentT = state.currentT;
                const effectiveT = Math.min(currentT, rollout.numSteps);
                const visitedSlice = rollout.trace.slice(0, 2 * effectiveT + 1);
                for (let k = 0; k + 1 < visitedSlice.length; k++) {
                    const fromNode = this.graph.getNodeById(visitedSlice[k].id);
                    const toNode = this.graph.getNodeById(visitedSlice[k + 1].id);
                    if (fromNode && toNode) this._drawEdge(fromNode, toNode, runColor, 255);
                }
                for (const entry of visitedSlice) {
                    const node = this.graph.getNodeById(entry.id);
                    if (node) this._drawNode(node, runColor, 255, fitScale);
                }
            }
        }

        this._drawTextLabels(fitScale);

        pop();
        drawingContext.restore();

        noFill();
        stroke(AppPalette.border.medium);
        strokeWeight(1);
        rect(leftW, EXPECTATION_TOP_CLEARANCE, rightW, availH);

        if (vm.selectedRunIndex !== null) {
            const rollout = state.getDisplaySlice()[vm.selectedRunIndex];
            if (rollout) {
                const utility = state._getUtility(rollout, state.currentT);
                noStroke();
                fill(AppPalette.accent.yellow);
                textSize(13);
                textAlign(LEFT, TOP);
                textFont(Typography.mono());
                text(`Run ${String(vm.selectedRunIndex + 1).padStart(2, '0')} · G = ${utility.toFixed(2)}`, leftW + 12, EXPECTATION_TOP_CLEARANCE + 10);
            }
        }
    }

    // Truncates str character-by-character (appending '…') until it fits within maxWidthPx,
    // measured with p5's textWidth() under whatever font/size is currently active on the
    // drawing context (caller must set textSize/textFont beforehand).
    _truncateToWidth(str, maxWidthPx) {
        if (maxWidthPx <= 0) return '';
        if (textWidth(str) <= maxWidthPx) return str;
        let truncated = str;
        while (truncated.length > 0 && textWidth(truncated + '…') > maxWidthPx) {
            truncated = truncated.slice(0, -1);
        }
        return truncated.length > 0 ? truncated + '…' : '';
    }

    _ensureImagesLoaded() {
        for (const node of this.graph.nodes) {
            if (!node.image) continue;
            const key = `${node.id}:${node.image}`;
            if (this._imageCache.has(key)) continue;
            const img = new Image();
            img.onload = () => {
                if (this.viewModel.interaction.mode === 'values') {
                    if (typeof redraw === 'function') redraw();
                }
            };
            img.onerror = () => { this._imageCache.set(key, 'failed'); };
            this._imageCache.set(key, img);
            img.src = node.image;
        }
    }

    _drawNode(node, color, alpha, fitScale) {
        const col = ColorUtils.applyAlpha(color, alpha);
        push();
        noStroke();
        fill(col);
        if (node.type === 'state') {
            circle(node.x, node.y, node.size * 2);
            // State node image (circle-clipped)
            if (node.image) {
                const key = `${node.id}:${node.image}`;
                const img = this._imageCache.get(key);
                if (img && img !== 'failed' && img.complete && img.naturalWidth > 0) {
                    drawingContext.save();
                    drawingContext.beginPath();
                    drawingContext.arc(node.x, node.y, node.size * 0.95, 0, Math.PI * 2);
                    drawingContext.clip();
                    drawingContext.globalAlpha = alpha / 255;
                    drawingContext.drawImage(img, node.x - node.size, node.y - node.size, node.size * 2, node.size * 2);
                    drawingContext.restore();
                }
            }
        } else {
            // Action node: same circle, darker shade (65% alpha over white = visually darker)
            fill(ColorUtils.applyAlpha(color, Math.round(alpha * 0.65)));
            circle(node.x, node.y, node.size * 2);
        }
        // Skip name label when node has a visible image
        const hasVisibleImage = node.image && (() => {
            const key = `${node.id}:${node.image}`;
            const img = this._imageCache.get(key);
            return img && img !== 'failed' && img.complete && img.naturalWidth > 0;
        })();
        // Action node names (e.g. "Hunt", "Eat") are omitted in the MC mini-panels - state names
        // are what matter for reading a rollout's trajectory at this scale.
        if (!hasVisibleImage && node.type === 'state') {
            const label = node.name && node.name.length > 4 ? node.name.slice(0, 3) + '…' : (node.name || '');
            const screenFontSize = Math.max(6, node.size * 0.55);
            const worldFontSize = screenFontSize / (fitScale || 1);
            fill(255);
            textSize(worldFontSize);
            textAlign(CENTER, CENTER);
            textFont(Typography.sans());
            text(label, node.x, node.y);
        }
        pop();
    }

    _drawTextLabels(fitScale) {
        const labels = this.graph.textLabels;
        if (!labels || labels.length === 0) return;
        const worldFontSize = (label) => Math.max(6 / (fitScale || 1), label.fontSize);
        fill(AppPalette.text.black);
        noStroke();
        textAlign(CENTER, CENTER);
        textFont(Typography.sans());
        for (const label of labels) {
            textSize(worldFontSize(label));
            text(label.text, label.x, label.y);
        }
    }

    _drawEdge(from, to, color, alpha) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const ux = dx / len;
        const uy = dy / len;
        const fromR = from.size || 20;
        const toR = to.size || 20;
        const x1 = from.x + ux * fromR;
        const y1 = from.y + uy * fromR;
        const x2 = to.x - ux * toR;
        const y2 = to.y - uy * toR;

        const col = ColorUtils.applyAlpha(color, alpha);
        push();
        stroke(col);
        strokeWeight(1);
        noFill();
        line(x1, y1, x2, y2);

        // Arrowhead
        const ax = x2 - ux * EXPECTATION_ARROW_SIZE;
        const ay = y2 - uy * EXPECTATION_ARROW_SIZE;
        const px = -uy;
        const py = ux;
        line(x2, y2, ax + px * EXPECTATION_ARROW_SIZE * 0.4, ay + py * EXPECTATION_ARROW_SIZE * 0.4);
        line(x2, y2, ax - px * EXPECTATION_ARROW_SIZE * 0.4, ay - py * EXPECTATION_ARROW_SIZE * 0.4);
        pop();
    }

    _drawEmptyPrompt(canvasW, canvasH) {
        fill(AppPalette.text.muted);
        noStroke();
        textSize(14);
        textAlign(CENTER, CENTER);
        textFont(Typography.sans());
        text('Set a start state in Simulate mode to compute rollouts.', canvasW / 2, canvasH / 2);
    }

    startPlay() {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        if (vm.isPlaying || !state.computed) return;
        if (state.currentT >= state.maxT) {
            state.currentT = 0;
            this._syncScrubber();
        }
        vm.isPlaying = true;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(true);
        this._scheduleNextTick();
    }

    _scheduleNextTick() {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        this._playTimer = setTimeout(() => {
            if (!vm.isPlaying) return;
            state.currentT++;
            this._syncScrubber();
            if (typeof redraw === 'function') redraw();
            this._notifyDataChanged();
            if (state.currentT >= state.maxT) {
                this.stopPlay();
            } else {
                this._scheduleNextTick();
            }
        }, this.getTickMs());
    }

    stopPlay() {
        const vm = this.expectationViewModel;
        if (this._playTimer !== null) {
            clearTimeout(this._playTimer);
            this._playTimer = null;
        }
        if (!vm.isPlaying) return;
        vm.isPlaying = false;
        if (this.onPlaybackStateChange) this.onPlaybackStateChange(false);
    }

    // Advance currentT by one tick without starting continuous playback - pauses first so a
    // step during an active play doesn't race the scheduled tick. Mirrors the single-tick body
    // of _scheduleNextTick, matching Build/VI's Step button semantics.
    step() {
        const state = this.expectationState;
        if (!state.computed) return;
        this.stopPlay();
        if (state.currentT >= state.maxT) return;
        state.currentT++;
        this._syncScrubber();
        if (typeof redraw === 'function') redraw();
        this._notifyDataChanged();
    }

    // The shared right-pane graph panel (not a full-canvas "focused" takeover) has no canonical
    // single path to label ticks with even when a run is selected, since the left pane's own
    // grid/chart view is what the scrubber really scrubs - so ticks are always plain numeric
    // ("0","1","2"...), regardless of selection. (Before the MC screen split, "focused mode"
    // used real trace-name ticks; that mode no longer exists.)
    _buildScrubberTicks() {
        const maxT = this.expectationState.maxT || 0;
        const ticks = [];
        for (let t = 0; t <= maxT; t++) ticks.push(String(t));
        return ticks;
    }

    _scrubberIndexForCurrentT() {
        return this.expectationState.currentT;
    }

    _syncScrubber() {
        if (this._scrubber) {
            this._scrubber.setPosition(this._scrubberIndexForCurrentT());
        }
    }

    setupScrubber(canvasW, canvasH, topOffset) {
        this._removeScrubber();
        this._topOffset = topOffset;

        // Reuses the single shared mainView.traceScrubber instance (constructed once in
        // main.js, Task 3) rather than constructing a private one - the whole point of the
        // shared component. Reassigns its callbacks to Monte Carlo's own handlers while this
        // sub-view is active.
        this._scrubber = mainView.traceScrubber;
        this._scrubberCallbacks = {
            onScrub: (index, isFinal) => {
                this.stopPlay();
                this.expectationState.currentT = index;
                if (typeof redraw === 'function') redraw();
                this._notifyDataChanged();
            },
            onMaxStepsChange: (value) => {
                this.expectationState.maxSteps = value;
            }
        };
        this._scrubber.callbacks = this._scrubberCallbacks;
        this._scrubber.resize(0, 0, canvasW);
        this._positionScrubberAboveDock();
        this._scrubber.show();
        this._scrubber.setTicks(this._buildScrubberTicks());
        this._scrubber.setPosition(this._scrubberIndexForCurrentT());
        this._scrubber.setMaxSteps(this.expectationState.maxSteps);
    }

    // TraceScrubber's own CSS anchors it a fixed 16px above the viewport bottom - fine for
    // Build/Policy (nothing else docked there), but Monte Carlo also shows the bottom chart
    // dock, which would otherwise render on top of (and hide) the scrubber (chart-dock's
    // z-index is higher, and the two floating elements occupy the same screen region). Lifts
    // the shared instance above the dock's current reserved height via its public `containerEl`
    // - not a change to TraceScrubber itself, just how this consumer positions the shared
    // instance while it owns it. Reset back to the CSS default in _removeScrubber() so
    // Build/Policy (which has no dock) is unaffected.
    _positionScrubberAboveDock() {
        if (!this._scrubber || !this._scrubber.containerEl) return;
        // Goes through mainView.getDockHeight() (sub-view-aware) rather than reading
        // this._chartDock.getReservedHeight() directly - the dock's own dockState.open is a
        // persistent user preference from Iteration that outlives a visit to Iteration, so a
        // raw getReservedHeight() call here would float the scrubber above a dock that isn't
        // even visible once the user has ever opened it in Iteration and come back to Monte
        // Carlo. mainView.getDockHeight() is the one place that reconciles "reserved height"
        // with which sub-view is actually active.
        const dockH = (typeof mainView !== 'undefined' && mainView) ? mainView.getDockHeight() : 0;
        this._scrubber.containerEl.style.bottom = (dockH + 16) + 'px';
    }

    updateScrubberMax() {
        if (!this._scrubber) return;
        this._scrubber.setTicks(this._buildScrubberTicks());
        this._scrubber.setPosition(0);
    }

    handleClick(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        if (!state.computed || vm.leftView !== 'grid') return;

        const { panels } = vm.panelLayout || { panels: [] };
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
                // Clicking an already-selected panel deselects it (toggle), matching this
                // codebase's other click-to-select-or-clear conventions.
                this.selectRun(vm.selectedRunIndex === i ? null : i);
                return;
            }
        }
    }

    // Sets which rollout's path the shared right-pane graph panel highlights. index === null
    // clears the selection (bare graph). Replaces the old enterFocusMode(index) - no longer
    // triggers any canvas mode switch, just updates which run is highlighted.
    selectRun(index) {
        const vm = this.expectationViewModel;
        vm.selectedRunIndex = index;
        this._notifyDataChanged();
        if (typeof redraw === 'function') redraw();
    }

    // Updates expectationViewModel.hoveredRun for the grid's own hover highlight and (later
    // phase) the chart dock's live-linking. Returns true if the hovered run changed, so callers
    // can redraw only when needed.
    handleMouseMove(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        const prevHovered = vm.hoveredRun;

        if (!state.computed || vm.leftView !== 'grid') {
            vm.hoveredRun = null;
            return prevHovered !== null;
        }

        const { panels } = vm.panelLayout || { panels: [] };
        let hovered = null;
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
                hovered = i;
                break;
            }
        }
        vm.hoveredRun = hovered;
        return hovered !== prevHovered;
    }

    // No-op: "focused mode" (and its Escape-to-exit) no longer exists after the MC screen split
    // - kept as a method (rather than removed) because main.js's global keyPressed() calls it
    // unconditionally while Values -> Monte Carlo is active.
    handleKey(key) {}

    teardown() {
        this.stopPlay();
        this._removeScrubber();
        this._imageCache.clear();
    }

    // Hides the shared scrubber and clears this view's local reference/callbacks - does NOT
    // destroy it, since it's a single instance shared with Build/Policy (mainView.traceScrubber).
    _removeScrubber() {
        if (this._scrubber) {
            if (this._scrubber.containerEl) this._scrubber.containerEl.style.bottom = '';
            this._scrubber.hide();
        }
        this._scrubber = null;
        this._scrubberCallbacks = null;
    }

    resize(canvasW, canvasH, topOffset) {
        this._topOffset = topOffset;
        if (this._scrubber) {
            this._scrubber.resize(0, 0, canvasW);
            this._positionScrubberAboveDock();
        }
        this.expectationViewModel.invalidateLayout();
        if (this._expectationChartView) {
            const { leftW } = this.expectationViewModel.splitWidths(canvasW);
            // +56 clears estimatorPill's top-left badge - see main.js's setUpMCSplitChrome()
            // for the same inset applied on initial setup/mode-entry.
            const chartTopInset = 56;
            this._expectationChartView.updateBounds(0, topOffset + chartTopInset, leftW, canvasH - chartTopInset);
        }
    }
}
