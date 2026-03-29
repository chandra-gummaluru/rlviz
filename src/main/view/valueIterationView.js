// View for Value Iteration visualization — renders unrolled columns
class ValueIterationView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
    }

    get viState() {
        return this.viewModel.valueIterationState;
    }

    get viViewModel() {
        return this.viewModel.valueIterationViewModel;
    }

    draw() {
        if (!this.viState || !this.viViewModel || !this.viViewModel.columns.length) {
            this._drawPlaceholder();
            return;
        }

        const visibleCount = this.viViewModel.visibleColumnCount;
        if (visibleCount === 0) {
            this._drawPlaceholder();
            return;
        }

        const activeColIdx = this.viViewModel.activeColumnIndex;
        const activeStateId = this.viViewModel.activeStateId;

        // Draw edges between adjacent visible columns (behind nodes)
        for (let i = 0; i < visibleCount - 1; i++) {
            const fromCol = this.viViewModel.columns[i];
            const toCol = this.viViewModel.columns[i + 1];
            if (fromCol && toCol) {
                this._drawColumnEdges(fromCol, toCol, i, activeColIdx, activeStateId);
            }
        }

        // Draw visible columns only
        for (let i = 0; i < visibleCount; i++) {
            const col = this.viViewModel.columns[i];
            if (!col) continue;
            this._drawColumn(col, i, activeColIdx, activeStateId);
        }

        // Draw timestep labels at top (visible only)
        this._drawTimestepLabels(visibleCount);
    }

    _drawPlaceholder() {
        push();
        fill(120);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(18);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text('Set T and click Play to start Value Iteration',
            (windowWidth - 300) / 2, (windowHeight - 90) / 2);
        pop();
    }

    _drawTimestepLabels(visibleCount) {
        push();
        fill(80);
        noStroke();
        textAlign(CENTER, TOP);
        textSize(14);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        for (let i = 0; i < visibleCount; i++) {
            const col = this.viViewModel.columns[i];
            if (col) text(`t = ${col.timestep}`, col.x, 10);
        }
        pop();
    }

    _drawColumn(col, colIdx, activeColIdx, activeStateId) {
        for (const stateNode of col.states) {
            const alpha = this._getNodeAlpha(colIdx, stateNode.id, activeColIdx, activeStateId);
            this._drawStateNode(stateNode, colIdx, alpha);
        }
    }

    _getNodeAlpha(colIdx, stateId, activeColIdx, activeStateId) {
        // No active computation yet — all full opacity
        if (activeColIdx < 0) return 255;

        // Active node
        if (colIdx === activeColIdx && stateId === activeStateId) return 255;

        // Completed columns (before active)
        if (colIdx < activeColIdx) return 90;

        // Current column, different state
        if (colIdx === activeColIdx) return 50;

        // Future columns (already computed terminal etc.)
        if (colIdx === activeColIdx + 1) return 200;

        return 90;
    }

    _drawStateNode(stateNode, colIdx, alpha) {
        const r = stateNode.radius;

        push();

        // Node circle
        const isRevealed = this.viViewModel.isValueRevealed(colIdx, stateNode.id);
        const fillColor = isRevealed ? color(76, 175, 80, alpha) : color(200, 200, 200, alpha);
        fill(fillColor);
        stroke(60, 60, 60, alpha);
        strokeWeight(2);
        ellipse(stateNode.x, stateNode.y, r * 2, r * 2);

        // State name
        fill(0, 0, 0, alpha);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text(stateNode.name, stateNode.x, stateNode.y - 6);

        // Value label
        if (isRevealed) {
            fill(0, 0, 0, alpha);
            textSize(11);
            const valStr = `V = ${stateNode.value.toFixed(2)}`;
            text(valStr, stateNode.x, stateNode.y + 10);
        }

        pop();
    }

    _drawColumnEdges(fromCol, toCol, fromColIdx, activeColIdx, activeStateId) {
        const graph = this.viewModel.graph;
        if (!graph || !this.viState) return;

        // Only draw edges for columns that have been reached by animation
        if (fromColIdx > activeColIdx && activeColIdx >= 0) return;

        for (const fromState of fromCol.states) {
            const stateNode = graph.getNodeById(fromState.id);
            if (!stateNode || !stateNode.actions) continue;

            const isActiveState = (fromColIdx === activeColIdx && fromState.id === activeStateId);
            const isRevealedState = this.viViewModel.isValueRevealed(fromColIdx, fromState.id);

            // Only draw edges for revealed states (or the currently active one)
            if (!isRevealedState && !isActiveState) continue;

            // Get Q-values for color coding
            const qValues = this.viState.getQValues(fromColIdx, fromState.id);
            const bestActionId = this.viState.getBestAction(fromColIdx, fromState.id);

            stateNode.actions.forEach(actionId => {
                const actionNode = graph.getNodeById(actionId);
                if (!actionNode || !actionNode.sas) return;

                const qEntry = qValues.find(q => q.actionId === actionId);
                const isBest = actionId === bestActionId;

                actionNode.sas.forEach(({ nextState, probability, reward }) => {
                    const toStateNode = toCol.states.find(s => s.id === nextState);
                    if (!toStateNode) return;

                    const edgeAlpha = this._getEdgeAlpha(fromColIdx, fromState.id, activeColIdx, activeStateId);
                    this._drawEdge(fromState, toStateNode, probability, reward, isBest, qValues.length, edgeAlpha, qEntry);
                });
            });
        }
    }

    _getEdgeAlpha(fromColIdx, fromStateId, activeColIdx, activeStateId) {
        if (activeColIdx < 0) return 180;
        if (fromColIdx === activeColIdx && fromStateId === activeStateId) return 230;
        if (fromColIdx < activeColIdx) return 50;
        if (fromColIdx === activeColIdx) return 30;
        return 50;
    }

    _drawEdge(fromNode, toNode, probability, reward, isBest, totalActions, alpha, qEntry) {
        push();

        // Color based on best/worst action
        if (totalActions > 1 && isBest) {
            stroke(46, 160, 67, alpha);  // green for best
        } else if (totalActions > 1 && !isBest) {
            stroke(210, 60, 50, alpha);  // red for non-best
        } else {
            stroke(100, 100, 100, alpha); // gray for single action
        }
        strokeWeight(1.5);

        // Draw line
        line(fromNode.x + fromNode.radius, fromNode.y, toNode.x - toNode.radius, toNode.y);

        // Arrowhead
        const angle = atan2(toNode.y - fromNode.y, toNode.x - fromNode.x);
        const tipX = toNode.x - toNode.radius;
        const tipY = toNode.y;
        const arrowSize = 8;
        fill(isBest ? color(46, 160, 67, alpha) : color(100, 100, 100, alpha));
        noStroke();
        triangle(
            tipX, tipY,
            tipX - arrowSize * cos(angle - 0.4), tipY - arrowSize * sin(angle - 0.4),
            tipX - arrowSize * cos(angle + 0.4), tipY - arrowSize * sin(angle + 0.4)
        );

        // Edge label: probability
        if (alpha > 60) {
            const midX = (fromNode.x + fromNode.radius + toNode.x - toNode.radius) / 2;
            const midY = (fromNode.y + toNode.y) / 2 - 10;
            noStroke();
            fill(60, 60, 60, alpha);
            textSize(10);
            textAlign(CENTER, CENTER);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
            text(`p=${probability.toFixed(2)}`, midX, midY);

            if (reward !== 0) {
                fill(reward > 0 ? color(46, 125, 50, alpha) : color(198, 40, 40, alpha));
                text(`r=${reward.toFixed(1)}`, midX, midY + 12);
            }
        }

        pop();
    }
}
