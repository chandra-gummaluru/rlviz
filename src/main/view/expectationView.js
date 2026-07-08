const EXPECTATION_SCRUBBER_H = ExpectationScrubber.HEIGHT_PX;
const EXPECTATION_LABEL_H = 18;
const EXPECTATION_PADDING = 12;
const EXPECTATION_ARROW_SIZE = 8;
const EXPECTATION_DIM_ALPHA = 45;
const EXPECTATION_Y_STEP = 0.12;

class ExpectationView {
    constructor(canvasViewModel, expectationViewModel, expectationState, graph) {
        this.viewModel = canvasViewModel;
        this.expectationViewModel = expectationViewModel;
        this.expectationState = expectationState;
        this.graph = graph;
        this._scrubber = null;
        this._playTimer = null;
        this._rightPanel = null;
        this._chartDock = null;
        this.onPlaybackStateChange = null;
        this._topOffset = 96; // corrected immediately by resize(), matches menubar(42) + toolbar(54)
        this._imageCache = new Map();
        this._backBtn = null;
    }

    setRightPanel(rightPanel) {
        this._rightPanel = rightPanel;
    }

    setChartDock(chartDock) {
        this._chartDock = chartDock;
    }

    _notifyDataChanged() {
        if (this._rightPanel) this._rightPanel.updateExpectationData();
        if (this._chartDock) this._chartDock.refresh();
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

        if (vm.focusedRunIndex !== null) {
            this._drawFocusedPanel(canvasW, canvasH);
            return;
        }

        if (vm.layoutStale) {
            vm.computeLayout(canvasW, canvasH - EXPECTATION_SCRUBBER_H, state.displayRuns, this.graph);
        }
        if (!vm.panelLayout) {
            this._drawEmptyPrompt(canvasW, canvasH);
            return;
        }

        const { panels, fitTransform } = vm.panelLayout;
        if (!fitTransform) {
            this._drawEmptyPrompt(canvasW, canvasH);
            return;
        }

        const { offsetX, offsetY, fitScale } = fitTransform;
        const currentT = state.currentT;
        const runColors = AppPalette.expectation.runColors;

        const displaySlice = state.getDisplaySlice();
        const hoveredRun = vm.hoveredRun;
        for (let i = 0; i < displaySlice.length; i++) {
            const panel = panels[i];
            if (!panel) continue;
            const rollout = displaySlice[i];
            const runColor = runColors[i % runColors.length];
            const isHovered = hoveredRun === i;

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

            // Panel border - only the color changes on hover, not the stroke weight, so the
            // border doesn't visually "jump" in thickness as the mouse moves across the grid.
            noFill();
            stroke(isHovered ? AppPalette.accent.orange : AppPalette.border.medium);
            strokeWeight(1);
            rect(panel.x, panel.y, panel.w, panel.h, 9);
        }
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
        if (!hasVisibleImage) {
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
        }, 250);
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

    _syncScrubber() {
        if (this._scrubber) {
            this._scrubber.updatePosition(this.expectationState.currentT);
        }
    }

    setupScrubber(canvasW, canvasH, topOffset) {
        this._removeScrubber();
        this._topOffset = topOffset;

        this._scrubber = new ExpectationScrubber(this.expectationState, (t, isFinal) => {
            this.stopPlay();
            this.expectationState.currentT = t;
            if (typeof redraw === 'function') redraw();
            this._notifyDataChanged();
        });

        const y = topOffset + canvasH - EXPECTATION_SCRUBBER_H;
        this._scrubber.mount(0, y, canvasW);

        const vm = this.expectationViewModel;
        const focusedRollout = vm.focusedRunIndex !== null
            ? this.expectationState.getDisplaySlice()[vm.focusedRunIndex]
            : null;
        this._scrubber.setRolloutForRewardDots(focusedRollout);
    }

    updateScrubberMax() {
        if (!this._scrubber) return;
        this._scrubber.rebuildForNewMaxT();
        this._scrubber.updatePosition(0);
    }

    handleClick(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        if (!state.computed) return;

        if (vm.focusedRunIndex !== null) {
            return;
        }

        const { panels } = vm.panelLayout || { panels: [] };
        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            if (mx >= p.x && mx <= p.x + p.w && my >= p.y && my <= p.y + p.h) {
                this.enterFocusMode(i);
                return;
            }
        }
    }

    // Updates expectationViewModel.hoveredRun for the grid's own hover highlight and (later
    // phase) the chart dock's live-linking. Returns true if the hovered run changed, so callers
    // can redraw only when needed.
    handleMouseMove(mx, my) {
        const vm = this.expectationViewModel;
        const state = this.expectationState;
        const prevHovered = vm.hoveredRun;

        if (!state.computed || vm.focusedRunIndex !== null) {
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

    enterFocusMode(index) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;
        if (index < 0 || index >= state.getDisplaySlice().length) return;
        vm.focusedRunIndex = index;
        vm.hoveredRun = null;
        this._createBackButton();
        if (this._scrubber) this._scrubber.setRolloutForRewardDots(state.getDisplaySlice()[index]);
        this._notifyDataChanged();
        if (typeof redraw === 'function') redraw();
    }

    exitFocusMode() {
        const vm = this.expectationViewModel;
        if (vm.focusedRunIndex === null) return;
        vm.focusedRunIndex = null;
        this._removeBackButton();
        vm.invalidateLayout();
        if (this._scrubber) this._scrubber.setRolloutForRewardDots(null);
        this._notifyDataChanged();
        if (typeof redraw === 'function') redraw();
    }

    handleKey(key) {
        if (key === 'Escape') this.exitFocusMode();
    }

    _createBackButton() {
        this._removeBackButton();
        const btn = document.createElement('div');
        btn.className = 'expectation-back-btn';
        btn.textContent = '← All runs';
        btn.style.top = (this._topOffset + 8) + 'px';
        btn.style.left = '8px';
        btn.addEventListener('click', () => this.exitFocusMode());
        document.body.appendChild(btn);
        this._backBtn = btn;
    }

    _removeBackButton() {
        if (this._backBtn) {
            this._backBtn.remove();
            this._backBtn = null;
        }
    }

    _drawFocusedPanel(canvasW, canvasH) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;
        const rollout = state.getDisplaySlice()[vm.focusedRunIndex];
        if (!rollout) return;

        const availH = canvasH - EXPECTATION_SCRUBBER_H;
        const fitTransform = this.expectationViewModel._computeFitTransform(this.graph, canvasW, availH);
        if (!fitTransform) return;

        const { offsetX, offsetY, fitScale } = fitTransform;
        const runColor = AppPalette.expectation.runColors[vm.focusedRunIndex % AppPalette.expectation.runColors.length];
        const currentT = state.currentT;

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(0, 0, canvasW, availH);
        drawingContext.clip();

        fill(AppPalette.surface.card);
        noStroke();
        rect(0, 0, canvasW, availH);

        push();
        translate(offsetX, offsetY);
        scale(fitScale);

        for (const edge of this.graph.edges) {
            this._drawEdge(edge.getFromNode(), edge.getToNode(), AppPalette.node.state, EXPECTATION_DIM_ALPHA);
        }
        for (const node of this.graph.nodes) {
            this._drawNode(node, AppPalette.node.state, EXPECTATION_DIM_ALPHA, fitScale);
        }

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

        this._drawTextLabels(fitScale);

        pop();
        drawingContext.restore();

        const utility = state._getUtility(rollout, currentT);
        noStroke();
        fill(AppPalette.accent.yellow);
        textSize(13);
        textAlign(LEFT, TOP);
        textFont(Typography.mono());
        text(`Run ${String(vm.focusedRunIndex + 1).padStart(2, '0')} · G = ${utility.toFixed(2)}`, 48, 10);
    }

    teardown() {
        this.stopPlay();
        this.exitFocusMode();
        this._removeScrubber();
        this._imageCache.clear();
    }

    _removeScrubber() {
        if (this._scrubber) {
            this._scrubber.destroy();
            this._scrubber = null;
        }
    }

    resize(canvasW, canvasH, topOffset) {
        this._topOffset = topOffset;
        if (this._scrubber) {
            const y = topOffset + canvasH - EXPECTATION_SCRUBBER_H;
            this._scrubber.resize(0, y, canvasW);
        }
        this.expectationViewModel.invalidateLayout();
    }
}
