// View for Value Iteration visualization — renders unrolled columns
class ValueIterationView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.ACTION_NODE_RADIUS = 18;
        this.DETAIL_COLUMNS = 2; // Show action nodes for first N backup steps
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
        if (activeColIdx < 0) return 255;
        if (colIdx === activeColIdx && stateId === activeStateId) return 255;
        if (colIdx < activeColIdx) return 90;
        if (colIdx === activeColIdx) return 50;
        if (colIdx === activeColIdx + 1) return 200;
        return 90;
    }

    _drawStateNode(stateNode, colIdx, alpha) {
        const r = stateNode.radius;

        push();

        const isRevealed = this.viViewModel.isValueRevealed(colIdx, stateNode.id);
        const fillColor = isRevealed ? color(76, 175, 80, alpha) : color(200, 200, 200, alpha);
        fill(fillColor);
        stroke(60, 60, 60, alpha);
        strokeWeight(2);
        ellipse(stateNode.x, stateNode.y, r * 2, r * 2);

        fill(0, 0, 0, alpha);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text(stateNode.name, stateNode.x, stateNode.y - 6);

        if (isRevealed) {
            fill(0, 0, 0, alpha);
            textSize(11);
            text(`V = ${stateNode.value.toFixed(2)}`, stateNode.x, stateNode.y + 10);
        }

        pop();
    }

    // --- Edge drawing ---

    _drawColumnEdges(fromCol, toCol, fromColIdx, activeColIdx, activeStateId) {
        const graph = this.viewModel.graph;
        if (!graph || !this.viState) return;

        // Only draw edges for columns that have been reached by animation
        if (fromColIdx > activeColIdx && activeColIdx >= 0) return;

        // Show detailed action nodes for the first N backup columns (not terminal)
        const showDetailedActions = (fromColIdx >= 1 && fromColIdx <= this.DETAIL_COLUMNS);

        for (const fromState of fromCol.states) {
            const stateNode = graph.getNodeById(fromState.id);
            if (!stateNode || !stateNode.actions) continue;

            const isActiveState = (fromColIdx === activeColIdx && fromState.id === activeStateId);
            const isRevealedState = this.viViewModel.isValueRevealed(fromColIdx, fromState.id);

            if (!isRevealedState && !isActiveState) continue;

            const qValues = this.viState.getQValues(fromColIdx, fromState.id);
            const bestActionId = this.viState.getBestAction(fromColIdx, fromState.id);
            const edgeAlpha = this._getEdgeAlpha(fromColIdx, fromState.id, activeColIdx, activeStateId);

            if (showDetailedActions && stateNode.actions.length > 0) {
                this._drawDetailedActions(fromState, toCol, stateNode, graph, qValues, bestActionId, edgeAlpha);
            } else {
                this._drawSimpleEdges(fromState, toCol, stateNode, graph, qValues, bestActionId, edgeAlpha);
            }
        }
    }

    /**
     * Draw with intermediate action nodes between columns.
     * State ──► Action (diamond) ──► next States
     */
    _drawDetailedActions(fromState, toCol, stateNode, graph, qValues, bestActionId, alpha) {
        const actionCount = stateNode.actions.length;
        const midX = (fromState.x + toCol.x) / 2;

        stateNode.actions.forEach((actionId, actionIdx) => {
            const actionNode = graph.getNodeById(actionId);
            if (!actionNode || !actionNode.sas) return;

            const qEntry = qValues.find(q => q.actionId === actionId);
            const isBest = actionId === bestActionId;

            // Position action node vertically spread around the from-state
            const spreadRange = Math.max(60, actionCount * 40);
            const actionY = fromState.y + (actionIdx - (actionCount - 1) / 2) * (spreadRange / Math.max(actionCount - 1, 1));

            // Action node color
            const actionAlpha = alpha;
            let actionColor;
            if (actionCount > 1 && isBest) {
                actionColor = color(46, 160, 67, actionAlpha); // green
            } else if (actionCount > 1) {
                actionColor = color(210, 60, 50, actionAlpha); // red
            } else {
                actionColor = color(100, 149, 237, actionAlpha); // blue
            }

            // Draw edge: state → action
            this._drawArrowLine(fromState.x, fromState.y, midX, actionY, fromState.radius, this.ACTION_NODE_RADIUS, actionColor, 1.5);

            // Draw action diamond
            this._drawActionNode(midX, actionY, actionNode.name, qEntry, isBest, actionCount, actionAlpha);

            // Draw edges: action → next states
            actionNode.sas.forEach(({ nextState, probability, reward }) => {
                const toStateNode = toCol.states.find(s => s.id === nextState);
                if (!toStateNode) return;

                this._drawArrowLine(midX, actionY, toStateNode.x, toStateNode.y, this.ACTION_NODE_RADIUS, toStateNode.radius, actionColor, 1.0);

                // Label on action→state edge
                if (actionAlpha > 60) {
                    const labelX = (midX + toStateNode.x) / 2;
                    const labelY = (actionY + toStateNode.y) / 2 - 8;
                    push();
                    noStroke();
                    fill(60, 60, 60, actionAlpha);
                    textSize(9);
                    textAlign(CENTER, CENTER);
                    textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
                    text(`p=${probability.toFixed(2)}  r=${reward.toFixed(1)}`, labelX, labelY);
                    pop();
                }
            });
        });
    }

    /** Draw a small diamond for an action node with Q-value label */
    _drawActionNode(x, y, name, qEntry, isBest, totalActions, alpha) {
        const r = this.ACTION_NODE_RADIUS;

        push();

        // Diamond color based on best/worst
        let fillCol;
        if (totalActions > 1 && isBest) {
            fillCol = color(46, 160, 67, alpha);
        } else if (totalActions > 1) {
            fillCol = color(210, 60, 50, alpha);
        } else {
            fillCol = color(100, 149, 237, alpha);
        }

        fill(fillCol);
        stroke(60, 60, 60, alpha);
        strokeWeight(1.5);

        // Draw diamond shape
        beginShape();
        vertex(x, y - r);
        vertex(x + r, y);
        vertex(x, y + r);
        vertex(x - r, y);
        endShape(CLOSE);

        // Action name inside
        fill(255, 255, 255, alpha);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text(name, x, y);

        // Q-value below
        if (qEntry) {
            fill(40, 40, 40, alpha);
            textSize(9);
            const qStr = `Q = ${qEntry.qValue.toFixed(2)}`;
            text(qStr, x, y + r + 10);
        }

        pop();
    }

    /** Simple direct edges (for columns beyond the detail threshold) */
    _drawSimpleEdges(fromState, toCol, stateNode, graph, qValues, bestActionId, alpha) {
        stateNode.actions.forEach(actionId => {
            const actionNode = graph.getNodeById(actionId);
            if (!actionNode || !actionNode.sas) return;

            const isBest = actionId === bestActionId;
            let edgeColor;
            if (qValues.length > 1 && isBest) {
                edgeColor = color(46, 160, 67, alpha);
            } else if (qValues.length > 1) {
                edgeColor = color(210, 60, 50, alpha);
            } else {
                edgeColor = color(100, 100, 100, alpha);
            }

            actionNode.sas.forEach(({ nextState, probability, reward }) => {
                const toStateNode = toCol.states.find(s => s.id === nextState);
                if (!toStateNode) return;

                this._drawArrowLine(fromState.x, fromState.y, toStateNode.x, toStateNode.y, fromState.radius, toStateNode.radius, edgeColor, 1.5);

                if (alpha > 60) {
                    const dx = toStateNode.x - fromState.x;
                    const dy = toStateNode.y - fromState.y;
                    const ang = atan2(dy, dx);
                    const sx = fromState.x + fromState.radius * cos(ang);
                    const sy = fromState.y + fromState.radius * sin(ang);
                    const ex = toStateNode.x - toStateNode.radius * cos(ang);
                    const ey = toStateNode.y - toStateNode.radius * sin(ang);
                    const midX = (sx + ex) / 2;
                    const midY = (sy + ey) / 2 - 10;
                    push();
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
                    pop();
                }
            });
        });
    }

    /** Draw a line with arrowhead between two points, accounting for node radii */
    _drawArrowLine(x1, y1, x2, y2, r1, r2, edgeColor, weight) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = atan2(dy, dx);

        const startX = x1 + r1 * cos(angle);
        const startY = y1 + r1 * sin(angle);
        const endX = x2 - r2 * cos(angle);
        const endY = y2 - r2 * sin(angle);

        push();
        stroke(edgeColor);
        strokeWeight(weight);
        line(startX, startY, endX, endY);

        // Arrowhead
        const arrowSize = 7;
        fill(edgeColor);
        noStroke();
        triangle(
            endX, endY,
            endX - arrowSize * cos(angle - 0.4), endY - arrowSize * sin(angle - 0.4),
            endX - arrowSize * cos(angle + 0.4), endY - arrowSize * sin(angle + 0.4)
        );
        pop();
    }

    _getEdgeAlpha(fromColIdx, fromStateId, activeColIdx, activeStateId) {
        if (activeColIdx < 0) return 180;
        if (fromColIdx === activeColIdx && fromStateId === activeStateId) return 230;
        if (fromColIdx < activeColIdx) return 50;
        if (fromColIdx === activeColIdx) return 30;
        return 50;
    }
}
