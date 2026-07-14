// --- File-local rendering constants ---
const VI_ACTION_NODE_RADIUS  = 18;

// Escape special TeX characters in node/action names interpolated into \text{...}.
function _viLatexEscape(text) {
    return String(text)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/\{/g, '\\{').replace(/\}/g, '\\}')
        .replace(/_/g, '\\_').replace(/\^/g, '\\^{}')
        .replace(/&/g, '\\&').replace(/%/g, '\\%')
        .replace(/\$/g, '\\$').replace(/#/g, '\\#');
}

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
    constructor(canvasViewModel, layout) {
        this.viewModel = canvasViewModel;
        this.ACTION_NODE_RADIUS = VI_ACTION_NODE_RADIUS;
        this.tween = new VITweenEngine();
        this._lastPhaseKey = null;
        this._lastPulseSweep = undefined;
        // Accessors for the real right-panel width / top-bar height, so placeholder/status-strip
        // layout stays correct even if those dimensions change (panel resize, spec dimension
        // updates) instead of duplicating magic numbers here.
        this.layout = layout || { getPanelWidth: () => 272, getTopOffset: () => 40, getBottomOffset: () => 40 };
    }

    get viState() {
        return this.viewModel.valueIterationState;
    }

    // Resolves through the 2x2 method matrix (transition-model known/unknown x observability
    // full/partial) instead of a 2-way modelKnown ternary - see valuesMethodMatrix.js.
    // observability defaults to 'full' if unset (e.g. before the toggle exists), so this
    // degrades safely to today's Value Iteration/Learning Iteration behavior.
    get viColors() {
        const entry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
        return AppPalette[entry.paletteNamespace];
    }

    // "p = 0.80" (P known) vs "p = ?" (P unknown) for simple transition-probability labels.
    _pLabel(probability) {
        return this.viewModel.modelKnown ? `p = ${probability.toFixed(2)}` : 'p = ?';
    }

    _pLabelColor(fallback) {
        return this.viewModel.modelKnown ? fallback : AppPalette.text.placeholder;
    }

    get viViewModel() {
        return this.viewModel.valueIterationViewModel;
    }

    draw() {
        if (!this.viState || !this.viState.initialized || !this.viewModel.graph) {
            this._drawPlaceholder();
            return;
        }

        const graph = this.viewModel.graph;
        const stateNodes = graph.nodes.filter(n => n.type === 'state');
        if (stateNodes.length === 0) {
            this._drawPlaceholder();
            return;
        }

        const sweep = this.viState.currentSweepIndex;

        // Pulse all nodes when the sweep index advances (the per-sweep "beat").
        this._detectSweepPulse(sweep, stateNodes);

        // Edges (policy-highlighted state->action->state chains) behind the nodes.
        this._drawPolicyGraph(stateNodes, sweep, graph);

        // Heat-mapped state nodes with V labels.
        const values = this.viState.getValues(sweep);
        const maxAbs = this._maxAbsValue(values);
        for (const node of stateNodes) {
            this._drawHeatStateNode(node, sweep, values, maxAbs);
        }

        // Explanation overlay if a Q-cell is being explained (re-anchored fan-out to real node).
        const explanationDetail = this.viViewModel.explanationDetail;
        if (explanationDetail) {
            // Phase-change detection restarts the explanation tweens on step-through.
            const phaseKey = this._getPhaseKey(explanationDetail);
            if (phaseKey !== this._lastPhaseKey) {
                this._onPhaseChange(explanationDetail);
                this._lastPhaseKey = phaseKey;
            }
            this._drawExplanationOverlay(explanationDetail);
        } else {
            this._lastPhaseKey = null;
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
        textFont(Typography.sans());
        text('Set max sweeps (T) and click Run to start Value Iteration',
            (windowWidth - this.layout.getPanelWidth()) / 2, (windowHeight - this.layout.getTopOffset()) / 2);
        pop();
    }

    // Method accent hex (teal for VI, purple for LI, yellow for BI/PO-L) for the heat fill.
    _accentColor() {
        const entry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
        return AppPalette.accent[entry.accent] || this.viColors.result;
    }

    _maxAbsValue(values) {
        let m = 0;
        for (const id of Object.keys(values)) {
            const a = Math.abs(values[id] ?? 0);
            if (a > m) m = a;
        }
        return m;
    }

    // Heat-map node: fill = method accent at alpha proportional to |V(s)| / max_s|V(s)| at the
    // current sweep. Single-hue-by-magnitude (not a diverging red/green scale) is a deliberate
    // simplification: these MDPs can have negative-valued states, so magnitude is the clearest
    // signal to encode in one channel.
    _drawHeatStateNode(node, sweep, values, maxAbs) {
        const r = node.size;
        const v = values[node.id] ?? 0;
        const frac = maxAbs > 0 ? Math.min(Math.max(Math.abs(v) / maxAbs, 0), 1) : 0;
        const heatAlpha = Math.round(0.4 * 255 * frac);
        const accent = color(this._accentColor());

        // Sweep pulse ring
        const pulseId = `sweep:${sweep}:pulse:${node.id}`;
        const pulseP = this.tween.progress(pulseId);

        const isPartialObs = this.viewModel.observability === 'partial';

        push();
        fill(red(accent), green(accent), blue(accent), heatAlpha);
        stroke(AppPalette.text.medium);
        strokeWeight(2);
        if (isPartialObs) drawingContext.setLineDash([6, 5]);
        ellipse(node.x, node.y, r * 2, r * 2);
        if (isPartialObs) drawingContext.setLineDash([]);
        pop();

        if (pulseP > 0 && pulseP < 1) {
            push();
            noFill();
            stroke(red(accent), green(accent), blue(accent), 200 * (1 - pulseP));
            strokeWeight(3 * (1 - pulseP));
            ellipse(node.x, node.y, (r + 12 * pulseP) * 2);
            pop();
        }

        // State name
        push();
        fill(AppPalette.text.black);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        textFont(Typography.sans());
        text(node.name, node.x, node.y - 6);
        pop();

        // V / belief label
        if (isPartialObs) {
            const { b, vOfB } = this._beliefFor(node.id, sweep);
            mathRenderer.draw(drawingContext, `b = ${b.toFixed(2)}`,
                node.x, node.y + 8,
                { color: AppPalette.text.muted, em: 9, alignX: 'center', alignY: 'middle' });
            mathRenderer.draw(drawingContext, `V(b) = ${vOfB.toFixed(2)}`,
                node.x, node.y + 21,
                { color: this.viColors.result, em: 11, alignX: 'center', alignY: 'middle' });
        } else {
            const label = this.viewModel.modelKnown
                ? `V = ${v.toFixed(2)}`
                : `Q̂ = ${v.toFixed(2)}`;
            mathRenderer.draw(drawingContext, label,
                node.x, node.y + 10,
                { color: this.viColors.result, em: 11, alignX: 'center', alignY: 'middle' });
        }
    }

    // See ValuesMethodMatrix.beliefFor - shared with rightPanel.js's Estimate-vs-exact table so
    // both surfaces agree on the same illustrative number. Always reads the CURRENT sweep now
    // (one node per state, not one per column).
    _beliefFor(stateId, sweepIdx) {
        return ValuesMethodMatrix.beliefFor(this.viState, stateId, sweepIdx);
    }

    // --- Policy-highlighted graph edges ---

    // Draws every state->action->state chain, muted gray for non-policy actions. Each state's
    // ONE greedy (policy) action is emphasized: dashed muted-yellow while it still matches the
    // arbitrary sweep-0 pick, solid green once its argmax has flipped. Per-edge Q-rank coloring
    // is intentionally dropped (the heat fill + policy dash/solid already carry the signal).
    _drawPolicyGraph(stateNodes, sweep, graph) {
        const grayHex = AppPalette.edge.default;
        const yellowHex = AppPalette.accent.yellow;
        const greenHex = AppPalette.reward.positive;

        for (const node of stateNodes) {
            if (!node.actions || node.actions.length === 0) continue;
            const policyActionId = this.viState.getBestAction(sweep, node.id);
            const sweep0ActionId = this.viState.getBestAction(0, node.id);
            const flipped = policyActionId !== null && policyActionId !== sweep0ActionId;

            for (const actionId of node.actions) {
                const actionNode = graph.getNodeById(actionId);
                if (!actionNode) continue;
                const isPolicy = actionId === policyActionId;

                let edgeHex, weight, dashed, edgeAlpha;
                if (isPolicy) {
                    edgeHex = flipped ? greenHex : yellowHex;
                    weight = 3;
                    dashed = !flipped;
                    edgeAlpha = 230;
                } else {
                    edgeHex = grayHex;
                    weight = 1;
                    dashed = false;
                    edgeAlpha = 70;
                }
                const edgeColor = ColorUtils.applyAlpha(edgeHex, edgeAlpha);

                // state -> action
                this._drawPolicyArrow(node.x, node.y, actionNode.x, actionNode.y,
                    node.size, actionNode.size, edgeColor, weight, dashed);

                // action -> successors (thinner, same hue)
                if (actionNode.sas) {
                    const succColor = ColorUtils.applyAlpha(edgeHex, isPolicy ? 170 : 55);
                    actionNode.sas.forEach(({ nextState }) => {
                        const toNode = graph.getNodeById(nextState);
                        if (!toNode) return;
                        this._drawPolicyArrow(actionNode.x, actionNode.y, toNode.x, toNode.y,
                            actionNode.size, toNode.size, succColor, isPolicy ? 1.5 : 0.9, dashed);
                    });
                }

                // Action-node marker, matching Build mode's real node size/shape exactly.
                this._drawActionCircle(actionNode.x, actionNode.y, actionNode.name,
                    ColorUtils.applyAlpha(AppPalette.node.action, isPolicy ? 220 : 110),
                    isPolicy ? 230 : 130, actionNode.size);
            }
        }
    }

    _drawPolicyArrow(x1, y1, x2, y2, r1, r2, edgeColor, weight, dashed) {
        const dx = x2 - x1, dy = y2 - y1;
        const angle = atan2(dy, dx);
        const startX = x1 + r1 * cos(angle), startY = y1 + r1 * sin(angle);
        const endX = x2 - r2 * cos(angle), endY = y2 - r2 * sin(angle);

        push();
        stroke(edgeColor);
        strokeWeight(weight);
        if (dashed) drawingContext.setLineDash([7, 5]);
        line(startX, startY, endX, endY);
        if (dashed) drawingContext.setLineDash([]);

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

    // Start a short pulse on every state node when the sweep index changes.
    _detectSweepPulse(sweep, stateNodes) {
        if (this._lastPulseSweep === undefined) this._lastPulseSweep = -1;
        if (sweep === this._lastPulseSweep) return;
        // Only pulse on forward progress past sweep 0 (sweep 0 is the flat init).
        if (sweep > 0) {
            stateNodes.forEach((node, i) => {
                this.tween.start(`sweep:${sweep}:pulse:${node.id}`, VI_DUR_NODE_PULSE * 2, 'easeOut', i * 25);
            });
            if (typeof loop === 'function') loop();
        }
        this._lastPulseSweep = sweep;
    }

    // --- Detailed Bellman backup animation ---

    _drawExplanationOverlay(detail) {
        this._drawExplainStateHighlight(detail);
        this._drawBackupAnimation(detail);
    }

    _drawExplainStateHighlight(detail) {
        push();
        noFill();
        stroke(33, 150, 243, 80);
        strokeWeight(8);
        ellipse(detail.stateX, detail.stateY, (detail.stateRadius + 8) * 2, (detail.stateRadius + 8) * 2);
        stroke(33, 150, 243, 220);
        strokeWeight(2.5);
        ellipse(detail.stateX, detail.stateY, (detail.stateRadius + 5) * 2, (detail.stateRadius + 5) * 2);
        pop();
    }

    _drawBackupAnimation(detail) {
        const bundledPhases = ['show_equation', 'show_actions', 'explain_q', 'show_transitions', 'compute_q_values', 'select_max', 'revealing_value'];
        const phaseIdx = bundledPhases.indexOf(detail.subPhase);
        const perActionPhases = ['show_action', 'show_transition', 'compute_transition', 'show_q_result'];
        const isPerAction = perActionPhases.includes(detail.subPhase);

        if (phaseIdx < 0 && !isPerAction) return;

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
        } else if (detail.subPhase === 'select_max' || detail.subPhase === 'revealing_value') {
            this._drawActionFanOut(detail);
            this._drawQValues(detail);
            this._drawMaxSelection(detail);
            if (detail.subPhase === 'revealing_value') {
                this._drawRevealingValueOverlay(detail);
            }
        } else {
            // Bundled mode: cumulative phases
            // phaseIdx: 1=show_actions, 2=explain_q, 3=show_transitions, 4=compute_q_values, 5=select_max
            if (phaseIdx >= 1) this._drawActionFanOut(detail);
            if (phaseIdx === 2) this._drawQPlaceholders(detail);
            if (phaseIdx >= 4) this._drawQValues(detail);
            if (phaseIdx >= 3) this._drawTransitionEdges(detail);
            if (phaseIdx >= 5) this._drawMaxSelection(detail);
        }

        this._drawStatusStrip(detail);
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
            else if (line.type === 'result') { color = this.viColors.result; em = 12; }
            else                             { color = AppPalette.text.medium; em = 11; }

            mathRenderer.draw(drawingContext, line.text, boxX + 8, ly,
                { color, em, alpha: a, alignX: 'left', alignY: 'middle' });
        });
    }

    /** Fixed screen-space status strip showing the current animation phase */
    _drawStatusStrip(detail) {
        const text = this._getStatusText(detail);
        if (!text) return;

        const canvasW = windowWidth - this.layout.getPanelWidth();
        const x = 16;
        const y = windowHeight - this.layout.getBottomOffset();
        const w = Math.min(canvasW - 32, 620);
        const h = 34;

        push();
        resetMatrix();
        fill(255, 255, 255, 235);
        stroke(100, 100, 100, 150);
        strokeWeight(1);
        rect(x, y, w, h, 6);
        noStroke();
        mathRenderer.draw(drawingContext, text, x + 12, y + h / 2, {
            color: AppPalette.text.nearBlack,
            em: 13,
            alignX: 'left',
            alignY: 'middle'
        });
        pop();
    }

    _getStatusText(detail) {
        const phase = detail?.subPhase;
        if (phase === 'compute_transition') {
            const action = detail.actions?.[detail.currentActionIndex];
            const t = action?.transitions?.[detail.currentTransitionIndex];
            if (t) return `p=${t.probability.toFixed(2)}, r=${t.reward.toFixed(1)}  ->  term=${t.term.toFixed(2)}`;
        }
        if (phase === 'show_q_result') {
            const action = detail.actions?.[detail.currentActionIndex];
            if (action) return `Q(${action.actionName}) = ${action.qValue.toFixed(2)}`;
        }
        const map = {
            'show_equation':    'Bellman backup for V(s)',
            'show_actions':     'Compare available actions',
            'explain_q':        'Each action gets one Q-value: the expected return after taking that action',
            'show_action':      'Compare available actions',
            'show_transitions': 'Transitions show how each Q(s,a) is calculated',
            'show_transition':  'Reveal transition outcomes',
            'compute_q_values': 'Compute Q(s,a)',
            'select_max':       'Choose max Q',
            'revealing_value':  'Store V(s)',
        };
        return map[phase] || '';
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
                    mathRenderer.draw(drawingContext, this._pLabel(t.probability),
                        labelX, labelY, { color: this._pLabelColor(AppPalette.border.canvasDark), em: 9, alpha: aVal });
                    if (isComputed || showRewardForAction) {
                        mathRenderer.draw(drawingContext, `r = ${t.reward.toFixed(1)}`,
                            labelX, labelY + 11, { color: AppPalette.text.medium, em: 9, alpha: aVal });
                    }
                }
            });
        });
    }

    /** Draw Q=? placeholder labels during explain_q phase, before numeric values are computed */
    _drawQPlaceholders(detail) {
        if (!detail.actions) return;
        const count = detail.visibleActionCount !== undefined ? detail.visibleActionCount : detail.actions.length;
        const fadeP = this._progress(detail, 'q_fade');
        const alpha = Math.round(220 * fadeP);

        detail.actions.slice(0, count).forEach(action => {
            mathRenderer.draw(drawingContext, 'Q = ?',
                action.x, action.y + this.ACTION_NODE_RADIUS + 4,
                { color: AppPalette.text.medium, em: 10, alignX: 'center', alignY: 'top', alpha });
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
                { color: isBest ? this.viColors.best : AppPalette.text.medium, em: 10, alignX: 'center', alignY: 'top' });
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

        // Best action highlight — colored ring, appears with burst or in revealing_value.
        const ringAlpha = detail.subPhase === 'select_max' ? burstP : 1;
        if (ringAlpha > 0) {
            detail.actions.forEach(action => {
                if (action.actionId !== detail.bestActionId) return;
                this._drawWinnerRing(action.x, action.y, this.ACTION_NODE_RADIUS + 6, ringAlpha);
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

    // Colored ring marking the winning (argmax) action. Shared styling for the explanation-card
    // max-selection moment; uses the method's "best" accent so VI/LI/BI/PO-L stay distinct.
    _drawWinnerRing(x, y, radius, alpha = 1) {
        const c = color(this.viColors.best);
        push();
        noFill();
        stroke(red(c), green(c), blue(c), 255 * alpha);
        strokeWeight(3);
        ellipse(x, y, radius * 2, radius * 2);
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
        const font = Typography.mono();
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
                    mathRenderer.draw(drawingContext, this._pLabel(t.probability),
                        cx, cy, { color: this._pLabelColor(AppPalette.text.light), em: 10 });
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
                textFont(Typography.mono());
                text('—', qx, qcy);
            }
        }

        // V(s) = max row
        if (isSelectMax) {
            const vRowY = tableY + headerH + allActions.length * rowH;
            stroke(200, 200, 200);
            strokeWeight(1);
            line(tableX, vRowY, tableX + tableW, vRowY);

            const vMaxLatex = `V(\\text{${_viLatexEscape(detail.stateName)}}) = \\max = ${detail.value.toFixed(2)}`;
            mathRenderer.draw(drawingContext, vMaxLatex,
                tableX + tableW - 10, vRowY + rowH / 2,
                { color: this.viColors.result, em: 12, alignX: 'right', alignY: 'middle' });
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
                mathRenderer.draw(drawingContext, this._pLabel(t.probability),
                    labelX, labelY, { color: this._pLabelColor(AppPalette.border.canvasDark), em: 9, alpha: aVal });
                const isComputed = showReward && (ti < transCount);
                if (isComputed) {
                    mathRenderer.draw(drawingContext, `r = ${t.reward.toFixed(1)}`,
                        labelX, labelY + 11, { color: AppPalette.text.medium, em: 9, alpha: aVal });
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
            mathRenderer.draw(drawingContext, this._pLabel(t.probability),
                labelX, labelY, { color: this._pLabelColor(AppPalette.border.canvasDark), em: 9 });
            if (showRewards) {
                mathRenderer.draw(drawingContext, `r = ${t.reward.toFixed(1)}`,
                    labelX, labelY + 11, { color: AppPalette.text.medium, em: 9 });
            }
        });
    }

    /** Draw Q-value for a single action */
    _drawSingleActionQValue(detail, action) {
        const isBest = action.actionId === detail.bestActionId;
        mathRenderer.draw(drawingContext, `Q = ${action.qValue.toFixed(2)}`,
            action.x, action.y + this.ACTION_NODE_RADIUS + 4,
            { color: isBest ? this.viColors.best : AppPalette.text.medium, em: 10, alignX: 'center', alignY: 'top' });
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
        textFont(Typography.sans());
        text(name, x, y);

        pop();
    }

    // Main-graph action-node marker - a circle at the node's REAL (resizable) size, matching
    // Build mode's look exactly (mainView.js's own action-node circle). Deliberately distinct from
    // _drawActionDiamond, which stays a small fixed-radius diamond for the backup/explanation
    // fan-out schematic - that overlay is an intentionally simplified, synthetically-laid-out
    // diagram, not a "second copy of the real graph."
    _drawActionCircle(x, y, name, fillColor, alpha, size) {
        push();

        fill(fillColor);
        stroke(ColorUtils.applyAlpha(AppPalette.text.medium, alpha));
        strokeWeight(1.5);
        circle(x, y, size * 2);

        fill(ColorUtils.applyAlpha(ColorUtils.contrastText(fillColor), alpha));
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont(Typography.sans());
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

        // Belief Iteration / PO Q-Learning are illustrative-only (see ValuesMethodMatrix) - use
        // a yellow-family accent instead of the green/grey/red rank gradient below, faded by
        // rank via alpha so best/worst actions are still distinguishable even though everything
        // stays yellow-family. Composes with the caller's existing alpha-blending since this
        // still returns a color(...) with an alpha channel, just like every other branch here.
        if (this.viewModel.observability === 'partial') {
            const yellow = color(AppPalette.accent.yellow);
            const fadedAlpha = alpha * (1 - 0.5 * t);
            return color(red(yellow), green(yellow), blue(yellow), fadedAlpha);
        }

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
        const latex = `V^{${detail.timestep}}(\\text{${_viLatexEscape(detail.stateName)}}) = ${detail.value.toFixed(2)}`;
        const color = this.viColors.badge;
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

        // Quantize to steps of 0.05 to limit unique cache entries during count-up animation.
        const rawValue = detail.value * countP;
        const displayValue = Math.round(rawValue * 20) / 20;
        const escapedName = _viLatexEscape(detail.stateName);
        const finalLatex  = `V^{${detail.timestep}}(\\text{${escapedName}}) = ${detail.value.toFixed(2)}`;
        const currentLatex = countP >= 1
            ? finalLatex
            : `V^{${detail.timestep}}(\\text{${escapedName}}) = ${displayValue.toFixed(2)}`;
        const badgeColor = this.viColors.badge;
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

        // Draw text at full scale (only when badge is mostly open).
        // Fall back to plain p5 text if the KaTeX image isn't ready yet so the badge is never blank.
        if (badgeP > 0.5) {
            const textAlpha = Math.round(220 * Math.min((badgeP - 0.5) * 2, 1));
            const drawn = mathRenderer.draw(drawingContext, currentLatex, vx, vy,
                { color: AppPalette.text.inverse, em, alpha: textAlpha });
            if (!drawn) {
                push();
                fill(AppPalette.text.inverse);
                noStroke();
                textSize(em);
                textAlign(CENTER, CENTER);
                textFont(Typography.math());
                if (typeof drawingContext !== 'undefined') drawingContext.globalAlpha *= textAlpha / 255;
                text(mathRenderer._plainText(currentLatex), vx, vy);
                pop();
            }
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
        case 'explain_q':
                this.tween.start(this._phaseId(detail, 'q_fade'), 400, 'easeOut');
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
            case 'revealing_value': {
                this.tween.start(this._phaseId(detail, 'badge_expand'), VI_DUR_BADGE_EXPAND, 'easeOut');
                this.tween.start(this._phaseId(detail, 'value_countup'), VI_DUR_VALUE_COUNTUP, 'easeInOut');
                this.tween.start(this._phaseId(detail, 'node_pulse'), VI_DUR_NODE_PULSE, 'easeOut');
                // Pre-warm the final badge label so KaTeX image is ready by the time countP reaches 1
                const _prewarmLatex = `V^{${detail.timestep}}(\\text{${_viLatexEscape(detail.stateName)}}) = ${detail.value.toFixed(2)}`;
                mathRenderer.getCachedSize(_prewarmLatex, this.viColors.badge, 13);
                break;
            }
        }
    }

    _getPhaseKey(detail) {
        if (!detail) return null;
        const base = [
            detail.columnIndex,
            detail.stateId,
            detail.subPhase,
            detail.currentActionIndex ?? -1,
            detail.currentTransitionIndex ?? -1
        ].join(':');
        if (detail.explanationMode) {
            return `${base}:explain:${this.viViewModel.explanationTweenKey ?? ''}`;
        }
        return base;
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
