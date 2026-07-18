// src/main/view/helpers/viBackupDiagram.js
// Canvas2D renderer for a single state's backup diagram - state on the left, its actions in a
// middle column (Q-value label, best action highlighted/starred), each action's outcome
// next-states in a right column (one row per (action, transition) pair, NOT deduplicated by
// next-state). Node styling mirrors treeView.js's own _drawNode() convention exactly (circles,
// in-circle contrast-colored name labels, AppPalette.node.state/.node.action fill).
//
// The FULL tree (state, every action, every outcome, and every outcome's prior-sweep value) is
// always drawn immediately - drawAnimated() never adds or removes structure. What it stages
// instead is the actual Bellman backward pass: each outcome's prior value is shown as a small
// green, semi-transparent triangle (not a plain number) at rest; a fresh sweep's reveal picks one
// outcome at a time, tweens a traveling copy of that triangle backward along its edge into the
// action node, and only then reveals that action's Q. After every action's outcomes have moved
// back, a final stage highlights the best action - the same "backward induction" the equation
// pane's own Bellman-header conveys, applied here to the diagram itself.
//
// Deliberately NOT mathRenderer-based (its failure-fallback path calls p5 GLOBAL functions that
// always draw to the MAIN canvas regardless of which ctx is passed - a real mismatch for a
// per-card canvas). Labels are plain ctx.fillText() instead. Deliberately NOT TreeLayout.js-based -
// that solves a harder, general recursive-unrolling problem; this is exactly one level deep with a
// small bounded fan-out, so a fixed three-column layout is simpler and sufficient.
const VBD_PADDING = 10;
const VBD_STATE_RADIUS = 16;
const VBD_ACTION_RADIUS = 11;
const VBD_TRIANGLE_SIZE = 6;             // half-height of the green "prior value" triangle marker
const VBD_MOVE_TRANSITION_MS = 450;      // one outcome's value traveling back into its action
const VBD_MOVE_ACTIONDONE_MS = 150;      // pause once an action's Q is fully revealed
const VBD_MOVE_BEST_MS = 500;            // final best-action highlight pass
const VBD_TRIANGLE_COLOR = '#4CAF50';    // fixed green, independent of theme - marks "prior step"

const ViBackupDiagram = {
    // canvas: an HTMLCanvasElement, already sized (see viStatesView.js's _buildDiagramCard()).
    // detail: ValueIterationState.getBackupDetail()'s exact return shape.
    // priorValues: { [stateId]: number } - the PRIOR sweep's V for every state (sweep 0's own init
    // values if this is sweep 0), used for each outcome's green-triangle marker.
    // colors: { state, action, best, result } - hex color strings. `state` fills both the state
    // node and every outcome node (outcomes ARE states); `action` fills non-best action nodes;
    // `best` highlights the best action's node/Q-label.
    // stateName: the state's display name (e.g. "S0") - drawn inside the state circle.
    draw(canvas, detail, priorValues, colors, stateName) {
        const revealedActionIds = new Set();
        const arrivedKeys = new Set();
        let transitionIndex = 0;
        if (detail && detail.actions) {
            detail.actions.forEach(action => {
                revealedActionIds.add(action.actionId);
                action.transitions.forEach(() => {
                    arrivedKeys.add(transitionIndex);
                    transitionIndex += 1;
                });
            });
        }
        this._renderFrame(canvas, detail, priorValues, colors, stateName, {
            revealedActionIds, bestRevealed: true, activeMove: null, arrivedKeys
        });
    },

    // Animates the backward pass described above via requestAnimationFrame (not setTimeout - the
    // traveling triangle needs smooth per-frame interpolation, unlike the old discrete stage
    // reveal). Returns a cancel() function - callers MUST invoke it before re-triggering an
    // animation on the same canvas (e.g. viStatesView.js's rebuildAll()), so an orphaned frame
    // never draws onto a canvas element that's already mid-replacement.
    // speedScale: multiplies every base duration - 1 = this file's own base pacing, >1 slower, <1
    // faster. Callers pass the app's existing animation-speed slider value here (see
    // viStatesView.js's construction in main.js) so this reveal tracks the same global control
    // Play/Step/Skip's own sweep pacing already uses, instead of running at a fixed rate.
    // onComplete: called once, after the final best-highlight has rendered. Never called if
    // cancel() fires first.
    drawAnimated(canvas, detail, priorValues, colors, stateName, speedScale = 1, onComplete = () => {}) {
        const moves = this._buildMoves(detail);
        let cancelled = false;
        let rafId = null;
        const revealedActionIds = new Set();
        const arrivedKeys = new Set();
        let bestRevealed = false;
        let moveIndex = 0;
        let moveStartTime = null;

        const finishMove = (move) => {
            if (move.type === 'transition') {
                arrivedKeys.add(move.key);
            } else if (move.type === 'actionDone') {
                revealedActionIds.add(move.action.actionId);
            } else if (move.type === 'best') {
                bestRevealed = true;
            }
        };

        const tick = (now) => {
            if (cancelled) return;
            const move = moves[moveIndex];
            if (!move) {
                onComplete();
                return;
            }
            if (moveStartTime === null) moveStartTime = now;
            const duration = move.baseDuration * speedScale;
            const rawT = duration > 0 ? Math.min(1, (now - moveStartTime) / duration) : 1;
            const done = rawT >= 1;

            // Once a move is done, apply its effect (revealed/arrived/best) BEFORE this frame's
            // render, so the completing frame already shows the settled state - not one frame
            // behind it, which would otherwise skip straight to onComplete() without ever
            // painting the fully-resolved diagram.
            if (done) finishMove(move);

            const activeMove = (move.type === 'transition' && !done)
                ? { key: move.key, progress: EasingUtils.easeInOut(rawT) }
                : null;

            this._renderFrame(canvas, detail, priorValues, colors, stateName, {
                revealedActionIds, bestRevealed, activeMove, arrivedKeys
            });

            if (done) {
                moveIndex += 1;
                moveStartTime = null;
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return () => {
            cancelled = true;
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    },

    // Flat backward-pass timeline: one 'transition' move per (action, outcome) pair - keyed by
    // its flat index across the WHOLE diagram, not by (actionId, nextState), since a single
    // action can have two transitions to the same next state (this diagram never dedupes by
    // next-state - see the file header) - then one 'actionDone' move per action, then a final
    // 'best' move. _renderFrame() walks detail.actions/transitions in this exact same order to
    // recompute matching keys, so the two never drift apart.
    _buildMoves(detail) {
        const moves = [];
        if (detail && detail.actions) {
            let transitionIndex = 0;
            detail.actions.forEach(action => {
                action.transitions.forEach(t => {
                    moves.push({ type: 'transition', action, transition: t, key: transitionIndex, baseDuration: VBD_MOVE_TRANSITION_MS });
                    transitionIndex += 1;
                });
                moves.push({ type: 'actionDone', action, baseDuration: VBD_MOVE_ACTIONDONE_MS });
            });
        }
        moves.push({ type: 'best', baseDuration: VBD_MOVE_BEST_MS });
        return moves;
    },

    // state: { revealedActionIds: Set<actionId>, bestRevealed: bool, arrivedKeys: Set<transitionKey>,
    // activeMove: null | {key, progress} }. Always draws the full tree (state/actions/outcomes/
    // edges, every outcome's green prior-value triangle) regardless of state - only each action's
    // Q-value text, the best-action highlight, and which triangle is mid-flight are gated.
    // Stashes canvas._triangleHitRegions (recomputed every call) so viStatesView.js's hover
    // handler can hit-test the mouse against each outcome's triangle without this file owning any
    // DOM event wiring itself.
    _renderFrame(canvas, detail, priorValues, colors, stateName, state) {
        const { revealedActionIds, bestRevealed, activeMove, arrivedKeys } = state;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        canvas._triangleHitRegions = [];

        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors);
            return;
        }

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

        let rowIdx = 0;
        let transitionIndex = 0;
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const isBest = bestRevealed && action.actionId === detail.bestActionId;
            const fill = isBest ? colors.best : colors.action;

            ctx.strokeStyle = colors.action;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(stateX, stateY);
            ctx.lineTo(actionX, ay);
            ctx.stroke();

            this._circle(ctx, actionX, ay, VBD_ACTION_RADIUS, fill);
            this._label(ctx, actionX, ay, action.actionName, fill);

            if (revealedActionIds.has(action.actionId)) {
                ctx.fillStyle = isBest ? colors.best : colors.result;
                ctx.font = isBest ? 'bold 10px monospace' : '10px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`,
                    actionX, ay - VBD_ACTION_RADIUS - 6);
            }

            action.transitions.forEach(t => {
                const ty = VBD_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;
                const key = transitionIndex;
                transitionIndex += 1;

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

                const isActive = !!(activeMove && activeMove.key === key);
                const hasArrived = arrivedKeys.has(key);
                const priorV = priorValues[t.nextState] ?? 0;
                const anchorX = transX + VBD_ACTION_RADIUS + 6;
                this._drawPriorValueTriangle(ctx, anchorX, ty, priorV, { highlighted: isActive, dimmed: hasArrived && !isActive });
                canvas._triangleHitRegions.push({ x: anchorX - 2, y: ty - 10, w: 58, h: 20, nextStateId: t.nextState });

                if (isActive) {
                    // Traveling copy: tweens from the outcome's own triangle position backward
                    // along the edge toward the action node it's contributing to.
                    const px = anchorX + (actionX - anchorX) * activeMove.progress;
                    const py = ty + (ay - ty) * activeMove.progress;
                    this._drawPriorValueTriangle(ctx, px, py, priorV, { highlighted: true, dimmed: false });
                }
            });
        });

        // State node drawn last so it's never occluded by a line's stroke join (cosmetic only).
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

    // A small left-pointing green triangle (apex toward the node it feeds into) plus its numeric
    // value, both at the same faded alpha - together they represent "a value carried over from
    // the prior sweep," as opposed to a freshly-computed Q/V. highlighted (mid-flight or hovered)
    // draws near-opaque; dimmed (already arrived at its action) fades further than the resting
    // state, so a completed action's contributions read as settled rather than still pending.
    _drawPriorValueTriangle(ctx, x, y, value, opts = {}) {
        const { highlighted = false, dimmed = false } = opts;
        const alpha = highlighted ? 1 : dimmed ? 0.22 : 0.55;
        const s = VBD_TRIANGLE_SIZE;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = VBD_TRIANGLE_COLOR;
        ctx.beginPath();
        ctx.moveTo(x - s, y);
        ctx.lineTo(x + s * 0.7, y - s);
        ctx.lineTo(x + s * 0.7, y + s);
        ctx.closePath();
        ctx.fill();

        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toFixed(2), x + s * 0.7 + 4, y);
        ctx.restore();
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
