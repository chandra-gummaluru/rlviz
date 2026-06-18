import 
{ 
    DEFAULT_FLOATING_POINT_RANGE, 
    PROBABILITY_FLOATING_POINT_RANGE, 
    REWARD_FLOATING_POINT_RANGE,
    
    DEFAULT_TEXT_SIZE,
    BEST_RESULT_TEXT_SIZE,
    HEADER_TEXT_SIZE,
} from "./rightPanel";

// Easing functions for VI animations
const VI_EASINGS = {
    linear: t => t,
    easeOut: t => 1 - (1 - t) * (1 - t),
    easeInOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    easeOutBack: t => {
        const c1 = 1.70158, c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
};

export const GAMMA_DEFAULT = 0.9;
export const TEXT_SIZE = 13;
export const STROKE_WEIGHT = 2;
export const THRESHOLD = 0.2;
export const SIN_OFFSET = 0.4;
export const BURST_AMPLITUDE = 220;

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
        const fn = VI_EASINGS[tween.easing] || VI_EASINGS.linear;
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
        this.ACTION_NODE_RADIUS = 18;
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
        strokeWeight(REWARD_FLOATING_POINT_RANGE);
        ellipse(stateNode.x, stateNode.y, r * 2, r * 2);

        if (s > THRESHOLD) {
            fill(0, 0, 0, alpha);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(14);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
            text(stateNode.name, stateNode.x, stateNode.y - 6);

            if (isRevealed) {
                fill(0, 0, 0, alpha);
                textSize(DEFAULT_TEXT_SIZE);
                text(`V = ${stateNode.value.toFixed(REWARD_FLOATING_POINT_RANGE)}`, stateNode.x, stateNode.y + 10);
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
                    push();
                    noStroke();
                    fill(60, 60, 60, alpha);
                    textSize(10);
                    textAlign(CENTER, CENTER);
                    textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
                    text(`p=${probability.toFixed(2)}`, midX, midY);
                    if (reward !== 0) {
                        fill(reward > 0 ? color(46, 125, 50, alpha) : color(198, 40, 40, alpha));
                        text(`r=${reward.toFixed(DEFAULT_FLOATING_POINT_RANGE)}`, midX, midY + 12);
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

        noStroke();
        textAlign(LEFT, TOP);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

        lines.forEach((line, i) => {
            const lineStart = i / Math.max(lines.length, 1);
            const lineWindow = 1 / Math.max(lines.length, 1);
            const lineP = Math.min(Math.max((p - lineStart) / lineWindow, 0), 1);
            const yOffset = 4 * (1 - lineP);
            const a = Math.round(255 * lineP);
            if (a < 2) return;

            const y = boxY + 8 + i * lineHeight + yOffset;
            if (line.type === 'header') {
                fill(30, 30, 30, a);
                textSize(HEADER_TEXT_SIZE);
                textStyle(BOLD);
            } else if (line.type === 'best') {
                fill(46, 125, 50, a);
                textSize(DEFAULT_TEXT_SIZE);
                textStyle(NORMAL);
            } else if (line.type === 'result') {
                fill(25, 80, 170, a);
                textSize(BEST_RESULT_TEXT_SIZE);
                textStyle(BOLD);
            } else {
                fill(80, 80, 80, a);
                textSize(DEFAULT_TEXT_SIZE);
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
                    push();
                    noStroke();
                    textSize(9);
                    textAlign(CENTER, CENTER);
                    textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

                    fill(60, 60, 60, 200 * labelP);
                    text(`p=${t.probability.toFixed(2)}`, labelX, labelY);

                    if (isComputed || showRewardForAction) {
                        const gamma = detail.gamma || GAMMA_DEFAULT;
                        fill(80, 80, 80, 200 * labelP);
                        text(`r=${t.reward.toFixed(DEFAULT_FLOATING_POINT_RANGE)}`, labelX, labelY + 11);
                        fill(100, 100, 100, 180 * labelP);
                        textSize(8);
                        text(`${t.probability.
                            toFixed(REWARD_FLOATING_POINT_RANGE)}\u00B7[${t.reward.
                            toFixed(DEFAULT_FLOATING_POINT_RANGE)}+${gamma}\u00B7${t.nextValue.
                            toFixed(DEFAULT_FLOATING_POINT_RANGE)}] = ${t.term.
                            toFixed(REWARD_FLOATING_POINT_RANGE)}`, labelX, labelY + 22);
                    }
                    pop();
                }
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
            textSize(TEXT_SIZE);
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
                strokeWeight(PROBABILITY_FLOATING_POINT_RANGE);
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

        const gamma = detail.gamma || GAMMA_DEFAULT;
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
            textSize(DEFAULT_TEXT_SIZE);
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
                    text(`${t.probability.toFixed(REWARD_FLOATING_POINT_RANGE)}\u00B7[${t.reward.
                        toFixed(0)}+${gamma}\u00B7${t.nextValue.
                        toFixed(0)}]=${t.term.
                        toFixed(REWARD_FLOATING_POINT_RANGE)}`, cx, cy);
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
                textSize(DEFAULT_TEXT_SIZE);
                text(action.qValue.toFixed(REWARD_FLOATING_POINT_RANGE), qx, rowY + rowH / 2);
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
                text(runningSum.toFixed(REWARD_FLOATING_POINT_RANGE), qx, rowY + rowH / 2);
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
            text(`V(${detail.stateName}) = max = ${detail.value.toFixed(REWARD_FLOATING_POINT_RANGE)}`,
                tableX + tableW - 10, vRowY + rowH / 2);
            textStyle(NORMAL);
        }

        pop();
    }

    // --- Per-action single-action drawing ---

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
                push();
                noStroke();
                textSize(9);
                textAlign(CENTER, CENTER);
                textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

                fill(60, 60, 60, 200 * labelP);
                text(`p=${t.probability.toFixed(2)}`, labelX, labelY);

                const isComputed = showReward && (ti < transCount);
                if (isComputed) {
                    const gamma = detail.gamma || 0.9;
                    fill(80, 80, 80, 200 * labelP);
                    text(`r=${t.reward.toFixed(1)}`, labelX, labelY + 11);
                    fill(100, 100, 100, 180 * labelP);
                    textSize(8);
                    text(`${t.probability.toFixed(2)}\u00B7[${t.reward.toFixed(1)}+${gamma}\u00B7${t.nextValue.toFixed(1)}] = ${t.term.toFixed(2)}`, labelX, labelY + 22);
                }
                pop();
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
            push();
            noStroke();
            textSize(9);
            textAlign(CENTER, CENTER);
            textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

            fill(60, 60, 60, 200);
            text(`p=${t.probability.toFixed(2)}`, labelX, labelY);

            if (showRewards) {
                const gamma = detail.gamma || GAMMA_DEFAULT;
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
        push();
        const vText = `V${detail.timestep}(${detail.stateName}) = ${detail.value.toFixed(2)}`;
        noStroke();
        textSize(13);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        textStyle(BOLD);
        const tw = textWidth(vText) + 16;
        const th = 24;
        const vx = detail.stateX;
        const vy = detail.stateY + detail.stateRadius + 16;
        fill(25, 80, 170, alpha);
        rect(vx - tw / 2, vy - th / 2, tw, th, 12);
        fill(255, 255, 255, alpha);
        textAlign(CENTER, CENTER);
        text(vText, vx, vy);
        textStyle(NORMAL);
        pop();
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
        const finalText = `V${detail.timestep}(${detail.stateName}) = ${detail.value.toFixed(2)}`;
        const vText = `V${detail.timestep}(${detail.stateName}) = ${displayValue.toFixed(2)}`;
        const vx = detail.stateX;
        const vy = detail.stateY + detail.stateRadius + 16;

        push();
        noStroke();
        textSize(13);
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');
        textStyle(BOLD);
        const fullTw = textWidth(finalText) + 16;
        const th = 24;

        // Scale badge horizontally from center
        translate(vx, vy);
        scale(badgeP, 1);
        translate(-vx, -vy);

        fill(25, 80, 170, 220);
        rect(vx - fullTw / 2, vy - th / 2, fullTw, th, 12);
        fill(255);
        textAlign(CENTER, CENTER);
        text(vText, vx, vy);
        textStyle(NORMAL);
        pop();
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
                this.tween.start(this._phaseId(detail, 'equation'), 500, 'easeInOut');
                break;
            case 'show_actions':
                detail.actions.forEach((action, i) => {
                    this.tween.start(this._phaseId(detail, 'sa_line', i), 200, 'linear', i * 60);
                    this.tween.start(this._phaseId(detail, 'sa_head', i), 80, 'easeOut', i * 60 + 170);
                });
                break;
            case 'show_action':
                this.tween.start(this._phaseId(detail, 'sa_line', detail.currentActionIndex ?? 0), 200, 'linear');
                this.tween.start(this._phaseId(detail, 'sa_head', detail.currentActionIndex ?? 0), 80, 'easeOut', 170);
                break;
            case 'show_transitions':
                this._forVisibleTransitions(detail, (action, t, key, i) => {
                    this.tween.start(this._phaseId(detail, 'as_line', key), 220, 'linear', i * 60);
                    this.tween.start(this._phaseId(detail, 'as_head', key), 80, 'easeOut', i * 60 + 190);
                    this.tween.start(this._phaseId(detail, 'label', key), 180, 'easeOutBack', i * 60 + 220);
                });
                break;
            case 'show_transition': {
                const ti = detail.currentTransitionIndex ?? 0;
                this.tween.start(this._phaseId(detail, 'as_line', ti), 220, 'linear');
                this.tween.start(this._phaseId(detail, 'as_head', ti), 80, 'easeOut', 190);
                this.tween.start(this._phaseId(detail, 'label', ti), 180, 'easeOutBack', 220);
                break;
            }
            case 'compute_q_values':
                this.tween.start(this._phaseId(detail, 'q_countup'), 400, 'easeInOut');
                break;
            case 'show_q_result':
                this.tween.start(this._phaseId(detail, 'q_badge'), 250, 'easeOutBack');
                break;
            case 'select_max': {
                const scanDur = Math.min(500, detail.actions.length * 80);
                this.tween.start(this._phaseId(detail, 'scan'), scanDur, 'linear');
                this.tween.start(this._phaseId(detail, 'select_burst'), 300, 'easeOut', scanDur);
                break;
            }
            case 'revealing_value':
                this.tween.start(this._phaseId(detail, 'badge_expand'), 200, 'easeOut');
                this.tween.start(this._phaseId(detail, 'value_countup'), 400, 'easeInOut');
                this.tween.start(this._phaseId(detail, 'node_pulse'), 150, 'easeOut');
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
                this.tween.start(`column:${colIdx}:state:${state.id}:scale`, 300, 'easeOutBack', i * 40);
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
