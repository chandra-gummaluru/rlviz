// View for Value Iteration visualization — renders unrolled columns
class ValueIterationView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.ACTION_NODE_RADIUS = 18;
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

        // Draw detailed backup animation overlay if active
        const detail = this.viViewModel.backupDetail;
        if (detail) {
            this._drawBackupAnimation(detail);
        }
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

    // --- Edge drawing for completed columns ---

    _drawColumnEdges(fromCol, toCol, fromColIdx, activeColIdx, activeStateId) {
        const graph = this.viewModel.graph;
        if (!graph || !this.viState) return;

        // Only draw edges for columns that have been reached by animation
        if (fromColIdx > activeColIdx && activeColIdx >= 0) return;

        // Skip edges for the active column — those are drawn by _drawBackupAnimation
        if (fromColIdx === activeColIdx && this.viViewModel.backupDetail) return;

        for (const fromState of fromCol.states) {
            const stateNode = graph.getNodeById(fromState.id);
            if (!stateNode || !stateNode.actions) continue;

            const isRevealedState = this.viViewModel.isValueRevealed(fromColIdx, fromState.id);
            if (!isRevealedState) continue;

            const qValues = this.viState.getQValues(fromColIdx, fromState.id);
            const bestActionId = this.viState.getBestAction(fromColIdx, fromState.id);
            const edgeAlpha = this._getEdgeAlpha(fromColIdx, fromState.id, activeColIdx, activeStateId);

            this._drawSimpleEdges(fromState, toCol, stateNode, graph, qValues, bestActionId, edgeAlpha);
        }
    }

    /** Simple direct edges for completed columns */
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

    // --- Detailed Bellman backup animation ---

    _drawBackupAnimation(detail) {
        const bundledPhases = ['show_equation', 'show_actions', 'show_transitions', 'compute_q_values', 'select_max', 'revealing_value'];
        const phaseIdx = bundledPhases.indexOf(detail.subPhase);
        const perActionPhases = ['show_action', 'show_transition', 'compute_transition', 'show_q_result'];
        const isPerAction = perActionPhases.includes(detail.subPhase);

        if (phaseIdx < 0 && !isPerAction) return;

        // Always show equation when animating
        this._drawEquationOverlay(detail);

        if (isPerAction) {
            // Per-action mode: draw only current action and visible transitions
            const action = detail.actions[detail.currentActionIndex];
            if (!action) return;

            // Draw the action diamond + state→action edge
            this._drawSingleAction(detail, action);

            // Draw visible transitions
            const transCount = detail.visibleTransitionCount || 0;
            const showReward = (detail.subPhase === 'compute_transition' || detail.subPhase === 'show_q_result');
            this._drawPartialTransitions(detail, action, transCount, showReward);

            // Show Q-value after all transitions computed
            if (detail.subPhase === 'show_q_result') {
                this._drawSingleActionQValue(detail, action);
            }
        } else if (detail.subPhase === 'select_max' || detail.subPhase === 'revealing_value') {
            // Show all actions for comparison
            this._drawActionFanOut(detail);
            this._drawTransitionEdges(detail);
            this._drawQValues(detail);
            this._drawMaxSelection(detail);
        } else {
            // Bundled mode: cumulative phases
            if (phaseIdx >= 1) this._drawActionFanOut(detail);
            if (phaseIdx >= 2) this._drawTransitionEdges(detail);
            if (phaseIdx >= 3) this._drawQValues(detail);
            if (phaseIdx >= 4) this._drawMaxSelection(detail);
        }
    }

    /** Draw the Bellman equation overlay near the active state */
    _drawEquationOverlay(detail) {
        if (!detail.equationLines || detail.equationLines.length === 0) return;

        const boxX = detail.stateX - 160;
        const boxY = detail.stateY - detail.stateRadius - 30 - detail.equationLines.length * 18;
        const boxW = 320;
        const lineHeight = 18;
        const boxH = detail.equationLines.length * lineHeight + 16;

        push();
        // Semi-transparent background
        fill(255, 255, 255, 220);
        stroke(100, 100, 100, 150);
        strokeWeight(1);
        rect(boxX, boxY, boxW, boxH, 6);

        noStroke();
        textAlign(LEFT, TOP);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

        detail.equationLines.forEach((line, i) => {
            const y = boxY + 8 + i * lineHeight;
            if (line.type === 'header') {
                fill(30, 30, 30);
                textSize(13);
                textStyle(BOLD);
            } else if (line.type === 'best') {
                fill(46, 125, 50);
                textSize(11);
                textStyle(NORMAL);
            } else if (line.type === 'result') {
                fill(25, 80, 170);
                textSize(12);
                textStyle(BOLD);
            } else {
                fill(80, 80, 80);
                textSize(11);
                textStyle(NORMAL);
            }
            text(line.text, boxX + 8, y);
        });

        textStyle(NORMAL);
        pop();
    }

    /** Draw action diamond nodes fanning out from the active state */
    _drawActionFanOut(detail) {
        if (!detail.actions || detail.actions.length === 0) return;

        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;
        const isBeyondMax = detail.actions.length > 1;

        detail.actions.slice(0, count).forEach(action => {
            const isBest = action.actionId === detail.bestActionId;

            // Edge: state → action
            let actionColor;
            if (isBeyondMax && isBest) {
                actionColor = color(46, 160, 67, 200);
            } else if (isBeyondMax) {
                actionColor = color(210, 60, 50, 200);
            } else {
                actionColor = color(100, 149, 237, 200);
            }

            this._drawArrowLine(detail.stateX, detail.stateY, action.x, action.y, detail.stateRadius, this.ACTION_NODE_RADIUS, actionColor, 1.5);

            // Draw action diamond
            this._drawActionDiamond(action.x, action.y, action.actionName, isBest, isBeyondMax, 200);
        });
    }

    /** Draw transition edges from action diamonds to next-column state nodes */
    _drawTransitionEdges(detail) {
        if (!detail.actions) return;

        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;
        const isBeyondMax = detail.actions.length > 1;

        // Determine if we should show rewards (compute phase) or just probabilities (show phase)
        const showRewards = (detail.subPhase === 'compute_action' || detail.subPhase === 'compute_q_values' ||
                             detail.subPhase === 'select_max' || detail.subPhase === 'revealing_value');

        detail.actions.slice(0, count).forEach((action, actionIdx) => {
            const isBest = action.actionId === detail.bestActionId;

            let edgeColor;
            if (isBeyondMax && isBest) {
                edgeColor = color(46, 160, 67, 180);
            } else if (isBeyondMax) {
                edgeColor = color(210, 60, 50, 180);
            } else {
                edgeColor = color(100, 149, 237, 180);
            }

            // In per-action mode, only show rewards for actions that have been computed
            const isComputed = showRewards && (
                detail.subPhase !== 'compute_action' ||  // bundled phases show all
                actionIdx === count - 1                  // per-action: current action being computed
            );
            // Previously computed actions also show rewards
            const showRewardForAction = showRewards || (actionIdx < count - 1 && detail.subPhase === 'show_action');

            action.transitions.forEach(t => {
                this._drawArrowLine(action.x, action.y, t.toX, t.toY, this.ACTION_NODE_RADIUS, t.toRadius, edgeColor, 1.0);

                const labelX = (action.x + t.toX) / 2;
                const labelY = (action.y + t.toY) / 2 - 8;
                push();
                noStroke();
                textSize(9);
                textAlign(CENTER, CENTER);
                textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

                // Always show probability
                fill(60, 60, 60, 200);
                text(`p=${t.probability.toFixed(2)}`, labelX, labelY);

                // Show reward + term only during compute phases
                if (isComputed || showRewardForAction) {
                    const gamma = detail.gamma || 0.9;
                    fill(80, 80, 80, 200);
                    text(`r=${t.reward.toFixed(1)}`, labelX, labelY + 11);
                    // Show the term contribution
                    fill(100, 100, 100, 180);
                    textSize(8);
                    text(`${t.probability.toFixed(2)}\u00B7[${t.reward.toFixed(1)}+${gamma}\u00B7${t.nextValue.toFixed(1)}] = ${t.term.toFixed(2)}`, labelX, labelY + 22);
                }

                pop();
            });
        });
    }

    /** Draw Q-value labels below each action diamond */
    _drawQValues(detail) {
        if (!detail.actions) return;

        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;

        detail.actions.slice(0, count).forEach(action => {
            push();
            noStroke();
            const isBest = action.actionId === detail.bestActionId;
            fill(isBest ? color(46, 125, 50) : color(80, 80, 80));
            textAlign(CENTER, TOP);
            textSize(10);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
            textStyle(isBest ? BOLD : NORMAL);
            text(`Q = ${action.qValue.toFixed(2)}`, action.x, action.y + this.ACTION_NODE_RADIUS + 4);
            textStyle(NORMAL);
            pop();
        });
    }

    /** Highlight the best action and show V(s) result */
    _drawMaxSelection(detail) {
        if (!detail.actions || detail.actions.length === 0) return;

        // Redraw action diamonds with emphasis on best
        detail.actions.forEach(action => {
            const isBest = action.actionId === detail.bestActionId;
            if (isBest) {
                // Highlight ring around best action
                push();
                noFill();
                stroke(46, 160, 67, 255);
                strokeWeight(3);
                const r = this.ACTION_NODE_RADIUS + 4;
                // Diamond outline
                beginShape();
                vertex(action.x, action.y - r);
                vertex(action.x + r, action.y);
                vertex(action.x, action.y + r);
                vertex(action.x - r, action.y);
                endShape(CLOSE);
                pop();
            }
        });

        // Draw V(s) = value near the state node
        push();
        const vText = `V${detail.timestep}(${detail.stateName}) = ${detail.value.toFixed(2)}`;
        noStroke();
        // Background pill
        textSize(13);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        textStyle(BOLD);
        const tw = textWidth(vText) + 16;
        const th = 24;
        const vx = detail.stateX;
        const vy = detail.stateY + detail.stateRadius + 16;
        fill(25, 80, 170, 220);
        rect(vx - tw / 2, vy - th / 2, tw, th, 12);
        // Text
        fill(255);
        textAlign(CENTER, CENTER);
        text(vText, vx, vy);
        textStyle(NORMAL);
        pop();
    }

    // --- Per-action single-action drawing ---

    /** Draw a single action diamond with its state→action edge */
    _drawSingleAction(detail, action) {
        const isBest = action.actionId === detail.bestActionId;
        const hasMultiple = detail.actions.length > 1;

        let actionColor;
        if (hasMultiple && isBest) {
            actionColor = color(46, 160, 67, 200);
        } else if (hasMultiple) {
            actionColor = color(210, 60, 50, 200);
        } else {
            actionColor = color(100, 149, 237, 200);
        }

        this._drawArrowLine(detail.stateX, detail.stateY, action.x, action.y, detail.stateRadius, this.ACTION_NODE_RADIUS, actionColor, 1.5);
        this._drawActionDiamond(action.x, action.y, action.actionName, isBest, hasMultiple, 200);
    }

    /** Draw N transitions for a single action, with optional reward labels */
    _drawPartialTransitions(detail, action, transCount, showReward) {
        if (transCount <= 0) return;

        const isBest = action.actionId === detail.bestActionId;
        const hasMultiple = detail.actions.length > 1;

        let edgeColor;
        if (hasMultiple && isBest) {
            edgeColor = color(46, 160, 67, 180);
        } else if (hasMultiple) {
            edgeColor = color(210, 60, 50, 180);
        } else {
            edgeColor = color(100, 149, 237, 180);
        }

        const transitions = action.transitions.slice(0, transCount);
        transitions.forEach((t, ti) => {
            this._drawArrowLine(action.x, action.y, t.toX, t.toY, this.ACTION_NODE_RADIUS, t.toRadius, edgeColor, 1.0);

            const labelX = (action.x + t.toX) / 2;
            const labelY = (action.y + t.toY) / 2 - 8;
            push();
            noStroke();
            textSize(9);
            textAlign(CENTER, CENTER);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

            fill(60, 60, 60, 200);
            text(`p=${t.probability.toFixed(2)}`, labelX, labelY);

            // Show reward + term for transitions that have been computed
            // All transitions before the current one are computed; current one only if showReward
            const isComputed = showReward && (ti < transCount);
            if (isComputed) {
                const gamma = detail.gamma || 0.9;
                fill(80, 80, 80, 200);
                text(`r=${t.reward.toFixed(1)}`, labelX, labelY + 11);
                fill(100, 100, 100, 180);
                textSize(8);
                text(`${t.probability.toFixed(2)}\u00B7[${t.reward.toFixed(1)}+${gamma}\u00B7${t.nextValue.toFixed(1)}] = ${t.term.toFixed(2)}`, labelX, labelY + 22);
            }
            pop();
        });
    }

    /** Draw transition edges for a single action */
    _drawSingleActionTransitions(detail, action) {
        const isBest = action.actionId === detail.bestActionId;
        const hasMultiple = detail.actions.length > 1;

        let edgeColor;
        if (hasMultiple && isBest) {
            edgeColor = color(46, 160, 67, 180);
        } else if (hasMultiple) {
            edgeColor = color(210, 60, 50, 180);
        } else {
            edgeColor = color(100, 149, 237, 180);
        }

        const showRewards = (detail.subPhase === 'compute_action');

        action.transitions.forEach(t => {
            this._drawArrowLine(action.x, action.y, t.toX, t.toY, this.ACTION_NODE_RADIUS, t.toRadius, edgeColor, 1.0);

            const labelX = (action.x + t.toX) / 2;
            const labelY = (action.y + t.toY) / 2 - 8;
            push();
            noStroke();
            textSize(9);
            textAlign(CENTER, CENTER);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

            fill(60, 60, 60, 200);
            text(`p=${t.probability.toFixed(2)}`, labelX, labelY);

            if (showRewards) {
                const gamma = detail.gamma || 0.9;
                fill(80, 80, 80, 200);
                text(`r=${t.reward.toFixed(1)}`, labelX, labelY + 11);
                fill(100, 100, 100, 180);
                textSize(8);
                text(`${t.probability.toFixed(2)}\u00B7[${t.reward.toFixed(1)}+${gamma}\u00B7${t.nextValue.toFixed(1)}] = ${t.term.toFixed(2)}`, labelX, labelY + 22);
            }
            pop();
        });
    }

    /** Draw Q-value for a single action */
    _drawSingleActionQValue(detail, action) {
        push();
        noStroke();
        const isBest = action.actionId === detail.bestActionId;
        fill(isBest ? color(46, 125, 50) : color(80, 80, 80));
        textAlign(CENTER, TOP);
        textSize(10);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        textStyle(isBest ? BOLD : NORMAL);
        text(`Q = ${action.qValue.toFixed(2)}`, action.x, action.y + this.ACTION_NODE_RADIUS + 4);
        textStyle(NORMAL);
        pop();
    }

    /** Draw a small diamond shape for an action node */
    _drawActionDiamond(x, y, name, isBest, hasMultiple, alpha) {
        const r = this.ACTION_NODE_RADIUS;

        push();

        let fillCol;
        if (hasMultiple && isBest) {
            fillCol = color(46, 160, 67, alpha);
        } else if (hasMultiple) {
            fillCol = color(210, 60, 50, alpha);
        } else {
            fillCol = color(100, 149, 237, alpha);
        }

        fill(fillCol);
        stroke(60, 60, 60, alpha);
        strokeWeight(1.5);

        beginShape();
        vertex(x, y - r);
        vertex(x + r, y);
        vertex(x, y + r);
        vertex(x - r, y);
        endShape(CLOSE);

        fill(255, 255, 255, alpha);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        text(name, x, y);

        pop();
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
