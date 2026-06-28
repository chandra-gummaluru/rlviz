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

    _drawNode(node, color, alpha, fitScale) {
        const col = ColorUtils.applyAlpha(color, alpha);
        push();
        noStroke();
        fill(col);
        if (node.type === 'state') {
            circle(node.x, node.y, node.size * 2);
        } else {
            // Action node: small diamond
            const s = node.size * 0.85;
            beginShape();
            vertex(node.x, node.y - s);
            vertex(node.x + s, node.y);
            vertex(node.x, node.y + s);
            vertex(node.x - s, node.y);
            endShape(CLOSE);
        }
        // Abbreviated name
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

    teardown() {
        this.stopPlay();
        cancelAnimationFrame(this._rafHandle);
        this._rafHandle = null;
        this._removeScrubber();
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
