// --- File-local rendering constants ---
const VI_ACTION_NODE_RADIUS  = 18;

const VI_ALPHA_COMPLETED     = 90;   // completed columns and inactive same-column nodes
const VI_ALPHA_ACTIVE_SAME   = 50;   // non-active nodes within the active column
const VI_ALPHA_NEXT_COL      = 200;  // nodes in the column immediately after the active one

const VI_DUR_EQUATION        = 500;
const VI_DUR_SA_LINE         = 200;
const VI_DUR_SA_HEAD         = 80;
const VI_DUR_SA_STAGGER      = 60;
const VI_DUR_SA_HEAD_DELAY   = 170;  // delay before sa_head starts (= VI_DUR_SA_LINE - VI_DUR_SA_HEAD)
const VI_DUR_AS_LINE         = 220;
const VI_DUR_AS_HEAD         = 80;
const VI_DUR_AS_STAGGER      = 60;
const VI_DUR_AS_HEAD_DELAY   = 190;  // delay before as_head (= VI_DUR_AS_LINE - VI_DUR_AS_HEAD)
const VI_DUR_AS_LABEL        = 180;
const VI_DUR_AS_LABEL_DELAY  = 220;
const VI_DUR_Q_COUNTUP       = 400;
const VI_DUR_Q_BADGE         = 250;
const VI_DUR_SCAN_MAX        = 500;
const VI_DUR_SCAN_PER_ACTION = 80;
const VI_DUR_SELECT_BURST    = 300;
const VI_DUR_BADGE_EXPAND    = 200;
const VI_DUR_VALUE_COUNTUP   = 400;
const VI_DUR_NODE_PULSE      = 150;
const VI_DUR_COL_SCALE       = 300;
const VI_DUR_COL_STAGGER     = 40;
// --- End constants ---

class VITweenEngine {
    constructor() { this._tweens = {}; }

    start(id, durationMs, easing = 'easeInOut', delayMs = 0, onComplete = null) {
        const now = Date.now();
        this._tweens[id] = {
            startMs: now + Math.max(0, delayMs),
            durationMs: Math.max(0, durationMs),
            easing,
            onComplete,
            completed: false
        };
    }

    progress(id) {
        const tween = this._tweens[id];
        if (!tween) return 1;
        if (tween.durationMs === 0) { this._complete(id, tween); return 1; }
        const now = Date.now();
        if (now < tween.startMs) return 0;
        const raw = Math.min((now - tween.startMs) / tween.durationMs, 1);
        const fn = EasingUtils[tween.easing] || EasingUtils.linear;
        const eased = fn(raw);
        if (raw >= 1) this._complete(id, tween);
        return eased;
    }

    _complete(id, tween) {
        if (!tween || tween.completed) return;
        tween.completed = true;
        if (tween.onComplete) tween.onComplete();
        delete this._tweens[id];
    }

    hasActive() {
        Object.keys(this._tweens).forEach(id => this.progress(id));
        return Object.keys(this._tweens).length > 0;
    }

    clear() { this._tweens = {}; }
}

// View for Value Iteration visualization — renders unrolled columns
class ValueIterationView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.ACTION_NODE_RADIUS = VI_ACTION_NODE_RADIUS;
        this.tween = new VITweenEngine();
        this._lastPhaseKey = null;
        this._lastVisibleColumnCount = 0;
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

        const detail = this.viViewModel.backupDetail;

        // Phase change detection — starts tweens for new phases
        const phaseKey = this._getPhaseKey(detail);
        if (phaseKey !== this._lastPhaseKey) {
            this._onPhaseChange(detail);
            this._lastPhaseKey = phaseKey;
        }
        this._detectNewColumnTweens();

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

        // Draw visible columns
        for (let i = 0; i < visibleCount; i++) {
            const col = this.viViewModel.columns[i];
            if (!col) continue;
            this._drawColumn(col, i, activeColIdx, activeStateId);
        }

        // Draw timestep labels at top
        this._drawTimestepLabels(visibleCount);

        // Draw detailed backup animation overlay if active
        if (detail) {
            this._drawBackupAnimation(detail);
        }

        // Loop management — continuous during active tweens, noLoop when idle
        if (this.tween.hasActive()) {
            if (typeof loop === 'function') loop();
        } else if (typeof noLoop === 'function') {
            noLoop();
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
        for (let i = 0; i < visibleCount; i++) {
            const col = this.viViewModel.columns[i];
            if (col) {
                mathRenderer.draw(drawingContext, `t = ${col.timestep}`, col.x, 10,
                    { color: AppPalette.text.medium, em: 14, alignX: 'center', alignY: 'top' });
            }
        }
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
        if (colIdx < activeColIdx) return VI_ALPHA_COMPLETED;
        if (colIdx === activeColIdx) return VI_ALPHA_ACTIVE_SAME;
        if (colIdx === activeColIdx + 1) return VI_ALPHA_NEXT_COL;
        return VI_ALPHA_COMPLETED;
    }

    _drawStateNode(stateNode, colIdx, alpha) {
        const r = stateNode.radius;

        push();

        // Column scale-in animation
        const scaleId = `column:${colIdx}:state:${stateNode.id}:scale`;
        const s = this.tween.progress(scaleId);
        if (s < 1) {
            translate(stateNode.x, stateNode.y);
            scale(s, s);
            translate(-stateNode.x, -stateNode.y);
        }

        const isRevealed = this.viViewModel.isValueRevealed(colIdx, stateNode.id);
        const fillColor = isRevealed ? color(76, 175, 80, alpha) : color(200, 200, 200, alpha);
        fill(fillColor);
        stroke(60, 60, 60, alpha);
        strokeWeight(2);
        ellipse(stateNode.x, stateNode.y, r * 2, r * 2);

        if (s > 0.2) {
            // State name — plain text, not math
            fill(0, 0, 0, alpha);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(14);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
            text(stateNode.name, stateNode.x, stateNode.y - 6);

            if (isRevealed) {
                mathRenderer.draw(drawingContext, `V = ${stateNode.value.toFixed(2)}`,
                    stateNode.x, stateNode.y + 10,
                    { color: AppPalette.text.black, em: 11, alpha, alignX: 'center', alignY: 'middle' });
            }
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
            const edgeColor = this._getActionColor(actionId, qValues, alpha, [100, 100, 100]);

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
                    mathRenderer.draw(drawingContext, `p = ${probability.toFixed(2)}`,
                        midX, midY, { color: AppPalette.border.canvasDark, em: 10, alpha, alignX: 'center', alignY: 'middle' });
                    if (reward !== 0) {
                        const rColor = reward > 0 ? AppPalette.reward.positive : AppPalette.reward.negative;
                        mathRenderer.draw(drawingContext, `r = ${reward.toFixed(1)}`,
                            midX, midY + 12, { color: rColor, em: 10, alpha, alignX: 'center', alignY: 'middle' });
                    }
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
            if (detail.subPhase === 'revealing_value') {
                this._drawRevealingValueOverlay(detail);
            }
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

        const p = this._progress(detail, 'equation');
        const lines = detail.equationLines;
        const boxX = detail.stateX - 160;
        const boxY = detail.stateY - detail.stateRadius - 30 - lines.length * 18;
        const boxW = 320;
        const lineHeight = 18;
        const boxH = lines.length * lineHeight + 16;

        push();
        fill(255, 255, 255, 220 * p);
        stroke(100, 100, 100, 150 * p);
        strokeWeight(1);
        rect(boxX, boxY, boxW, boxH, 6);
        pop();

        // Render LaTeX lines — drawImage must honour the current transform,
        // which for the equation overlay is world-space (correct: it moves with the graph).
        lines.forEach((line, i) => {
            const lineStart  = i / Math.max(lines.length, 1);
            const lineWindow = 1 / Math.max(lines.length, 1);
            const lineP = Math.min(Math.max((p - lineStart) / lineWindow, 0), 1);
            const a = Math.round(255 * lineP);
            if (a < 2) return;

            const yOffset = 4 * (1 - lineP);
            const ly = boxY + 8 + i * lineHeight + yOffset + lineHeight / 2;

            let color, em;
            if (line.type === 'header') { color = AppPalette.text.nearBlack; em = 13; }
            else if (line.type === 'best')   { color = AppPalette.reward.positive; em = 11; }
            else if (line.type === 'result') { color = AppPalette.valueIteration.result; em = 12; }
            else                             { color = AppPalette.text.medium; em = 11; }

            mathRenderer.draw(drawingContext, line.text, boxX + 8, ly,
                { color, em, alpha: a, alignX: 'left', alignY: 'middle' });
        });
    }

    /** Draw action diamond nodes fanning out from the active state */
    _drawActionFanOut(detail) {
        if (!detail.actions || detail.actions.length === 0) return;

        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;

        detail.actions.slice(0, count).forEach((action, i) => {
            const actionColor = this._getActionColor(action.actionId, detail.actions, 200);
            const lineP = this._progress(detail, 'sa_line', i);
            const headP = this._progress(detail, 'sa_head', i);

            this._drawAnimatedArrow(
                detail.stateX, detail.stateY, action.x, action.y,
                detail.stateRadius, this.ACTION_NODE_RADIUS,
                actionColor, 1.5, lineP, headP
            );

            if (lineP > 0) {
                this._drawActionDiamond(action.x, action.y, action.actionName, actionColor, Math.round(200 * Math.min(lineP * 3, 1)));
            }
        });
    }

    /** Draw transition edges from action diamonds to next-column state nodes */
    _drawTransitionEdges(detail) {
        if (!detail.actions) return;

        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;
        const showRewards = (detail.subPhase === 'compute_action' || detail.subPhase === 'compute_q_values' ||
                             detail.subPhase === 'select_max' || detail.subPhase === 'revealing_value');

        detail.actions.slice(0, count).forEach((action, actionIdx) => {
            const edgeColor = this._getActionColor(action.actionId, detail.actions, 180);
            const isComputed = showRewards && (
                detail.subPhase !== 'compute_action' || actionIdx === count - 1
            );
            const showRewardForAction = showRewards || (actionIdx < count - 1 && detail.subPhase === 'show_action');

            action.transitions.forEach((t, ti) => {
                const key = `${actionIdx}_${ti}`;
                const lineP = this._progress(detail, 'as_line', key);
                const headP = this._progress(detail, 'as_head', key);
                const labelP = this._progress(detail, 'label', key);

                this._drawAnimatedArrow(
                    action.x, action.y, t.toX, t.toY,
                    this.ACTION_NODE_RADIUS, t.toRadius,
                    edgeColor, 1.0, lineP, headP
                );

                if (labelP > 0) {
                    const labelX = (action.x + t.toX) / 2;
                    const labelY = (action.y + t.toY) / 2 - 8;
                    const aVal = Math.round(200 * labelP);
                    mathRenderer.draw(drawingContext, `p = ${t.probability.toFixed(2)}`,
                        labelX, labelY, { color: AppPalette.border.canvasDark, em: 9, alpha: aVal });
                    if (isComputed || showRewardForAction) {
                        const gamma = detail.gamma || 0.9;
                        mathRenderer.draw(drawingContext, `r = ${t.reward.toFixed(1)}`,
                            labelX, labelY + 11, { color: AppPalette.text.medium, em: 9, alpha: aVal });
                        const term = `${t.probability.toFixed(2)}\\cdot[${t.reward.toFixed(1)}+${gamma}\\cdot${t.nextValue.toFixed(1)}]=${t.term.toFixed(2)}`;
                        mathRenderer.draw(drawingContext, term,
                            labelX, labelY + 22, { color: AppPalette.text.mediumLight, em: 8, alpha: Math.round(180 * labelP) });
                    }
                }
            });
        });
    }

    /** Draw Q-value labels below each action diamond */
    _drawQValues(detail) {
        if (!detail.actions) return;

        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;

        detail.actions.slice(0, count).forEach(action => {
            const isBest = action.actionId === detail.bestActionId;
            mathRenderer.draw(drawingContext, `Q = ${action.qValue.toFixed(2)}`,
                action.x, action.y + this.ACTION_NODE_RADIUS + 4,
                { color: isBest ? AppPalette.valueIteration.best : AppPalette.text.medium, em: 10, alignX: 'center', alignY: 'top' });
        });
    }

    /** Highlight the best action and show V(s) result */
    _drawMaxSelection(detail) {
        if (!detail.actions || detail.actions.length === 0) return;

        const burstP = this._progress(detail, 'select_burst');
        const scanP = this._progress(detail, 'scan');

        // Scan bar sweeping through action rows during select_max
        if (detail.subPhase === 'select_max' && scanP < 1) {
            const numActions = detail.actions.length;
            const scanRow = Math.min(Math.floor(scanP * numActions), numActions - 1);
            const action = detail.actions[scanRow];
            push();
            noStroke();
            fill(255, 240, 60, 70);
            const sr = this.ACTION_NODE_RADIUS + 6;
            rect(action.x - sr, action.y - sr, sr * 2, sr * 2, 4);
            pop();
        }

        // Best action highlight ring — appears with burst or in revealing_value
        const ringAlpha = detail.subPhase === 'select_max' ? burstP : 1;
        if (ringAlpha > 0) {
            detail.actions.forEach(action => {
                if (action.actionId !== detail.bestActionId) return;
                push();
                noFill();
                stroke(46, 160, 67, 255 * ringAlpha);
                strokeWeight(3);
                const r = this.ACTION_NODE_RADIUS + 4;
                beginShape();
                vertex(action.x, action.y - r);
                vertex(action.x + r, action.y);
                vertex(action.x, action.y + r);
                vertex(action.x - r, action.y);
                endShape(CLOSE);
                pop();
            });
        }

        // V badge — static for select_max (fades in with burst), omit for revealing_value (drawn by overlay)
        if (detail.subPhase !== 'revealing_value') {
            const vAlpha = detail.subPhase === 'select_max' ? burstP * 220 : 220;
            if (vAlpha > 4) {
                this._drawStaticVBadge(detail, vAlpha);
            }
        }
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

        // Header text — use MathRenderer for math strings
        const hcy = tableY + headerH / 2;
        for (let ti = 0; ti < maxTrans; ti++) {
            const cx = tableX + actionColW + ti * transColW + transColW / 2;
            mathRenderer.draw(drawingContext, `s'_{${ti + 1}},\\;(p,\\,r)`,
                cx, hcy, { color: AppPalette.text.mediumLight, em: 10 });
        }
        mathRenderer.draw(drawingContext, 'Q(s, a)',
            tableX + actionColW + maxTrans * transColW + qColW / 2, hcy,
            { color: AppPalette.border.canvasDark, em: 10 });

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
                    const term = `${t.probability.toFixed(2)}\\cdot[${t.reward.toFixed(0)}+${gamma}\\cdot${t.nextValue.toFixed(0)}]=${t.term.toFixed(2)}`;
                    mathRenderer.draw(drawingContext, term, cx, cy, { color: AppPalette.text.mediumDark, em: 9 });
                } else {
                    mathRenderer.draw(drawingContext, `p = ${t.probability.toFixed(2)}`,
                        cx, cy, { color: AppPalette.text.light, em: 10 });
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
            const qcy = rowY + rowH / 2;
            if (rowCompleted) {
                const isBest = action.actionId === detail.bestActionId;
                mathRenderer.draw(drawingContext, action.qValue.toFixed(2), qx, qcy,
                    { color: isBest ? AppPalette.reward.positive : AppPalette.border.canvasDark, em: 11 });
            } else if (rowVisible && showTerms) {
                let runningSum = 0;
                for (let ti = 0; ti < showTransUpTo; ti++) {
                    runningSum += action.transitions[ti].term;
                }
                mathRenderer.draw(drawingContext, runningSum.toFixed(2), qx, qcy,
                    { color: AppPalette.text.light, em: 10 });
            } else {
                fill(200, 200, 200);
                noStroke();
                textSize(10);
                textAlign(CENTER, CENTER);
                textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
                text('—', qx, qcy);
            }
        }

        // V(s) = max row
        if (isSelectMax) {
            const vRowY = tableY + headerH + allActions.length * rowH;
            stroke(200, 200, 200);
            strokeWeight(1);
            line(tableX, vRowY, tableX + tableW, vRowY);

            const vMaxLatex = `V(\\text{${detail.stateName}}) = \\max = ${detail.value.toFixed(2)}`;
            mathRenderer.draw(drawingContext, vMaxLatex,
                tableX + tableW - 10, vRowY + rowH / 2,
                { color: AppPalette.valueIteration.result, em: 12, alignX: 'right', alignY: 'middle' });
        }

        pop();
    }

    // --- Per-action single-action drawing ---

    /** Draw a single action diamond with its state→action edge */
    _drawSingleAction(detail, action) {
        const actionColor = this._getActionColor(action.actionId, detail.actions, 200);
        const ai = detail.currentActionIndex ?? 0;
        const lineP = this._progress(detail, 'sa_line', ai);
        const headP = this._progress(detail, 'sa_head', ai);

        this._drawAnimatedArrow(
            detail.stateX, detail.stateY, action.x, action.y,
            detail.stateRadius, this.ACTION_NODE_RADIUS,
            actionColor, 1.5, lineP, headP
        );
        if (lineP > 0) {
            this._drawActionDiamond(action.x, action.y, action.actionName, actionColor, Math.round(200 * Math.min(lineP * 3, 1)));
        }
    }

    /** Draw N transitions for a single action, with optional reward labels */
    _drawPartialTransitions(detail, action, transCount, showReward) {
        if (transCount <= 0) return;

        const edgeColor = this._getActionColor(action.actionId, detail.actions, 180);
        const transitions = action.transitions.slice(0, transCount);

        transitions.forEach((t, ti) => {
            const lineP = this._progress(detail, 'as_line', ti);
            const headP = this._progress(detail, 'as_head', ti);
            const labelP = this._progress(detail, 'label', ti);

            this._drawAnimatedArrow(
                action.x, action.y, t.toX, t.toY,
                this.ACTION_NODE_RADIUS, t.toRadius,
                edgeColor, 1.0, lineP, headP
            );

            if (labelP > 0) {
                const labelX = (action.x + t.toX) / 2;
                const labelY = (action.y + t.toY) / 2 - 8;
                const aVal = Math.round(200 * labelP);
                mathRenderer.draw(drawingContext, `p = ${t.probability.toFixed(2)}`,
                    labelX, labelY, { color: AppPalette.border.canvasDark, em: 9, alpha: aVal });
                const isComputed = showReward && (ti < transCount);
                if (isComputed) {
                    const gamma = detail.gamma || 0.9;
                    mathRenderer.draw(drawingContext, `r = ${t.reward.toFixed(1)}`,
                        labelX, labelY + 11, { color: AppPalette.text.medium, em: 9, alpha: aVal });
                    const term = `${t.probability.toFixed(2)}\\cdot[${t.reward.toFixed(1)}+${gamma}\\cdot${t.nextValue.toFixed(1)}]=${t.term.toFixed(2)}`;
                    mathRenderer.draw(drawingContext, term,
                        labelX, labelY + 22, { color: AppPalette.text.mediumLight, em: 8, alpha: Math.round(180 * labelP) });
                }
            }
        });
    }

    /** Draw transition edges for a single action */
    _drawSingleActionTransitions(detail, action) {
        const edgeColor = this._getActionColor(action.actionId, detail.actions, 180);

        const showRewards = (detail.subPhase === 'compute_action');

        action.transitions.forEach(t => {
            this._drawArrowLine(action.x, action.y, t.toX, t.toY, this.ACTION_NODE_RADIUS, t.toRadius, edgeColor, 1.0);

            const labelX = (action.x + t.toX) / 2;
            const labelY = (action.y + t.toY) / 2 - 8;
            mathRenderer.draw(drawingContext, `p = ${t.probability.toFixed(2)}`,
                labelX, labelY, { color: AppPalette.border.canvasDark, em: 9 });
            if (showRewards) {
                const gamma = detail.gamma || 0.9;
                mathRenderer.draw(drawingContext, `r = ${t.reward.toFixed(1)}`,
                    labelX, labelY + 11, { color: AppPalette.text.medium, em: 9 });
                const term = `${t.probability.toFixed(2)}\\cdot[${t.reward.toFixed(1)}+${gamma}\\cdot${t.nextValue.toFixed(1)}]=${t.term.toFixed(2)}`;
                mathRenderer.draw(drawingContext, term,
                    labelX, labelY + 22, { color: AppPalette.text.mediumLight, em: 8 });
            }
        });
    }

    /** Draw Q-value for a single action */
    _drawSingleActionQValue(detail, action) {
        const isBest = action.actionId === detail.bestActionId;
        mathRenderer.draw(drawingContext, `Q = ${action.qValue.toFixed(2)}`,
            action.x, action.y + this.ACTION_NODE_RADIUS + 4,
            { color: isBest ? AppPalette.valueIteration.best : AppPalette.text.medium, em: 10, alignX: 'center', alignY: 'top' });
    }

    /** Draw a small diamond shape for an action node. fillColor is a pre-computed p5 color. */
    _drawActionDiamond(x, y, name, fillColor, alpha) {
        const r = this.ACTION_NODE_RADIUS;

        push();

        fill(fillColor);
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

    /**
     * Returns a color on a green→grey→red scale based on Q-value rank.
     * actionsArray: array of {actionId, qValue}. Single action returns blue (animation) or dark grey (completed).
     */
    _getActionColor(actionId, actionsArray, alpha, singleActionColor) {
        if (!actionsArray || actionsArray.length <= 1) {
            return singleActionColor !== undefined
                ? color(singleActionColor[0], singleActionColor[1], singleActionColor[2], alpha)
                : color(100, 149, 237, alpha);
        }
        const sorted = [...actionsArray].sort((a, b) => b.qValue - a.qValue);
        const rank = sorted.findIndex(a => a.actionId === actionId);
        const t = rank / (sorted.length - 1); // 0 = best, 1 = worst
        let r, g, b;
        if (t <= 0.5) {
            const s = t * 2;
            r = Math.round(46  + (150 - 46)  * s);
            g = Math.round(160 + (150 - 160) * s);
            b = Math.round(67  + (150 - 67)  * s);
        } else {
            const s = (t - 0.5) * 2;
            r = Math.round(150 + (210 - 150) * s);
            g = Math.round(150 + (60  - 150) * s);
            b = Math.round(150 + (50  - 150) * s);
        }
        return color(r, g, b, alpha);
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

    // --- Animated arrow helper ---

    _drawAnimatedArrow(x1, y1, x2, y2, r1, r2, edgeColor, weight, lineProgress, headProgress) {
        const dx = x2 - x1, dy = y2 - y1;
        const angle = atan2(dy, dx);
        const startX = x1 + r1 * cos(angle), startY = y1 + r1 * sin(angle);
        const endX = x2 - r2 * cos(angle), endY = y2 - r2 * sin(angle);
        const tipX = lerp(startX, endX, lineProgress);
        const tipY = lerp(startY, endY, lineProgress);

        push();
        stroke(edgeColor);
        strokeWeight(weight);
        line(startX, startY, tipX, tipY);

        if (lineProgress >= 0.9 || headProgress > 0) {
            const arrowSize = 7 * Math.max(0.001, headProgress);
            fill(edgeColor);
            noStroke();
            triangle(
                tipX, tipY,
                tipX - arrowSize * cos(angle - 0.4), tipY - arrowSize * sin(angle - 0.4),
                tipX - arrowSize * cos(angle + 0.4), tipY - arrowSize * sin(angle + 0.4)
            );
        }
        pop();
    }

    // --- V badge helpers ---

    _drawStaticVBadge(detail, alpha = 220) {
        const latex = `V_{${detail.timestep}}(\\text{${detail.stateName}}) = ${detail.value.toFixed(2)}`;
        const color = AppPalette.valueIteration.badge;
        const em = 13;
        const vx = detail.stateX;
        const vy = detail.stateY + detail.stateRadius + 16;
        const sz = mathRenderer.getCachedSize(latex, color, em);
        const tw = sz ? sz.w + 16 : 80;
        const th = 24;
        push();
        noStroke();
        fill(25, 80, 170, alpha);
        rect(vx - tw / 2, vy - th / 2, tw, th, 12);
        pop();
        mathRenderer.draw(drawingContext, latex, vx, vy, { color, em, alpha });
    }

    _drawRevealingValueOverlay(detail) {
        const badgeP = this._progress(detail, 'badge_expand');
        const countP = this._progress(detail, 'value_countup');
        const pulseP = this._progress(detail, 'node_pulse');

        // Node ring pulse
        if (pulseP > 0 && pulseP < 1) {
            push();
            noFill();
            stroke(255, 255, 255, 200 * (1 - pulseP));
            strokeWeight(3 * (1 - pulseP));
            ellipse(detail.stateX, detail.stateY, (detail.stateRadius + 10 * pulseP) * 2);
            pop();
        }

        if (badgeP <= 0) return;

        const displayValue = detail.value * countP;
        const finalLatex  = `V_{${detail.timestep}}(\\text{${detail.stateName}}) = ${detail.value.toFixed(2)}`;
        const currentLatex = `V_{${detail.timestep}}(\\text{${detail.stateName}}) = ${displayValue.toFixed(2)}`;
        const badgeColor = AppPalette.valueIteration.badge;
        const em = 13;
        const vx = detail.stateX;
        const vy = detail.stateY + detail.stateRadius + 16;

        const sz = mathRenderer.getCachedSize(finalLatex, badgeColor, em);
        const fullTw = sz ? sz.w + 16 : 80;
        const th = 24;

        push();
        // Scale badge width from center
        translate(vx, vy);
        scale(badgeP, 1);
        translate(-vx, -vy);
        noStroke();
        fill(25, 80, 170, 220);
        rect(vx - fullTw / 2, vy - th / 2, fullTw, th, 12);
        pop();

        // Draw text at full scale (only when badge is mostly open)
        if (badgeP > 0.5) {
            mathRenderer.draw(drawingContext, currentLatex, vx, vy,
                { color: AppPalette.text.inverse, em, alpha: Math.round(220 * Math.min((badgeP - 0.5) * 2, 1)) });
        }
    }

    // --- Animation infrastructure ---

    _onPhaseChange(detail) {
        this.tween.clear();
        if (!detail) return;
        if (!this._shouldAnimate(detail)) return;
        this._startTweensForPhase(detail);
        if (typeof loop === 'function') loop();
    }

    _startTweensForPhase(detail) {
        switch (detail.subPhase) {
            case 'show_equation':
                this.tween.start(this._phaseId(detail, 'equation'), VI_DUR_EQUATION, 'easeInOut');
                break;
            case 'show_actions':
                detail.actions.forEach((action, i) => {
                    this.tween.start(this._phaseId(detail, 'sa_line', i), VI_DUR_SA_LINE, 'linear', i * VI_DUR_SA_STAGGER);
                    this.tween.start(this._phaseId(detail, 'sa_head', i), VI_DUR_SA_HEAD, 'easeOut', i * VI_DUR_SA_STAGGER + VI_DUR_SA_HEAD_DELAY);
                });
                break;
            case 'show_action':
                this.tween.start(this._phaseId(detail, 'sa_line', detail.currentActionIndex ?? 0), VI_DUR_SA_LINE, 'linear');
                this.tween.start(this._phaseId(detail, 'sa_head', detail.currentActionIndex ?? 0), VI_DUR_SA_HEAD, 'easeOut', VI_DUR_SA_HEAD_DELAY);
                break;
            case 'show_transitions':
                this._forVisibleTransitions(detail, (action, t, key, i) => {
                    this.tween.start(this._phaseId(detail, 'as_line', key), VI_DUR_AS_LINE, 'linear', i * VI_DUR_AS_STAGGER);
                    this.tween.start(this._phaseId(detail, 'as_head', key), VI_DUR_AS_HEAD, 'easeOut', i * VI_DUR_AS_STAGGER + VI_DUR_AS_HEAD_DELAY);
                    this.tween.start(this._phaseId(detail, 'label', key), VI_DUR_AS_LABEL, 'easeOutBack', i * VI_DUR_AS_STAGGER + VI_DUR_AS_LABEL_DELAY);
                });
                break;
            case 'show_transition': {
                const ti = detail.currentTransitionIndex ?? 0;
                this.tween.start(this._phaseId(detail, 'as_line', ti), VI_DUR_AS_LINE, 'linear');
                this.tween.start(this._phaseId(detail, 'as_head', ti), VI_DUR_AS_HEAD, 'easeOut', VI_DUR_AS_HEAD_DELAY);
                this.tween.start(this._phaseId(detail, 'label', ti), VI_DUR_AS_LABEL, 'easeOutBack', VI_DUR_AS_LABEL_DELAY);
                break;
            }
            case 'compute_q_values':
                this.tween.start(this._phaseId(detail, 'q_countup'), VI_DUR_Q_COUNTUP, 'easeInOut');
                break;
            case 'show_q_result':
                this.tween.start(this._phaseId(detail, 'q_badge'), VI_DUR_Q_BADGE, 'easeOutBack');
                break;
            case 'select_max': {
                const scanDur = Math.min(VI_DUR_SCAN_MAX, detail.actions.length * VI_DUR_SCAN_PER_ACTION);
                this.tween.start(this._phaseId(detail, 'scan'), scanDur, 'linear');
                this.tween.start(this._phaseId(detail, 'select_burst'), VI_DUR_SELECT_BURST, 'easeOut', scanDur);
                break;
            }
            case 'revealing_value':
                this.tween.start(this._phaseId(detail, 'badge_expand'), VI_DUR_BADGE_EXPAND, 'easeOut');
                this.tween.start(this._phaseId(detail, 'value_countup'), VI_DUR_VALUE_COUNTUP, 'easeInOut');
                this.tween.start(this._phaseId(detail, 'node_pulse'), VI_DUR_NODE_PULSE, 'easeOut');
                break;
        }
    }

    _detectNewColumnTweens() {
        const current = this.viViewModel.visibleColumnCount;
        if (current < this._lastVisibleColumnCount) {
            this._lastVisibleColumnCount = 0;
            this.tween.clear();
        }
        if (current <= this._lastVisibleColumnCount) return;

        for (let colIdx = this._lastVisibleColumnCount; colIdx < current; colIdx++) {
            const col = this.viViewModel.columns[colIdx];
            if (!col) continue;
            col.states.forEach((state, i) => {
                this.tween.start(`column:${colIdx}:state:${state.id}:scale`, VI_DUR_COL_SCALE, 'easeOutBack', i * VI_DUR_COL_STAGGER);
            });
        }
        this._lastVisibleColumnCount = current;
        if (typeof loop === 'function') loop();
    }

    _getPhaseKey(detail) {
        if (!detail) return null;
        return [
            detail.columnIndex,
            detail.stateId,
            detail.subPhase,
            detail.currentActionIndex ?? -1,
            detail.currentTransitionIndex ?? -1
        ].join(':');
    }

    _phaseId(detail, name, suffix = '') {
        return [
            detail.columnIndex,
            detail.stateId,
            detail.subPhase,
            detail.currentActionIndex ?? -1,
            detail.currentTransitionIndex ?? -1,
            name,
            suffix
        ].join(':');
    }

    _progress(detail, name, suffix = '') {
        if (!this._shouldAnimate(detail)) return 1;
        return this.tween.progress(this._phaseId(detail, name, suffix));
    }

    _shouldAnimate(detail) {
        return (detail?.phaseDuration ?? 0) > 0;
    }

    _forVisibleTransitions(detail, callback) {
        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;
        let i = 0;
        detail.actions.slice(0, count).forEach((action, ai) => {
            action.transitions.forEach((t, ti) => {
                callback(action, t, `${ai}_${ti}`, i);
                i++;
            });
        });
    }
}
