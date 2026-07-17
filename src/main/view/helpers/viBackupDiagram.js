// src/main/view/helpers/viBackupDiagram.js
// Static Canvas2D renderer for a single state's backup diagram - state on the left, its actions
// in a middle column (Q-value label, best action highlighted/starred), each action's outcome
// next-states in a right column (one row per (action, transition) pair, NOT deduplicated by
// next-state). Node styling mirrors treeView.js's own _drawNode() convention exactly (circles,
// in-circle contrast-colored name labels, AppPalette.node.state/.node.action fill) - the 2026-07-17
// States view redesign's whole point was fixing the original version's total lack of node labels.
//
// Deliberately NOT mathRenderer-based (its failure-fallback path calls p5 GLOBAL functions that
// always draw to the MAIN canvas regardless of which ctx is passed - a real mismatch for a
// per-card canvas). Labels are plain ctx.fillText() instead. Deliberately NOT TreeLayout.js-based -
// that solves a harder, general recursive-unrolling problem; this is exactly one level deep with a
// small bounded fan-out, so a fixed three-column layout is simpler and sufficient.
const VBD_PADDING = 10;
const VBD_STATE_RADIUS = 16;
const VBD_ACTION_RADIUS = 11;
const VBD_REVEAL_ACTION_MS = 220;     // delay before each action's node+Q appears
const VBD_REVEAL_TRANSITION_MS = 140; // delay before each of that action's outcome nodes appears
const VBD_REVEAL_BEST_MS = 260;       // delay before the final best-action highlight pass

const ViBackupDiagram = {
    // canvas: an HTMLCanvasElement, already sized (see viStatesView.js's _buildDiagramCard()).
    // detail: ValueIterationState.getBackupDetail()'s exact return shape.
    // priorValues: { [stateId]: number } - the PRIOR sweep's V for every state (sweep 0's own init
    // values if this is sweep 0), used for the outcome labels.
    // colors: { state, action, best, result } - hex color strings. `state` fills both the state
    // node and every outcome node (outcomes ARE states); `action` fills non-best action nodes;
    // `best` highlights the best action's node/Q-label.
    // stateName: the state's display name (e.g. "S0") - drawn inside the state circle.
    draw(canvas, detail, priorValues, colors, stateName) {
        this._render(canvas, detail, priorValues, colors, stateName, Infinity);
    },

    // Same rendering, staged: reveals each action (with its own transitions) in order, then a
    // final best-action highlight pass, each stage separated by a short delay via setTimeout.
    // Returns a cancel() function - callers MUST invoke it before re-triggering an animation on
    // the same canvas (e.g. viStatesView.js's rebuildAll()), so an orphaned timer never draws onto
    // a canvas element that's already mid-replacement.
    drawAnimated(canvas, detail, priorValues, colors, stateName) {
        const events = this._buildRevealEvents(detail);
        let cancelled = false;
        const timers = [];

        const runStage = (stageIndex) => {
            if (cancelled) return;
            this._render(canvas, detail, priorValues, colors, stateName, stageIndex);
            if (stageIndex >= events.length) return;
            const evt = events[stageIndex];
            const delay = evt === 'best' ? VBD_REVEAL_BEST_MS
                : evt.type === 'action' ? VBD_REVEAL_ACTION_MS
                : VBD_REVEAL_TRANSITION_MS;
            timers.push(setTimeout(() => runStage(stageIndex + 1), delay));
        };
        runStage(0);

        return () => {
            cancelled = true;
            timers.forEach(clearTimeout);
        };
    },

    // Ordered reveal events: one 'action' event then N 'transition' events per action (in
    // detail.actions' own order), followed by a final 'best' marker for the highlight pass.
    _buildRevealEvents(detail) {
        const events = [];
        if (detail && detail.actions) {
            detail.actions.forEach(action => {
                events.push({ type: 'action', actionId: action.actionId });
                action.transitions.forEach(t => {
                    events.push({ type: 'transition', actionId: action.actionId, transition: t });
                });
            });
        }
        events.push('best');
        return events;
    },

    // revealCount: Infinity for the static draw() path; otherwise the number of _buildRevealEvents
    // entries revealed so far (0 = state only, events.length = everything incl. best-highlight).
    _render(canvas, detail, priorValues, colors, stateName, revealCount) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors);
            return;
        }

        const events = this._buildRevealEvents(detail);
        const bestRevealed = revealCount >= events.length;

        const stateX = VBD_PADDING + VBD_STATE_RADIUS;
        const stateY = h / 2;
        const actionX = w * 0.40;
        const transX = w * 0.68;

        const rows = [];
        detail.actions.forEach(action => action.transitions.forEach(t => rows.push({ action, transition: t })));
        const rowCount = Math.max(rows.length, 1);
        const rowH = (h - 2 * VBD_PADDING) / rowCount;

        let rowCursor = 0;
        const actionPositions = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            actionPositions.set(action.actionId, VBD_PADDING + (rowCursor + span / 2) * rowH);
            rowCursor += span;
        });

        // Walk events in the SAME order _buildRevealEvents() produced them, so `eventIdx`
        // matches exactly what drawAnimated()'s stage counter is counting.
        let eventIdx = 0;
        let rowIdx = 0;
        detail.actions.forEach(action => {
            const actionRevealed = eventIdx < revealCount;
            eventIdx += 1;
            const ay = actionPositions.get(action.actionId);
            const isBest = bestRevealed && action.actionId === detail.bestActionId;
            const fill = isBest ? colors.best : colors.action;

            if (actionRevealed) {
                ctx.strokeStyle = colors.action;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(stateX, stateY);
                ctx.lineTo(actionX, ay);
                ctx.stroke();

                this._circle(ctx, actionX, ay, VBD_ACTION_RADIUS, fill);
                this._label(ctx, actionX, ay, action.actionName, fill);

                ctx.fillStyle = isBest ? colors.best : colors.result;
                ctx.font = isBest ? 'bold 10px monospace' : '10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`,
                    actionX, ay - VBD_ACTION_RADIUS - 6);
            }

            action.transitions.forEach(t => {
                const transitionRevealed = eventIdx < revealCount;
                eventIdx += 1;
                const ty = VBD_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;
                if (!transitionRevealed) return;

                ctx.strokeStyle = colors.action;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(actionX, ay);
                ctx.lineTo(transX, ty);
                ctx.stroke();

                ctx.save();
                ctx.setLineDash([4, 3]);
                this._circle(ctx, transX, ty, VBD_ACTION_RADIUS, colors.state, true);
                ctx.restore();
                this._label(ctx, transX, ty, t.nextStateName, colors.state);

                ctx.fillStyle = colors.result;
                ctx.font = '10px monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                const priorV = priorValues[t.nextState] ?? 0;
                ctx.fillText(`V ${priorV.toFixed(2)}`, transX + VBD_ACTION_RADIUS + 6, ty);
            });
        });

        // State node drawn last so it's never occluded by a line's stroke join (cosmetic only) -
        // always revealed, since stage 0 (before any action) already shows just the state.
        this._circle(ctx, stateX, stateY, VBD_STATE_RADIUS, colors.state);
        this._label(ctx, stateX, stateY, stateName, colors.state);

        if (rows.length > 0) {
            ctx.fillStyle = colors.result;
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.globalAlpha = 0.6;
            ctx.fillText('t = k−1', transX, h - 6);
            ctx.globalAlpha = 1;
        }
    },

    _circle(ctx, x, y, r, fill, dashed = false) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill;
        ctx.fill();
        if (dashed) {
            ctx.strokeStyle = ColorUtils.contrastText(fill);
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    },

    _label(ctx, x, y, name, fill) {
        ctx.fillStyle = ColorUtils.contrastText(fill);
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y);
    },

    _drawEmpty(ctx, w, h, colors) {
        ctx.fillStyle = colors.action;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('no actions', w / 2, h / 2);
    }
};
