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
        // Active column's edges are skipped inside _drawColumnEdges — drawn by backup animation instead
        const detail = this.viViewModel.backupDetail;
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

        // Show equation overlay in bundled mode; per-action uses the Q-table instead
        if (!isPerAction && detail.subPhase !== 'select_max' && detail.subPhase !== 'revealing_value') {
            this._drawEquationOverlay(detail);
        }

        if (isPerAction) {
            // Per-action mode: draw only current action and visible transitions
            const action = detail.actions[detail.currentActionIndex];
            if (!action) return;

            this._drawSingleAction(detail, action);

            const transCount = detail.visibleTransitionCount || 0;
            const showReward = (detail.subPhase === 'compute_transition' || detail.subPhase === 'show_q_result');
            this._drawPartialTransitions(detail, action, transCount, showReward);

            if (detail.subPhase === 'show_q_result') {
                this._drawSingleActionQValue(detail, action);
            }

            // Draw the progressive Q-value table
            this._drawQTable(detail);
        } else if (detail.subPhase === 'select_max' || detail.subPhase === 'revealing_value') {
            this._drawActionFanOut(detail);
            this._drawQValues(detail);
            this._drawMaxSelection(detail);
            this._drawQTable(detail);
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

    // --- Q-value table (per-action mode) ---

    /**
     * Draw a table showing the Bellman backup computation.
     * Rows = actions, Columns = transitions (s', (p,r)), final column = Q(s,a).
     * Populates progressively based on currentActionIndex and visibleTransitionCount.
     */
    _drawQTable(detail) {
        if (!detail.actions || detail.actions.length === 0) return;

        const gamma = detail.gamma || 0.9;
        const allActions = detail.actions;
        const currentAI = detail.currentActionIndex || 0;
        const visTransCount = detail.visibleTransitionCount || 0;
        const isSelectMax = (detail.subPhase === 'select_max' || detail.subPhase === 'revealing_value');

        // Find max transitions across all actions (for column count)
        const maxTrans = Math.max(...allActions.map(a => a.transitions.length), 1);

        // Table layout
        const font = 'Calibri, "Segoe UI", Tahoma, sans-serif';
        const rowH = 28;
        const headerH = 30;
        const actionColW = 50;
        const transColW = 150;
        const qColW = 70;
        const tableW = actionColW + maxTrans * transColW + qColW;
        const tableH = headerH + allActions.length * rowH + (isSelectMax ? rowH : 0);

        // Position table below the state node
        const tableX = detail.stateX - tableW / 2;
        const tableY = detail.stateY + detail.stateRadius + 40;

        push();
        textFont(font);

        // Background
        fill(255, 255, 255, 240);
        stroke(200, 200, 200);
        strokeWeight(1);
        rect(tableX, tableY, tableW, tableH, 4);

        // Header row
        fill(245, 245, 245);
        noStroke();
        rect(tableX, tableY, tableW, headerH, 4);
        // Bottom corners not rounded — clip with another rect
        rect(tableX, tableY + 4, tableW, headerH - 4);

        // Header separator
        stroke(220, 220, 220);
        strokeWeight(1);
        line(tableX, tableY + headerH, tableX + tableW, tableY + headerH);

        // Header text
        noStroke();
        fill(100, 100, 100);
        textSize(10);
        textAlign(CENTER, CENTER);

        // Action column header (empty)
        // Transition column headers
        for (let ti = 0; ti < maxTrans; ti++) {
            const cx = tableX + actionColW + ti * transColW + transColW / 2;
            text(`s'${ti + 1}, (p, r)`, cx, tableY + headerH / 2);
        }
        // Q column header
        fill(60, 60, 60);
        textStyle(BOLD);
        text('Q(s, a)', tableX + actionColW + maxTrans * transColW + qColW / 2, tableY + headerH / 2);
        textStyle(NORMAL);

        // Vertical separator lines
        stroke(230, 230, 230);
        strokeWeight(0.5);
        line(tableX + actionColW, tableY, tableX + actionColW, tableY + tableH);
        for (let ti = 1; ti < maxTrans; ti++) {
            const lx = tableX + actionColW + ti * transColW;
            line(lx, tableY, lx, tableY + tableH);
        }
        const qSepX = tableX + actionColW + maxTrans * transColW;
        line(qSepX, tableY, qSepX, tableY + tableH);

        // Data rows
        for (let ai = 0; ai < allActions.length; ai++) {
            const action = allActions[ai];
            const rowY = tableY + headerH + ai * rowH;

            // Row separator
            if (ai > 0) {
                stroke(235, 235, 235);
                strokeWeight(0.5);
                line(tableX, rowY, tableX + tableW, rowY);
            }

            // Determine what to show for this row
            let rowCompleted = false; // has this action's Q-value been finalized?
            let rowVisible = false;   // should this row show anything?
            let showTransUpTo = 0;    // how many transitions to show
            let showTerms = false;    // show the term calculations?

            if (isSelectMax) {
                rowCompleted = true;
                rowVisible = true;
                showTransUpTo = action.transitions.length;
                showTerms = true;
            } else if (ai < currentAI) {
                // Previously completed action
                rowCompleted = true;
                rowVisible = true;
                showTransUpTo = action.transitions.length;
                showTerms = true;
            } else if (ai === currentAI) {
                // Current action being computed
                rowVisible = true;
                showTransUpTo = visTransCount;
                showTerms = (detail.subPhase === 'compute_transition' || detail.subPhase === 'show_q_result');
                rowCompleted = (detail.subPhase === 'show_q_result');
            }
            // ai > currentAI: row not visible yet

            // Action name
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(11);
            if (rowVisible) {
                fill(60, 60, 60);
                textStyle(BOLD);
            } else {
                fill(180, 180, 180);
                textStyle(NORMAL);
            }
            text(action.actionName, tableX + actionColW / 2, rowY + rowH / 2);
            textStyle(NORMAL);

            // Transition cells
            for (let ti = 0; ti < action.transitions.length; ti++) {
                const t = action.transitions[ti];
                const cx = tableX + actionColW + ti * transColW + transColW / 2;
                const cy = rowY + rowH / 2;

                if (!rowVisible || ti >= showTransUpTo) {
                    // Not yet visible
                    fill(200, 200, 200);
                    textSize(10);
                    text('...', cx, cy);
                } else if (showTerms) {
                    // Show full term: p·[r + γ·V] = term
                    fill(70, 70, 70);
                    textSize(9);
                    text(`${t.probability.toFixed(2)}\u00B7[${t.reward.toFixed(0)}+${gamma}\u00B7${t.nextValue.toFixed(0)}]=${t.term.toFixed(2)}`, cx, cy);
                } else {
                    // Show just p label (transition shown but not computed yet)
                    fill(130, 130, 130);
                    textSize(10);
                    text(`p=${t.probability.toFixed(2)}`, cx, cy);
                }
            }

            // Empty cells for actions with fewer transitions
            for (let ti = action.transitions.length; ti < maxTrans; ti++) {
                const cx = tableX + actionColW + ti * transColW + transColW / 2;
                fill(200, 200, 200);
                textSize(10);
                text('—', cx, rowY + rowH / 2);
            }

            // Q(s, a) column
            const qx = tableX + actionColW + maxTrans * transColW + qColW / 2;
            if (rowCompleted) {
                const isBest = action.actionId === detail.bestActionId;
                fill(isBest ? color(46, 125, 50) : color(60, 60, 60));
                textStyle(BOLD);
                textSize(11);
                text(action.qValue.toFixed(2), qx, rowY + rowH / 2);
                textStyle(NORMAL);
            } else if (rowVisible && showTerms) {
                // Show running sum
                let runningSum = 0;
                for (let ti = 0; ti < showTransUpTo; ti++) {
                    runningSum += action.transitions[ti].term;
                }
                fill(130, 130, 130);
                textSize(10);
                textStyle(ITALIC);
                text(runningSum.toFixed(2), qx, rowY + rowH / 2);
                textStyle(NORMAL);
            } else {
                fill(200, 200, 200);
                textSize(10);
                text('—', qx, rowY + rowH / 2);
            }
        }

        // V(s) = max row
        if (isSelectMax) {
            const vRowY = tableY + headerH + allActions.length * rowH;
            stroke(200, 200, 200);
            strokeWeight(1);
            line(tableX, vRowY, tableX + tableW, vRowY);

            noStroke();
            fill(25, 80, 170);
            textStyle(BOLD);
            textSize(12);
            textAlign(RIGHT, CENTER);
            text(`V(${detail.stateName}) = max = ${detail.value.toFixed(2)}`,
                tableX + tableW - 10, vRowY + rowH / 2);
            textStyle(NORMAL);
        }

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
