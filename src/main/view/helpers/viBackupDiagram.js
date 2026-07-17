// Static Canvas2D renderer for a single state's backup diagram (Phase 3b follow-on) - state on
// the left, its actions in a middle column (each with a Q-value label, best action highlighted/
// starred), each action's outcome next-states in a right column (one row per (action,
// transition) pair, NOT deduplicated by next-state - the same next-state reached by two
// different actions is two genuinely different transitions worth showing separately).
//
// Deliberately NOT mathRenderer-based (see the design spec's own note: mathRenderer.draw()'s
// failure-fallback path calls p5 GLOBAL functions that always draw to the MAIN canvas
// regardless of which ctx is passed - a real mismatch for a per-card canvas). Labels are plain
// ctx.fillText() instead. Deliberately NOT TreeLayout.js-based - that solves a harder, general
// recursive-unrolling problem; this is exactly one level deep with a small bounded fan-out, so a
// fixed three-column layout is simpler and sufficient.
const ViBackupDiagram = {
    // canvas: an HTMLCanvasElement, already sized (width/height set by the caller to match its
    // CSS display size, including devicePixelRatio scaling - see viStatesView.js's _buildCard()
    // for how this is set up).
    // detail: { actions: [{ actionId, actionName, qValue, transitions: [{ nextState,
    //   nextStateName, probability, reward, nextValue, term }] }], bestActionId, value } - the
    // exact shape ValueIterationState.getBackupDetail() already returns.
    // priorValues: { [stateId]: number } - the PRIOR sweep's V for every state (sweep 0's own
    // init values if this is sweep 0), used for the next-state labels.
    // colors: { action, best, result } - hex color strings.
    draw(canvas, detail, priorValues, colors) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors);
            return;
        }

        const PADDING = 8;
        const stateX = PADDING + 14;
        const stateY = h / 2;
        const actionX = w * 0.42;
        const transX = w - PADDING - 14;

        // Flatten (action, transition) pairs in order - this is the right column's row list.
        const rows = [];
        detail.actions.forEach(action => {
            action.transitions.forEach(t => rows.push({ action, transition: t }));
        });
        const rowCount = Math.max(rows.length, 1);
        const rowH = (h - 2 * PADDING) / rowCount;

        // Action column: one row per action, vertically centered within its own transitions'
        // combined span (so the state->action line points at the visual middle of that action's
        // fanned-out transitions, matching the reference layout).
        let rowCursor = 0;
        const actionPositions = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            const centerRow = rowCursor + span / 2;
            actionPositions.set(action.actionId, PADDING + centerRow * rowH);
            rowCursor += span;
        });

        ctx.strokeStyle = colors.action;
        ctx.lineWidth = 1;
        ctx.font = '11px monospace';
        ctx.textBaseline = 'middle';

        // Lines: state -> each action; each action -> its own transition rows.
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            ctx.beginPath();
            ctx.moveTo(stateX, stateY);
            ctx.lineTo(actionX, ay);
            ctx.stroke();
        });
        rows.forEach((row, i) => {
            const ay = actionPositions.get(row.action.actionId);
            const ty = PADDING + (i + 0.5) * rowH;
            ctx.beginPath();
            ctx.moveTo(actionX, ay);
            ctx.lineTo(transX, ty);
            ctx.stroke();
        });

        // State node + V label.
        this._circle(ctx, stateX, stateY, 14, colors.action);
        ctx.fillStyle = colors.result;
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`V = ${detail.value.toFixed(2)}`, PADDING, PADDING - 2);

        // Action nodes + Q labels (best action highlighted + starred).
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const isBest = action.actionId === detail.bestActionId;
            this._circle(ctx, actionX, ay, 10, isBest ? colors.best : colors.action);
            ctx.fillStyle = isBest ? colors.best : colors.action;
            ctx.font = isBest ? 'bold 11px monospace' : '11px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`, actionX, ay - 16);
        });

        // Next-state nodes + their prior-sweep V.
        rows.forEach((row, i) => {
            const ty = PADDING + (i + 0.5) * rowH;
            this._circle(ctx, transX, ty, 10, colors.action);
            ctx.fillStyle = colors.result;
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            const priorV = priorValues[row.transition.nextState] ?? 0;
            ctx.fillText(`${row.transition.nextStateName} V ${priorV.toFixed(2)}`, transX + 14, ty);
        });
    },

    _circle(ctx, x, y, r, color) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    },

    _drawEmpty(ctx, w, h, colors) {
        ctx.fillStyle = colors.action;
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('no actions', w / 2, h / 2);
    }
};
