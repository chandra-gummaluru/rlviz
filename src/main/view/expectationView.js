const EXPECTATION_SCRUBBER_H = 36;
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
        this._scrubberDiv = null;
        this._scrubberSlider = null;
        this._scrubberReadout = null;
        this._rafHandle = null;
        this._playTimer = null;
        this._rightPanel = null;
        this.onPlaybackStateChange = null;
        this._topOffset = 90;
        this._imageCache = new Map();
        this._backBtn = null;
    }

    setRightPanel(rightPanel) {
        this._rightPanel = rightPanel;
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
        for (let i = 0; i < displaySlice.length; i++) {
            const panel = panels[i];
            if (!panel) continue;
            const rollout = displaySlice[i];
            const runColor = runColors[i % runColors.length];

            drawingContext.save();
            drawingContext.beginPath();
            drawingContext.rect(panel.x, panel.y, panel.w, panel.h);
            drawingContext.clip();

            // Draw panel background
            fill(AppPalette.surface.white);
            noStroke();
            rect(panel.x, panel.y, panel.w, panel.h);

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

            // Highlight visited nodes and edges
            const effectiveT = Math.min(currentT, rollout.numSteps);
            const visitedSlice = rollout.trace.slice(0, 2 * effectiveT + 1);
            const visitedIds = new Set(visitedSlice.map(e => e.id));

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

            // Panel label (screen space, after restore)
            const utility = state._getUtility(rollout, currentT);
            noStroke();
            fill(AppPalette.text.primary);
            textSize(10);
            textAlign(LEFT, TOP);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
            text(`Run ${i + 1}  G=${utility.toFixed(1)}`, panel.x + 4, panel.y + 3);

            // Panel border
            noFill();
            stroke(AppPalette.border.medium);
            strokeWeight(0.5);
            rect(panel.x, panel.y, panel.w, panel.h);
        }
    }

    _ensureImagesLoaded() {
        for (const node of this.graph.nodes) {
            if (!node.image) continue;
            const key = `${node.id}:${node.image}`;
            if (this._imageCache.has(key)) continue;
            const img = new Image();
            img.onload = () => {
                if (this.viewModel.interaction.mode === 'expectation') {
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
        const label = node.name && node.name.length > 4 ? node.name.slice(0, 3) + '…' : (node.name || '');
        const screenFontSize = Math.max(6, node.size * 0.55);
        const worldFontSize = screenFontSize / (fitScale || 1);
        fill(255);
        textSize(worldFontSize);
        textAlign(CENTER, CENTER);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text(label, node.x, node.y);
        pop();
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
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
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
            if (this._rightPanel) this._rightPanel.updateExpectationData();
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
        const state = this.expectationState;
        if (!this._scrubberSlider) return;
        this._scrubberSlider.value = String(state.currentT);
        if (this._scrubberReadout) {
            this._scrubberReadout.textContent = `${state.currentT} / ${state.maxT}`;
        }
    }

    setupScrubber(canvasW, canvasH, topOffset) {
        this._removeScrubber();
        this._topOffset = topOffset;

        const div = document.createElement('div');
        div.className = 'expectation-scrubber';
        div.style.left = '0px';
        div.style.top = (topOffset + canvasH - EXPECTATION_SCRUBBER_H) + 'px';
        div.style.width = canvasW + 'px';

        const label = document.createElement('span');
        label.className = 'timeline-label';
        label.textContent = 'T =';
        div.appendChild(label);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(this.expectationState.maxT);
        slider.step = '1';
        slider.value = '0';
        div.appendChild(slider);

        const readout = document.createElement('span');
        readout.className = 't-readout';
        readout.textContent = `0 / ${this.expectationState.maxT}`;
        div.appendChild(readout);

        slider.addEventListener('input', () => {
            this.stopPlay();
            const val = parseInt(slider.value, 10);
            readout.textContent = `${val} / ${this.expectationState.maxT}`;
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = requestAnimationFrame(() => {
                this.expectationState.currentT = val;
                if (typeof redraw === 'function') redraw();
                if (this._rightPanel) this._rightPanel.updateExpectationData();
            });
        });

        document.body.appendChild(div);
        this._scrubberDiv = div;
        this._scrubberSlider = slider;
        this._scrubberReadout = readout;
    }

    updateScrubberMax() {
        if (!this._scrubberSlider) return;
        const maxT = this.expectationState.maxT;
        this._scrubberSlider.max = String(maxT);
        if (this._scrubberReadout) {
            this._scrubberReadout.textContent = `0 / ${maxT}`;
        }
        this._scrubberSlider.value = '0';
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

    enterFocusMode(index) {
        const state = this.expectationState;
        const vm = this.expectationViewModel;
        if (index < 0 || index >= state.getDisplaySlice().length) return;
        vm.focusedRunIndex = index;
        this._createBackButton();
        if (typeof redraw === 'function') redraw();
    }

    exitFocusMode() {
        const vm = this.expectationViewModel;
        if (vm.focusedRunIndex === null) return;
        vm.focusedRunIndex = null;
        this._removeBackButton();
        vm.invalidateLayout();
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

        fill(AppPalette.surface.white);
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
        pop();
        drawingContext.restore();

        const utility = state._getUtility(rollout, currentT);
        noStroke();
        fill(AppPalette.text.primary);
        textSize(13);
        textAlign(LEFT, TOP);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text(`Run ${vm.focusedRunIndex + 1}  G = ${utility.toFixed(2)}`, 48, 10);
    }

    teardown() {
        this.stopPlay();
        this.exitFocusMode();
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = null;
        this._removeScrubber();
        this._imageCache.clear();
    }

    _removeScrubber() {
        if (this._scrubberDiv) {
            this._scrubberDiv.remove();
            this._scrubberDiv = null;
            this._scrubberSlider = null;
            this._scrubberReadout = null;
        }
    }

    resize(canvasW, canvasH, topOffset) {
        this._topOffset = topOffset;
        if (this._scrubberDiv) {
            this._scrubberDiv.style.top = (topOffset + canvasH - EXPECTATION_SCRUBBER_H) + 'px';
            this._scrubberDiv.style.width = canvasW + 'px';
        }
        this.expectationViewModel.invalidateLayout();
    }
}
