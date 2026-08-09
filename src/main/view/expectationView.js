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
        // Fade-in state for the shared right-pane graph panel's newest revealed step (Play/Step
        // only - dragging the scrubber directly always jumps instantly, see onScrub below).
        // null = nothing animating, render the selected run's path at full opacity.
        this._graphPanelReveal = null;
        // DOM floating glass panel element (created on enter, destroyed on teardown).
        this._mcPanel = null;
        // DOM compact card overlay shown in focused-run mode (Task 4).
        this._compactCard = null;
        // Active graphLeftOffset tween: { from, to, start, duration } or null.
        this._graphOffsetTween = null;
        // Active contT tween for the agent token animation in focused-run mode (Task 5).
        // { from, to, start, duration } or null.
        this._contTTween = null;
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

        // Advance active graphLeftOffset tween (Task 4 - smooth offset animation).
        this._tickGraphOffsetTween();

        // Advance active contT tween for agent token animation (Task 5).
        this._tickContTTween();

        // Focused-run mode: full-canvas graph + compact DOM card, no grid.
        if (vm.focusedRun) {
            this._drawFocusedRun(canvasW, canvasH);
            return;
        }

        // Full-bleed graph — always fills the whole canvas, shifted right of the overlay panel.
        // The vertical divider line and the 52/48 split are gone; the panel is a DOM overlay.
        this._drawFullBleedGraph(canvasW, canvasH);

        // Grid mode: render the mini-panel grid on the canvas in the panel's coordinate area.
        // The DOM panel element provides visual chrome (border, shadow, border-radius) on top.
        if (vm.leftView === 'grid') {
            const panelRect = this._getPanelCanvasBounds(canvasW, canvasH);
            if (panelRect) {
                this._drawGrid(panelRect.w, panelRect.h, panelRect.x, panelRect.y);
            }
        }
        // Chart mode: ExpectationChartView (a DOM component) renders inside the panel div.
        // Nothing extra to draw on the canvas for chart mode.
    }

    // ── DOM panel lifecycle ──────────────────────────────────────────────────────────────────

    // Creates the floating glass panel <div class="mc-panel"> and appends it to document.body.
    // Also sets expectationViewModel.graphLeftOffset so the graph centers in the right section.
    // Called on mode entry (from resize() / setupScrubber() callers in main.js).
    _createPanel() {
        if (this._mcPanel) return; // already created
        const panel = document.createElement('div');
        panel.className = 'mc-panel';
        document.body.appendChild(panel);
        this._mcPanel = panel;

        // Set graphLeftOffset to the panel's right edge + a small gap so the graph renders
        // in the right section of the canvas (panel is 44% wide + 12px left + ~24px gap).
        this._updateGraphOffset();
    }

    // Destroys the floating panel and resets graphLeftOffset to 0 (full-canvas graph).
    _destroyPanel() {
        if (this._mcPanel) {
            this._mcPanel.parentNode && this._mcPanel.parentNode.removeChild(this._mcPanel);
            this._mcPanel = null;
        }
        this.expectationViewModel.graphLeftOffset = 0;
    }

    // ── Focused-run mode (Task 4) ────────────────────────────────────────────────────────────

    // Destroys the compact DOM card shown in focused mode.
    _destroyCompactCard() {
        if (this._compactCard) {
            this._compactCard.parentNode && this._compactCard.parentNode.removeChild(this._compactCard);
            this._compactCard = null;
        }
    }

    // Starts a smooth tween from the current graphLeftOffset to `targetOffset` over `durationMs`.
    _startGraphOffsetTween(targetOffset, durationMs) {
        const currentOffset = this.expectationViewModel.graphLeftOffset;
        if (Math.abs(currentOffset - targetOffset) < 1) return; // no-op if already there
        this._graphOffsetTween = {
            from: currentOffset,
            to: targetOffset,
            start: performance.now(),
            duration: durationMs
        };
    }

    // Called each draw() frame: advances the in-progress tween and writes graphLeftOffset.
    // Schedules a redraw while the tween is active so the animation keeps running.
    _tickGraphOffsetTween() {
        const tween = this._graphOffsetTween;
        if (!tween) return;
        const elapsed = performance.now() - tween.start;
        const t = Math.min(1, elapsed / tween.duration);
        // easeInOut for smooth start+end
        const eased = EasingUtils.easeInOut(t);
        this.expectationViewModel.graphLeftOffset = tween.from + (tween.to - tween.from) * eased;
        if (t < 1) {
            if (typeof redraw === 'function') requestAnimationFrame(() => redraw());
        } else {
            this.expectationViewModel.graphLeftOffset = tween.to;
            this._graphOffsetTween = null;
        }
    }

    // Called each draw() frame: advances the contT tween and writes vm.contT.
    // Schedules a redraw while the tween is active so the token animation keeps running.
    _tickContTTween() {
        const tween = this._contTTween;
        if (!tween) return;
        const elapsed = performance.now() - tween.start;
        const raw = Math.min(1, elapsed / tween.duration);
        // Smoothstep: t² * (3 - 2t)
        const eased = raw * raw * (3 - 2 * raw);
        this.expectationViewModel.contT = tween.from + (tween.to - tween.from) * eased;
        if (raw < 1) {
            if (typeof redraw === 'function') requestAnimationFrame(() => redraw());
        } else {
            this.expectationViewModel.contT = tween.to;
            this._contTTween = null;
        }
    }

    // Starts a contT tween from vm.contT to newT over 450ms (smoothstep easing).
    // Only starts when in focused-run mode; otherwise snaps contT immediately.
    _startContTTween(newT) {
        const vm = this.expectationViewModel;
        if (!vm.focusedRun) {
            vm.contT = newT;
            return;
        }
        this._contTTween = {
            from: vm.contT,
            to: newT,
            start: performance.now(),
            duration: 450
        };
        if (typeof redraw === 'function') requestAnimationFrame(() => redraw());
    }

    // Compact card graphLeftOffset target: wide enough for the 274px card + 12px left + gap.
    _focusedGraphOffset() { return 12 + 274 + 16; } // 302px

    // Enter focused-run mode: hide the DOM panel, show compact card, animate offset.
    // index: the run to focus (should equal vm.selectedRunIndex, passed for clarity).
    enterFocusMode(index) {
        const vm = this.expectationViewModel;
        vm.selectedRunIndex = index;
        vm.focusedRun = true;
        // Snap contT to currentT so the token starts at the current position immediately,
        // without an unwanted tween from 0 (Task 5).
        this._contTTween = null;
        vm.contT = this.expectationState.currentT;

        // Animate graphLeftOffset from panel-right edge to compact-card width.
        const targetOffset = this._focusedGraphOffset();
        this._startGraphOffsetTween(targetOffset, 350);

        // Hide the main DOM panel (keep it in the DOM but invisible - avoids recreating it
        // on exit; we'll show it again in exitFocusMode).
        if (this._mcPanel) this._mcPanel.style.display = 'none';

        // Build compact card.
        this._destroyCompactCard();
        const state = this.expectationState;
        const rollout = state.getDisplaySlice()[index];
        const runNum = String(index + 1).padStart(2, '0');
        const utility = rollout ? state._getUtility(rollout, state.currentT) : 0;
        const sign = utility >= 0 ? '+' : '−';
        const utilityStr = `${sign}${Math.abs(utility).toFixed(1)}`;
        const utilityColor = utility >= 0
            ? (AppPalette.reward ? AppPalette.reward.positive : '#3fb950')
            : (AppPalette.reward ? AppPalette.reward.negative : '#f85149');

        // Build trajectory: state names only, truncated.
        let trajectoryStr = '';
        if (rollout && rollout.trace) {
            const stateNames = rollout.trace
                .filter(e => e.type === 'state')
                .map(e => e.name || e.id);
            const fullStr = stateNames.join(' → ');
            trajectoryStr = fullStr.length > 40 ? fullStr.slice(0, 39) + '…' : fullStr;
        }

        const card = document.createElement('div');
        card.className = 'mc-compact-card';

        const backLink = document.createElement('a');
        backLink.className = 'mc-back-link';
        backLink.href = '#';
        backLink.textContent = '← All runs';
        backLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.exitFocusMode();
        });

        const title = document.createElement('div');
        title.className = 'mc-run-title';
        title.textContent = `Run ${runNum}`;

        const ret = document.createElement('div');
        ret.className = 'mc-run-return';
        ret.style.color = utilityColor;
        ret.textContent = utilityStr;

        const traj = document.createElement('div');
        traj.className = 'mc-run-trajectory';
        traj.textContent = trajectoryStr;

        card.appendChild(backLink);
        card.appendChild(title);
        card.appendChild(ret);
        card.appendChild(traj);
        document.body.appendChild(card);
        this._compactCard = card;

        if (typeof redraw === 'function') redraw();
    }

    // Exit focused-run mode: show the DOM panel again, destroy compact card, animate offset back.
    exitFocusMode() {
        const vm = this.expectationViewModel;
        vm.focusedRun = false;

        // Destroy compact card.
        this._destroyCompactCard();

        // Restore main DOM panel.
        if (this._mcPanel) {
            this._mcPanel.style.display = '';
        }

        // Animate graphLeftOffset back to panel right edge.
        // We need the panel's current right edge; use _updateGraphOffset() to set the target.
        // First temporarily set graphLeftOffset to the compact-card value so the tween starts
        // from the correct "from" position (it may already be there if no tween was running).
        const fromOffset = vm.graphLeftOffset;
        // Compute panel right edge by querying the element.
        let panelRightEdge = 0;
        if (this._mcPanel) {
            const rect = this._mcPanel.getBoundingClientRect();
            panelRightEdge = rect.right + 24;
        }
        vm.graphLeftOffset = fromOffset; // preserve current for tween start
        this._graphOffsetTween = {
            from: fromOffset,
            to: panelRightEdge,
            start: performance.now(),
            duration: 350
        };

        if (typeof redraw === 'function') redraw();
    }

    // ── Agent token helpers (Task 5) ─────────────────────────────────────────────────────────

    // Evaluates a quadratic Bézier at parameter t.
    // P0, C, P1 are { x, y } objects; returns { x, y }.
    _pointOnBezier(P0, C, P1, t) {
        const mt = 1 - t;
        return {
            x: mt * mt * P0.x + 2 * mt * t * C.x + t * t * P1.x,
            y: mt * mt * P0.y + 2 * mt * t * C.y + t * t * P1.y
        };
    }

    // Returns the bézier control point for the edge from→to, using the same bow formula as
    // _drawEdge() so the token follows the rendered curve exactly.
    _controlPointFor(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
        const reverseExists = this.graph.edges.some(e =>
            e.getFromNode().id === to.id && e.getToNode().id === from.id
        );
        const bow = reverseExists ? Math.min(34, len * 0.18) : Math.min(14, len * 0.07);
        const ux = dx / len;
        const uy = dy / len;
        // Perpendicular (rotate 90° CCW, same as _drawEdge)
        const px = -uy;
        const py = ux;
        return {
            x: (from.x + to.x) / 2 + px * bow,
            y: (from.y + to.y) / 2 + py * bow
        };
    }

    // Renders the graph in focused mode: full canvas (right of compact card area), dimmer base.
    _drawFocusedRun(canvasW, canvasH) {
        const FOCUSED_DIM_ALPHA = 22; // dimmer than normal (45) to make the run path pop
        const state = this.expectationState;
        const vm = this.expectationViewModel;
        const leftOffset = vm.graphLeftOffset || 0;

        const availW = canvasW - leftOffset;
        const availH = canvasH - EXPECTATION_TOP_CLEARANCE;
        const fitTransform = vm._computeFitTransform(this.graph, availW, availH);
        if (!fitTransform) return;

        const { offsetX, offsetY, fitScale } = fitTransform;

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(leftOffset, EXPECTATION_TOP_CLEARANCE, availW, availH);
        drawingContext.clip();

        push();
        translate(leftOffset + offsetX, EXPECTATION_TOP_CLEARANCE + offsetY);
        scale(fitScale);

        // Draw all edges/nodes dim.
        for (const edge of this.graph.edges) {
            this._drawEdge(edge.getFromNode(), edge.getToNode(), AppPalette.node.state, FOCUSED_DIM_ALPHA);
        }
        for (const node of this.graph.nodes) {
            this._drawNode(node, AppPalette.node.state, FOCUSED_DIM_ALPHA, fitScale);
        }

        // Highlight the focused run's visited path with agent token animation (Task 5).
        if (vm.selectedRunIndex !== null) {
            const rollout = state.getDisplaySlice()[vm.selectedRunIndex];
            if (rollout) {
                const runColor = AppPalette.expectation.runColors[vm.selectedRunIndex % AppPalette.expectation.runColors.length];
                const currentT = state.currentT;
                const contT = vm.contT;

                // The number of trace entries revealed at currentT (integer time steps).
                const revealedCount = this._revealedCountForRolloutAtT(rollout, currentT);
                const visitedSlice = rollout.trace.slice(0, revealedCount);

                // ── Fading trail: last 3 completed hops behind the token ──────────────────
                // A "hop" is one edge (state→action or action→state). The last completed hop
                // ends at the floor of contT, so we walk backwards up to 3 hops from there.
                const trailEndStep = Math.floor(contT); // integer step where trail ends
                const TRAIL_HOPS = 3;
                // Draw trail edges (in pairs: state→action, action→state per step)
                // We draw from oldest to newest so newer hops paint over older ones.
                for (let age = TRAIL_HOPS; age >= 1; age--) {
                    const stepIdx = trailEndStep - age; // the step that was completed 'age' ago
                    if (stepIdx < 0) continue;
                    const opacity = Math.max(0.12, 1 - age / 3);
                    const alpha = Math.round(255 * opacity);
                    // Each full step covers trace indices [step*2, step*2+1, step*2+2]
                    // Draw the two half-hop edges of that step.
                    const sIdx = stepIdx * 2;
                    if (sIdx + 2 < visitedSlice.length) {
                        const stateEntry = visitedSlice[sIdx];
                        const actionEntry = visitedSlice[sIdx + 1];
                        const nextStateEntry = visitedSlice[sIdx + 2];
                        const stateNode = this.graph.getNodeById(stateEntry.id);
                        const actionNode = this.graph.getNodeById(actionEntry.id);
                        const nextStateNode = this.graph.getNodeById(nextStateEntry.id);
                        if (stateNode && actionNode) {
                            this._drawEdge(stateNode, actionNode, runColor, alpha);
                            this._drawNode(stateNode, runColor, alpha, fitScale);
                        }
                        if (actionNode && nextStateNode) {
                            this._drawEdge(actionNode, nextStateNode, runColor, alpha);
                            this._drawNode(actionNode, runColor, alpha, fitScale);
                        }
                    }
                }

                // Also draw the current step's completed portion at full opacity (the arc
                // already traveled by the token at contT fractional position).
                const curStep = Math.floor(contT);
                const curFrac = contT - curStep;
                if (curStep >= 0 && curStep * 2 + 1 < visitedSlice.length) {
                    const stateEntry = visitedSlice[curStep * 2];
                    const actionEntry = visitedSlice[curStep * 2 + 1];
                    const stateNode = this.graph.getNodeById(stateEntry.id);
                    const actionNode = this.graph.getNodeById(actionEntry.id);
                    if (stateNode && actionNode) {
                        this._drawNode(stateNode, runColor, 255, fitScale);
                        if (curFrac >= 0.5 && curStep * 2 + 2 < visitedSlice.length) {
                            // First half of this step is fully crossed; draw state→action edge.
                            this._drawEdge(stateNode, actionNode, runColor, 255);
                            // Draw action node and start of second half.
                            this._drawNode(actionNode, runColor, 255, fitScale);
                        }
                    }
                }

                // ── Agent token: position along bézier arcs ────────────────────────────────
                const isAtRest = Math.abs(contT - Math.round(contT)) < 0.001 &&
                                  Number.isInteger(Math.round(contT));
                if (!isAtRest && visitedSlice.length >= 2) {
                    // Token is travelling. Compute its position on the bézier.
                    const step = Math.floor(contT);
                    const frac = contT - step;
                    let tokenPos = null;

                    if (frac < 0.5) {
                        // First half: state → action node
                        const sIdx = step * 2;
                        const aIdx = step * 2 + 1;
                        if (sIdx < visitedSlice.length && aIdx < visitedSlice.length) {
                            const fromNode = this.graph.getNodeById(visitedSlice[sIdx].id);
                            const toNode = this.graph.getNodeById(visitedSlice[aIdx].id);
                            if (fromNode && toNode) {
                                const C = this._controlPointFor(fromNode, toNode);
                                tokenPos = this._pointOnBezier(fromNode, C, toNode, frac * 2);
                            }
                        }
                    } else {
                        // Second half: action → next state
                        const aIdx = step * 2 + 1;
                        const nsIdx = step * 2 + 2;
                        if (aIdx < visitedSlice.length && nsIdx < visitedSlice.length) {
                            const fromNode = this.graph.getNodeById(visitedSlice[aIdx].id);
                            const toNode = this.graph.getNodeById(visitedSlice[nsIdx].id);
                            if (fromNode && toNode) {
                                const C = this._controlPointFor(fromNode, toNode);
                                tokenPos = this._pointOnBezier(fromNode, C, toNode, (frac - 0.5) * 2);
                            }
                        }
                    }

                    if (tokenPos) {
                        // Outer glow circle (r=16, 18% opacity)
                        const glowCol = ColorUtils.applyAlpha(runColor, Math.round(255 * 0.18));
                        noStroke();
                        fill(glowCol);
                        circle(tokenPos.x, tokenPos.y, 32); // diameter = 2*16

                        // Filled token circle (r=8, 1px white stroke)
                        stroke(255);
                        strokeWeight(1 / fitScale);
                        fill(runColor);
                        circle(tokenPos.x, tokenPos.y, 16); // diameter = 2*8
                    }
                } else if (isAtRest && visitedSlice.length > 0) {
                    // Token is at rest at an integer contT. Draw double highlight ring around
                    // the current state node (the state at trace[curStep*2]).
                    const restStep = Math.round(contT);
                    const sIdx = restStep * 2;
                    if (sIdx < visitedSlice.length) {
                        const stateEntry = visitedSlice[sIdx];
                        const stateNode = this.graph.getNodeById(stateEntry.id);
                        if (stateNode && stateNode.type === 'state') {
                            // Redraw the node in run color at full opacity.
                            this._drawNode(stateNode, runColor, 255, fitScale);
                            const nr = stateNode.size || 20;
                            noFill();
                            // Inner ring: run color, r = nodeRadius + 6, strokeWeight 2.5px
                            stroke(runColor);
                            strokeWeight(2.5 / fitScale);
                            circle(stateNode.x, stateNode.y, (nr + 6) * 2);
                            // Outer ring: run color, r = nodeRadius + 11, strokeWeight 1px, 35% opacity
                            stroke(ColorUtils.applyAlpha(runColor, Math.round(255 * 0.35)));
                            strokeWeight(1 / fitScale);
                            circle(stateNode.x, stateNode.y, (nr + 11) * 2);
                        }
                    }
                }
            }
        }

        this._drawTextLabels(fitScale);

        pop();
        drawingContext.restore();
    }

    // Computes the panel's right edge in screen pixels and writes graphLeftOffset accordingly.
    // Called on _createPanel() and resize() so the offset stays in sync with window size.
    _updateGraphOffset() {
        if (!this._mcPanel) return;
        // The CSS panel is 44% of window width (capped to min-width 340) + 12px left margin.
        // We query the element's actual rendered width to stay in sync with CSS exactly.
        const rect = this._mcPanel.getBoundingClientRect();
        // +24px gap between panel right edge and graph area
        this.expectationViewModel.graphLeftOffset = rect.right + 24;
    }

    // Returns the panel's bounding box in canvas/p5 coordinate space (accounting for the
    // topbar offset so canvas-y=0 aligns with the top of the p5 drawing surface).
    // Returns null if the panel element doesn't exist.
    _getPanelCanvasBounds(canvasW, canvasH) {
        if (!this._mcPanel) return null;
        const rect = this._mcPanel.getBoundingClientRect();
        const topBarH = this._topOffset || 0;
        return {
            x: rect.left,
            y: rect.top - topBarH,
            w: rect.width,
            h: rect.height
        };
    }

    // ── Full-bleed graph ─────────────────────────────────────────────────────────────────────

    // Graph fills the whole canvas, centered in the region right of graphLeftOffset.
    // Replaces the old _drawGraphPanel(leftW, rightW) which only rendered in the right 48%.
    _drawFullBleedGraph(canvasW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;
        const leftOffset = vm.graphLeftOffset || 0;

        const availW = canvasW - leftOffset;
        const availH = canvasH - EXPECTATION_TOP_CLEARANCE;
        const fitTransform = vm._computeFitTransform(this.graph, availW, availH);
        if (!fitTransform) return;

        const { offsetX, offsetY, fitScale } = fitTransform;

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(leftOffset, EXPECTATION_TOP_CLEARANCE, availW, availH);
        drawingContext.clip();

        push();
        translate(leftOffset + offsetX, EXPECTATION_TOP_CLEARANCE + offsetY);
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
                const visitedSlice = rollout.trace.slice(0, this._revealedCountForRolloutAtT(rollout, currentT));

                const reveal = this._graphPanelReveal;
                const animating = reveal && reveal.toCount === visitedSlice.length;
                const fadeFromIndex = animating ? reveal.fromCount : visitedSlice.length;
                const fadeAlpha = animating
                    ? Math.round(255 * EasingUtils.easeOut(Math.min(1, (performance.now() - reveal.startTime) / 280)))
                    : 255;
                const alphaForIndex = (idx) => idx < fadeFromIndex ? 255 : fadeAlpha;

                for (let k = 0; k + 1 < visitedSlice.length; k++) {
                    const fromNode = this.graph.getNodeById(visitedSlice[k].id);
                    const toNode = this.graph.getNodeById(visitedSlice[k + 1].id);
                    if (fromNode && toNode) this._drawEdge(fromNode, toNode, runColor, alphaForIndex(k + 1));
                }
                const lastIdx = visitedSlice.length - 1;
                visitedSlice.forEach((entry, idx) => {
                    const node = this.graph.getNodeById(entry.id);
                    if (!node) return;
                    const color = idx === lastIdx ? AppPalette.node.activeInitial : runColor;
                    this._drawNode(node, color, alphaForIndex(idx), fitScale);
                });

                // Traveling ball along the newest chunk's path
                if (animating && reveal.toCount - reveal.fromCount > 0) {
                    const waypoints = visitedSlice
                        .slice(reveal.fromCount - 1, reveal.toCount)
                        .map(entry => this.graph.getNodeById(entry.id))
                        .filter(Boolean);
                    if (waypoints.length >= 2) {
                        const t = Math.min(1, (performance.now() - reveal.startTime) / 280);
                        const eased = EasingUtils.easeInOut(t);
                        const segCount = waypoints.length - 1;
                        const segProgress = eased * segCount;
                        const segIndex = Math.min(segCount - 1, Math.floor(segProgress));
                        const segT = segProgress - segIndex;
                        const from = waypoints[segIndex];
                        const to = waypoints[segIndex + 1];
                        const bx = from.x + (to.x - from.x) * segT;
                        const by = from.y + (to.y - from.y) * segT;
                        noStroke();
                        fill(AppPalette.simulation.travelBall);
                        circle(bx, by, Math.max(4, (from.size || 20) * 0.35));
                    }
                }
            }
        }

        this._drawTextLabels(fitScale);

        pop();
        drawingContext.restore();

        // "Run XX · G = x.xx" label in the top-left of the graph area when a run is selected
        if (vm.selectedRunIndex !== null) {
            const rollout = state.getDisplaySlice()[vm.selectedRunIndex];
            if (rollout) {
                const utility = state._getUtility(rollout, state.currentT);
                noStroke();
                fill(AppPalette.accent.yellow);
                textSize(13);
                textAlign(LEFT, TOP);
                textFont(Typography.mono());
                text(`Run ${String(vm.selectedRunIndex + 1).padStart(2, '0')} · G = ${utility.toFixed(2)}`, leftOffset + 12, EXPECTATION_TOP_CLEARANCE + 10);
            }
        }
    }

    // ── Grid (rendered on canvas in the DOM panel's coordinate area) ───────────────────────

    // Episode mini-panel grid rendered on the p5 canvas within the floating panel's bounds.
    // panelW/H: the panel's rendered size; panelX/Y: its top-left in canvas coordinates.
    // (The DOM panel provides border/shadow chrome on top; canvas provides pixel content below.)
    _drawGrid(panelW, panelH, panelX, panelY) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;

        // Small inset so grid content clears the panel's border-radius corners.
        const INSET = 8;
        const gridW = panelW - INSET * 2;
        const gridH = panelH - INSET * 2;
        const gridX = panelX + INSET;
        const gridY = panelY + INSET;

        // Store grid origin for handleClick / handleMouseMove hit-testing.
        this._gridOrigin = { x: gridX, y: gridY };

        if (vm.layoutStale) {
            vm.computeLayout(gridW, gridH, state.displayRuns, this.graph, 0);
        }
        if (!vm.panelLayout) {
            // Draw prompt centered inside the panel area (not the full canvas).
            this._drawEmptyPrompt(2 * panelX + panelW, 2 * panelY + panelH);
            return;
        }

        const { panels, fitTransform, topOffset } = vm.panelLayout;
        if (!fitTransform) {
            this._drawEmptyPrompt(2 * panelX + panelW, 2 * panelY + panelH);
            return;
        }

        const { offsetX, offsetY, fitScale } = fitTransform;
        const currentT = state.currentT;
        const runColors = AppPalette.expectation.runColors;
        const scrollY = vm.gridScrollY;
        const viewportTop = gridY;
        const viewportBottom = gridY + gridH;

        // Outer clip for the whole scrollable viewport so panel content doesn't escape
        // the rounded corners or bleed into the graph area behind it.
        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(gridX, viewportTop, gridW, gridH);
        drawingContext.clip();

        const displaySlice = state.getDisplaySlice();
        const hoveredRun = vm.hoveredRun;
        const selectedRun = vm.selectedRunIndex;
        for (let i = 0; i < displaySlice.length; i++) {
            const panel = panels[i];
            if (!panel) continue;

            // Screen-space position: content-space panel.x/y, offset into the panel's area.
            const sx = gridX + panel.x;
            const sy = viewportTop + panel.y - scrollY;

            // Cull panels fully outside the visible viewport.
            if (sy + panel.h < viewportTop || sy > viewportBottom) continue;

            const rollout = displaySlice[i];
            const runColor = runColors[i % runColors.length];
            const isHovered = hoveredRun === i;
            const isSelected = selectedRun === i;

            drawingContext.save();
            drawingContext.beginPath();
            drawingContext.rect(sx, sy, panel.w, panel.h);
            drawingContext.clip();

            // Draw panel background
            fill(isHovered ? AppPalette.surface.hoverCard : AppPalette.surface.card);
            noStroke();
            rect(sx, sy, panel.w, panel.h, 9);

            push();
            translate(sx + offsetX, sy + offsetY);
            scale(fitScale);

            // Draw all edges dim
            for (const edge of this.graph.edges) {
                const from = edge.getFromNode();
                const to = edge.getToNode();
                this._drawEdge(from, to, AppPalette.node.state, EXPECTATION_DIM_ALPHA);
            }

            // Draw all nodes dim - no name labels in the grid's mini-panels (too small to be
            // legible at this scale, and the full-bleed graph panel is where node names
            // are meant to be read now).
            for (const node of this.graph.nodes) {
                this._drawNode(node, AppPalette.node.state, EXPECTATION_DIM_ALPHA, fitScale, false);
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
                    this._drawNode(node, runColor, 255, fitScale, false);
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
            text(`#${String(i + 1).padStart(2, '0')}`, sx + 4, sy + 3);

            textAlign(RIGHT, TOP);
            fill(utility >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative);
            const sign = utility >= 0 ? '+' : '−';
            text(`${sign}${Math.abs(utility).toFixed(1)}`, sx + panel.w - 4, sy + 3);

            // Panel border - color reflects hover OR selection; stroke weight never changes so
            // the border doesn't visually "jump" in thickness.
            noFill();
            stroke((isHovered || isSelected) ? runColor : AppPalette.border.medium);
            strokeWeight(1);
            rect(sx, sy, panel.w, panel.h, 9);
        }

        drawingContext.restore();
    }

    // Shared right-pane graph panel (48% of canvasW, always visible regardless of leftView).
    // Bare graph when nothing is selected; the selected run's visited-so-far path (synced to the
    // shared scrubber's currentT) is highlighted otherwise. Replaces the old full-canvas
    // "focused mode" (_drawFocusedPanel) - same rendering approach, just always-on and pane-
    // scoped instead of a modal takeover.
    // Number of trace entries visible at time t for a given rollout - the same 2*effectiveT+1
    // sizing _drawGraphPanel's highlight loop already used, extracted so the reveal-fade trigger
    // (step()/_scheduleNextTick()) and the render itself agree on exactly what "one step" means.
    _revealedCountForRolloutAtT(rollout, t) {
        const effectiveT = Math.min(t, rollout.numSteps);
        return 2 * effectiveT + 1;
    }

    // Starts (or restarts) a fade-in of the trace entries between fromCount and toCount - the
    // chunk newly revealed by a single Play/Step advance. No-ops if there's nothing new to
    // reveal (toCount <= fromCount, e.g. stepping past the rollout's own end).
    _startGraphPanelReveal(fromCount, toCount) {
        if (toCount <= fromCount) return;
        this._graphPanelReveal = { fromCount, toCount, startTime: performance.now() };
        this._runGraphPanelRevealLoop();
    }

    _runGraphPanelRevealLoop() {
        const DURATION_MS = 280;
        const tick = () => {
            if (!this._graphPanelReveal) return;
            const elapsed = performance.now() - this._graphPanelReveal.startTime;
            if (typeof redraw === 'function') redraw();
            if (elapsed < DURATION_MS) {
                requestAnimationFrame(tick);
            } else {
                this._graphPanelReveal = null;
                if (typeof redraw === 'function') redraw();
            }
        };
        requestAnimationFrame(tick);
    }

    // _drawGraphPanel() removed — replaced by _drawFullBleedGraph() which renders the graph
    // across the full canvas (right of the floating panel). See draw() above.

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

    _drawNode(node, color, alpha, fitScale, showLabel = true) {
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
        if (!hasVisibleImage && showLabel) {
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
        // Self-loop guard
        if (from.id === to.id) return;

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        const fromR = from.size || 20;
        const toR = to.size || 20;

        // Check whether a reverse edge exists to determine bow amount
        const reverseExists = this.graph.edges.some(e =>
            e.getFromNode().id === to.id && e.getToNode().id === from.id
        );
        const bow = reverseExists
            ? Math.min(34, len * 0.18)
            : Math.min(14, len * 0.07);

        // Perpendicular unit vector (rotate chord 90° CCW)
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy;
        const perpY = ux;

        // Control point C = midpoint + perp * bow
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const cx = midX + perpX * bow;
        const cy = midY + perpY * bow;

        // Quadratic Bézier helpers
        // P(t) = (1-t)^2 * P0 + 2*(1-t)*t * C + t^2 * P1
        const P0x = from.x, P0y = from.y;
        const P1x = to.x,   P1y = to.y;

        const bezierPt = (t) => {
            const mt = 1 - t;
            return {
                x: mt * mt * P0x + 2 * mt * t * cx + t * t * P1x,
                y: mt * mt * P0y + 2 * mt * t * cy + t * t * P1y
            };
        };

        const bezierTangent = (t) => {
            const mt = 1 - t;
            return {
                x: 2 * mt * (cx - P0x) + 2 * t * (P1x - cx),
                y: 2 * mt * (cy - P0y) + 2 * t * (P1y - cy)
            };
        };

        // Binary search: find t_start where |P(t) - P0| = fromR
        let tStartLo = 0, tStartHi = 1;
        for (let i = 0; i < 10; i++) {
            const tMid = (tStartLo + tStartHi) / 2;
            const pt = bezierPt(tMid);
            const distFromP0 = Math.sqrt((pt.x - P0x) * (pt.x - P0x) + (pt.y - P0y) * (pt.y - P0y));
            if (distFromP0 < fromR) {
                tStartLo = tMid;
            } else {
                tStartHi = tMid;
            }
        }
        const tStart = (tStartLo + tStartHi) / 2;

        // Binary search: find t_end where |P(t) - P1| = toR
        // Search from tStart to 1.0; we want the last t where dist > toR
        let tEndLo = tStart, tEndHi = 1;
        for (let i = 0; i < 10; i++) {
            const tMid = (tEndLo + tEndHi) / 2;
            const pt = bezierPt(tMid);
            const distFromP1 = Math.sqrt((pt.x - P1x) * (pt.x - P1x) + (pt.y - P1y) * (pt.y - P1y));
            if (distFromP1 > toR) {
                tEndLo = tMid;
            } else {
                tEndHi = tMid;
            }
        }
        const tEnd = (tEndLo + tEndHi) / 2;

        // Ensure t_start < t_end (degenerate case: nodes too close)
        if (tEnd <= tStart) return;

        const startPt = bezierPt(tStart);
        const endPt   = bezierPt(tEnd);

        // Parse color string once for drawingContext use
        const col = ColorUtils.applyAlpha(color, alpha);

        // Draw curve as polyline (20 segments from tStart to tEnd) using drawingContext
        drawingContext.save();
        drawingContext.strokeStyle = col;
        drawingContext.lineWidth = 1;
        drawingContext.beginPath();
        drawingContext.moveTo(startPt.x, startPt.y);
        const SEGMENTS = 20;
        for (let i = 1; i <= SEGMENTS; i++) {
            const t = tStart + (tEnd - tStart) * (i / SEGMENTS);
            const pt = bezierPt(t);
            drawingContext.lineTo(pt.x, pt.y);
        }
        drawingContext.stroke();

        // Arrowhead aligned to tangent at tEnd
        const tan = bezierTangent(tEnd);
        const tanLen = Math.sqrt(tan.x * tan.x + tan.y * tan.y);
        if (tanLen > 0) {
            const tx = tan.x / tanLen;
            const ty = tan.y / tanLen;
            const ax = endPt.x - tx * EXPECTATION_ARROW_SIZE;
            const ay = endPt.y - ty * EXPECTATION_ARROW_SIZE;
            const px = -ty;
            const py = tx;
            drawingContext.beginPath();
            drawingContext.moveTo(endPt.x, endPt.y);
            drawingContext.lineTo(ax + px * EXPECTATION_ARROW_SIZE * 0.4, ay + py * EXPECTATION_ARROW_SIZE * 0.4);
            drawingContext.moveTo(endPt.x, endPt.y);
            drawingContext.lineTo(ax - px * EXPECTATION_ARROW_SIZE * 0.4, ay - py * EXPECTATION_ARROW_SIZE * 0.4);
            drawingContext.stroke();
        }

        drawingContext.restore();
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

        // "Animations · per mode" (Monte Carlo) off - jump straight to the fully-revealed end
        // state instead of ticking through _scheduleNextTick(); reuses the exact instant-jump
        // scrubber-drag/selectRun() already use (_graphPanelReveal = null cancels the fade/
        // travel-ball reveal), then finishes via the same stopPlay() _scheduleNextTick() itself
        // calls once currentT reaches maxT.
        if (!this.viewModel.mcAnimationEnabled) {
            state.currentT = state.maxT;
            this._graphPanelReveal = null;
            this._syncScrubber();
            if (typeof redraw === 'function') redraw();
            this._notifyDataChanged();
            this.stopPlay();
            return;
        }

        this._scheduleNextTick();
    }

    _scheduleNextTick() {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        this._playTimer = setTimeout(() => {
            if (!vm.isPlaying) return;
            const oldT = state.currentT;
            state.currentT++;
            this._maybeAnimateReveal(oldT, state.currentT);
            // Start contT tween for agent token animation in focused-run mode (Task 5).
            if (vm.focusedRun) this._startContTTween(state.currentT);
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

    // Triggers the right-pane graph panel's fade-in for the step just taken (Play tick or the
    // Step button - see step() below), if a run is currently selected. No-op otherwise; scrubber
    // drags never call this (see onScrub in setupScrubber()), so dragging always jumps instantly.
    _maybeAnimateReveal(oldT, newT) {
        const vm = this.expectationViewModel;
        if (vm.selectedRunIndex === null) return;
        const rollout = this.expectationState.getDisplaySlice()[vm.selectedRunIndex];
        if (!rollout) return;
        this._startGraphPanelReveal(
            this._revealedCountForRolloutAtT(rollout, oldT),
            this._revealedCountForRolloutAtT(rollout, newT)
        );
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
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        if (!state.computed) return;
        this.stopPlay();
        if (state.currentT >= state.maxT) return;
        const oldT = state.currentT;
        state.currentT++;
        this._maybeAnimateReveal(oldT, state.currentT);
        // Start contT tween for agent token animation in focused-run mode (Task 5).
        if (vm.focusedRun) this._startContTTween(state.currentT);
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
                const vm = this.expectationViewModel;
                this.stopPlay();
                const oldT = this.expectationState.currentT;
                this.expectationState.currentT = index;
                // Dragging the scrubber always jumps instantly - cancel any in-progress
                // Play/Step reveal fade so it doesn't keep animating toward a position the drag
                // has already moved past.
                this._graphPanelReveal = null;
                // In focused-run mode: if this is a final scrub (finger-up / mouseup), start a
                // contT tween so the agent token glides to the new position. While still
                // dragging (isFinal === false), snap contT directly to keep the token responsive.
                if (vm.focusedRun) {
                    if (isFinal && oldT !== index) {
                        this._startContTTween(index);
                    } else {
                        this._contTTween = null;
                        vm.contT = index;
                    }
                }
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
        if (!state.computed || vm.leftView !== 'grid' || !vm.panelLayout) return;

        // Map screen-space click into the grid's content space.
        // _gridOrigin is set in _drawGrid to the top-left of the grid inset area.
        const origin = this._gridOrigin || { x: 0, y: 0 };
        const cx = mx - origin.x;
        const cy = my - origin.y + vm.gridScrollY;
        const { panels } = vm.panelLayout;
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) {
                // selectRun() handles all state transitions:
                // - first click on a new card: highlight in graph
                // - click on already-selected card: enter focused mode
                // - click while in focused mode: switch focused run
                this.selectRun(i);
                return;
            }
        }
        // Click landed on empty canvas outside any card → deselect and exit focused mode.
        this.selectRun(null);
    }

    // Scrolls the Grid view's fixed-size panel layout vertically. deltaY follows the native
    // WheelEvent convention (positive = scroll down). Returns true if the event was consumed
    // (there's something to scroll and the Grid view is showing), so the caller (mainView.js's
    // mouseWheel()) knows whether to suppress the page's own default scroll.
    handleWheel(deltaY) {
        const vm = this.expectationViewModel;
        if (vm.leftView !== 'grid' || !vm.panelLayout) return false;
        const maxScrollY = vm.panelLayout.maxScrollY || 0;
        if (maxScrollY <= 0) return false;
        vm.gridScrollY = Math.min(Math.max(0, vm.gridScrollY + deltaY), maxScrollY);
        if (typeof redraw === 'function') redraw();
        return true;
    }

    // Sets which rollout's path the graph highlights.
    // - index === null: deselect and exit focused mode.
    // - First click on a new card: highlight run in graph (panel stays open).
    // - Clicking the already-selected card: enter focused mode (panel hides, full-canvas graph).
    // - Clicking any card while already in focused mode: stay focused, just switch run.
    selectRun(index) {
        const vm = this.expectationViewModel;

        if (index === null) {
            // Deselect: exit focused mode if active, clear selection.
            if (vm.focusedRun) this.exitFocusMode();
            vm.selectedRunIndex = null;
            this._graphPanelReveal = null;
            this._notifyDataChanged();
            if (typeof redraw === 'function') redraw();
            return;
        }

        if (vm.focusedRun) {
            // Already in focused mode - just switch to the new run without toggling mode.
            vm.selectedRunIndex = index;
            this._graphPanelReveal = null;
            this._updateCompactCard(index);
            this._notifyDataChanged();
            if (typeof redraw === 'function') redraw();
            return;
        }

        if (vm.selectedRunIndex === index) {
            // Second click on the already-selected card → enter focused mode.
            this.enterFocusMode(index);
            return;
        }

        // First click on a new card: highlight in graph, panel stays open.
        vm.selectedRunIndex = index;
        this._graphPanelReveal = null;
        this._notifyDataChanged();
        if (typeof redraw === 'function') redraw();
    }

    // Updates the compact card's content when the focused run changes without rebuilding the DOM.
    _updateCompactCard(index) {
        if (!this._compactCard) return;
        const state = this.expectationState;
        const rollout = state.getDisplaySlice()[index];
        if (!rollout) return;

        const runNum = String(index + 1).padStart(2, '0');
        const title = this._compactCard.querySelector('.mc-run-title');
        if (title) title.textContent = `Run ${runNum}`;

        const utility = state._getUtility(rollout, state.currentT);
        const sign = utility >= 0 ? '+' : '−';
        const utilityStr = `${sign}${Math.abs(utility).toFixed(1)}`;
        const utilityColor = utility >= 0
            ? (AppPalette.reward ? AppPalette.reward.positive : '#3fb950')
            : (AppPalette.reward ? AppPalette.reward.negative : '#f85149');
        const ret = this._compactCard.querySelector('.mc-run-return');
        if (ret) { ret.textContent = utilityStr; ret.style.color = utilityColor; }

        let trajectoryStr = '';
        if (rollout.trace) {
            const stateNames = rollout.trace
                .filter(e => e.type === 'state')
                .map(e => e.name || e.id);
            const fullStr = stateNames.join(' → ');
            trajectoryStr = fullStr.length > 40 ? fullStr.slice(0, 39) + '…' : fullStr;
        }
        const traj = this._compactCard.querySelector('.mc-run-trajectory');
        if (traj) traj.textContent = trajectoryStr;
    }

    // Updates expectationViewModel.hoveredRun for the grid's own hover highlight and (later
    // phase) the chart dock's live-linking. Returns true if the hovered run changed, so callers
    // can redraw only when needed.
    handleMouseMove(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        const prevHovered = vm.hoveredRun;

        if (!state.computed || vm.leftView !== 'grid' || !vm.panelLayout) {
            vm.hoveredRun = null;
            return prevHovered !== null;
        }

        const origin = this._gridOrigin || { x: 0, y: 0 };
        const cx = mx - origin.x;
        const cy = my - origin.y + vm.gridScrollY;
        const { panels } = vm.panelLayout;
        let hovered = null;
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (cx >= p.x && cx <= p.x + p.w && cy >= p.y && cy <= p.y + p.h) {
                hovered = i;
                break;
            }
        }
        vm.hoveredRun = hovered;
        return hovered !== prevHovered;
    }

    // Escape key exits focused mode (if active); otherwise no-op.
    // Called unconditionally by main.js's keyPressed() while Monte Carlo is active.
    handleKey(key) {
        if (key === 'Escape' || key === 'Esc') {
            const vm = this.expectationViewModel;
            if (vm.focusedRun) this.exitFocusMode();
        }
    }

    teardown() {
        this.stopPlay();
        this._removeScrubber();
        this._destroyPanel();
        this._destroyCompactCard();
        this._graphOffsetTween = null;
        this._contTTween = null;
        this.expectationViewModel.contT = 0;
        this.expectationViewModel.focusedRun = false;
        this._imageCache.clear();
        // Its rAF loop checks `if (!this._graphPanelReveal) return;` every frame, so clearing
        // this is enough to stop it - no separate cancelAnimationFrame handle to track.
        this._graphPanelReveal = null;
        this._gridOrigin = null;
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
        // Keep the floating panel's graphLeftOffset in sync with the new window size.
        this._updateGraphOffset();
        if (this._expectationChartView) {
            // Chart view lives inside the floating mc-panel. Use the panel's actual rendered
            // bounds so the chart fills the panel correctly after a window resize.
            if (this._mcPanel) {
                const rect = this._mcPanel.getBoundingClientRect();
                const chartTopInset = 56; // clears estimatorPill's top-left method badge
                this._expectationChartView.updateBounds(rect.left, topOffset + chartTopInset, rect.width, rect.height - chartTopInset);
            } else {
                // Fallback: use old split-based bounds when panel hasn't been created yet.
                const { leftW } = this.expectationViewModel.splitWidths(canvasW);
                const chartTopInset = 56;
                this._expectationChartView.updateBounds(0, topOffset + chartTopInset, leftW, canvasH - chartTopInset);
            }
        }
    }
}
