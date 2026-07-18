// src/main/view/helpers/viBackupDiagram.js
// Canvas2D renderer for a single state's backup diagram - state on the left, its actions in a
// middle column (Q-value label, best action highlighted/starred), each action's outcome
// next-states in a right column (one row per (action, transition) pair, NOT deduplicated by
// next-state). Node styling mirrors treeView.js's own _drawNode() convention exactly (circles,
// in-circle contrast-colored name labels, AppPalette.node.state/.node.action fill).
//
// The FULL tree (state, every action, every outcome, and every outcome's prior-sweep value) is
// always drawn immediately - drawAnimated() never adds or removes structure, and drawSkeleton()
// lets a caller show that same full tree, fully at rest, for a card that hasn't had its own turn
// yet (see viStatesView.js's _renderCards()). What actually stages in over time is the real
// Bellman arithmetic for one transition at a time: highlight the outcome's prior-sweep value
// (also telling the caller which state that came from, via onHighlightPrior, so it can flash the
// matching card back in that older sweep) -> travel that value into this diagram's workspace ->
// reveal the reward -> add them together -> reveal the probability and multiply -> repeat for the
// next transition. Only once every transition for an action has landed does that action's Q
// reveal; only once every action is done does the best one highlight - the same "backward
// induction" the equation pane's own Bellman header conveys, applied here to the diagram itself.
//
// Deliberately NOT mathRenderer-based (its failure-fallback path calls p5 GLOBAL functions that
// always draw to the MAIN canvas regardless of which ctx is passed - a real mismatch for a
// per-card canvas). Labels are plain ctx.fillText() instead. Deliberately NOT TreeLayout.js-based -
// that solves a harder, general recursive-unrolling problem; this is exactly one level deep with a
// small bounded fan-out, so a fixed three-column layout is simpler and sufficient.
const VBD_PADDING = 14;
const VBD_STATE_RADIUS = 22;
const VBD_ACTION_RADIUS = 16;
const VBD_TRIANGLE_SIZE = 8;              // half-height of the green "prior value" triangle marker
const VBD_PHASE_HIGHLIGHT_MS = 350;       // highlight the outcome's prior value (+ its own card, cross-section)
const VBD_PHASE_TRAVEL_MS = 500;          // that value travels into this diagram's workspace
const VBD_PHASE_REWARD_MS = 350;          // reveal the transition's reward next to it
const VBD_PHASE_ADD_MS = 400;             // combine value + reward into one sum
const VBD_PHASE_MULTIPLY_MS = 550;        // reveal the probability, then multiply into the final term
const VBD_MOVE_ACTIONDONE_MS = 200;       // pause once an action's Q is fully revealed
const VBD_MOVE_BEST_MS = 550;             // final best-action highlight pass
const VBD_TRIANGLE_COLOR = '#4CAF50';     // fixed green, independent of theme - marks "prior step"

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
        this._renderFrame(canvas, detail, priorValues, colors, stateName, this._settledState(detail));
    },

    // Full tree, fully at rest (nothing revealed, nothing arrived) - for a card that's visible
    // but hasn't reached its own turn in the sequential per-state reveal yet. Distinct from
    // draw() (fully RESOLVED) - this is fully UNRESOLVED, the true "frame 0" of drawAnimated().
    drawSkeleton(canvas, detail, priorValues, colors, stateName) {
        this._renderFrame(canvas, detail, priorValues, colors, stateName, {
            revealedActionIds: new Set(), bestRevealed: false, activeMove: null, arrivedKeys: new Set()
        });
    },

    // Animates the real Bellman arithmetic described in the file header, via requestAnimationFrame
    // (smooth tweening/fading, not discrete setTimeout stage counts). Returns a cancel() function -
    // callers MUST invoke it before re-triggering an animation on the same canvas (e.g.
    // viStatesView.js's rebuildAll()), so an orphaned frame never draws onto a canvas element
    // that's already mid-replacement.
    // gamma: the discount factor, needed to show the same "reward + gamma*V" sum the domain
    // itself computes (ValueIterationState.gamma) - kept as an explicit param rather than baked
    // into `detail` so this file never has to reach back into domain state on its own.
    // speedScale: multiplies every base duration - 1 = this file's own base pacing, >1 slower, <1
    // faster. Callers pass the app's existing animation-speed slider value here (see
    // viStatesView.js's construction in main.js) so this reveal tracks the same global control
    // Play/Step/Skip's own sweep pacing already uses, instead of running at a fixed rate.
    // onHighlightPrior(nextStateId): called once per transition, right as its highlight phase
    // begins - lets the caller flash that SAME state's card back in the prior sweep's section
    // (this diagram only knows its own canvas, not the rest of the page).
    // onComplete: called once, after the final best-highlight has rendered. Never called if
    // cancel() fires first.
    drawAnimated(canvas, detail, priorValues, colors, stateName, gamma, speedScale = 1, onHighlightPrior = () => {}, onComplete = () => {}) {
        const moves = this._buildMoves(detail);
        let cancelled = false;
        let rafId = null;
        const revealedActionIds = new Set();
        const arrivedKeys = new Set();
        let bestRevealed = false;
        let moveIndex = 0;
        let moveStartTime = null;
        let firedHighlightForMoveIndex = -1;

        const finishMove = (move) => {
            if (move.type === 'multiply') {
                arrivedKeys.add(move.key);
            } else if (move.type === 'actionDone') {
                revealedActionIds.add(move.action.actionId);
            } else if (move.type === 'best') {
                bestRevealed = true;
            }
        };

        const TRANSITION_PHASES = new Set(['highlight', 'travel', 'reward', 'add', 'multiply']);

        const tick = (now) => {
            if (cancelled) return;
            const move = moves[moveIndex];
            if (!move) {
                onComplete();
                return;
            }
            if (moveStartTime === null) moveStartTime = now;
            if (move.type === 'highlight' && firedHighlightForMoveIndex !== moveIndex) {
                firedHighlightForMoveIndex = moveIndex;
                onHighlightPrior(move.transition.nextState);
            }
            const duration = move.baseDuration * speedScale;
            const rawT = duration > 0 ? Math.min(1, (now - moveStartTime) / duration) : 1;
            const done = rawT >= 1;

            // Once a move is done, apply its effect (revealed/arrived/best) BEFORE this frame's
            // render, so the completing frame already shows the settled state - not one frame
            // behind it, which would otherwise skip straight to the next move without ever
            // painting the fully-resolved intermediate state.
            if (done) finishMove(move);

            const activeMove = TRANSITION_PHASES.has(move.type)
                ? { key: move.key, phase: move.type, progress: EasingUtils.easeInOut(rawT), gamma }
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

    // Flat timeline: 5 phases per (action, transition) pair - keyed by the transition's flat
    // index across the WHOLE diagram, not by (actionId, nextState), since a single action can
    // have two transitions to the same next state (this diagram never dedupes by next-state -
    // see the file header) - then one 'actionDone' move per action, then a final 'best' move.
    // _renderFrame() walks detail.actions/transitions in this exact same order to recompute
    // matching keys, so the two never drift apart.
    _buildMoves(detail) {
        const moves = [];
        if (detail && detail.actions) {
            let transitionIndex = 0;
            detail.actions.forEach(action => {
                action.transitions.forEach(t => {
                    const key = transitionIndex;
                    moves.push({ type: 'highlight', action, transition: t, key, baseDuration: VBD_PHASE_HIGHLIGHT_MS });
                    moves.push({ type: 'travel', action, transition: t, key, baseDuration: VBD_PHASE_TRAVEL_MS });
                    moves.push({ type: 'reward', action, transition: t, key, baseDuration: VBD_PHASE_REWARD_MS });
                    moves.push({ type: 'add', action, transition: t, key, baseDuration: VBD_PHASE_ADD_MS });
                    moves.push({ type: 'multiply', action, transition: t, key, baseDuration: VBD_PHASE_MULTIPLY_MS });
                    transitionIndex += 1;
                });
                moves.push({ type: 'actionDone', action, baseDuration: VBD_MOVE_ACTIONDONE_MS });
            });
        }
        moves.push({ type: 'best', baseDuration: VBD_MOVE_BEST_MS });
        return moves;
    },

    // The fully-resolved state draw()/a just-completed drawAnimated() both end up in - every
    // action revealed, every transition arrived, best highlighted.
    _settledState(detail) {
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
        return { revealedActionIds, bestRevealed: true, activeMove: null, arrivedKeys };
    },

    // state: { revealedActionIds: Set<actionId>, bestRevealed: bool, arrivedKeys: Set<transitionKey>,
    // activeMove: null | {key, phase, progress, gamma} }. Always draws the full tree (state/
    // actions/outcomes/edges, every outcome's green prior-value triangle) regardless of state -
    // only each action's Q-value text, the best-action highlight, and the active transition's
    // workspace arithmetic are gated. Stashes canvas._triangleHitRegions (recomputed every call)
    // so viStatesView.js's hover handler can hit-test the mouse against each outcome's triangle
    // without this file owning any DOM event wiring itself.
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
        const transX = w * 0.70;

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
            const workspaceY = ay - VBD_ACTION_RADIUS - 8;

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
                ctx.font = isBest ? 'bold 12px monospace' : '12px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`, actionX, workspaceY - 4);
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
                const phase = isActive ? activeMove.phase : null;
                const hasArrived = arrivedKeys.has(key);
                const priorV = priorValues[t.nextState] ?? 0;
                const anchorX = transX + VBD_ACTION_RADIUS + 8;
                // The resting triangle itself pulses bright during 'highlight', fades away once
                // it starts traveling (the traveling copy below takes over from there), and
                // settles to a dimmed "already contributed" look once arrived.
                const restingHighlighted = phase === 'highlight';
                const restingHidden = isActive && phase !== 'highlight';
                if (!restingHidden) {
                    this._drawPriorValueTriangle(ctx, anchorX, ty, priorV, {
                        highlighted: restingHighlighted, dimmed: hasArrived && !isActive
                    });
                }
                canvas._triangleHitRegions.push({ x: anchorX - 2, y: ty - 10, w: 66, h: 20, nextStateId: t.nextState });

                if (isActive) {
                    this._renderActiveTransition(ctx, {
                        anchorX, ty, actionX, workspaceY, priorV, transition: t, phase,
                        progress: activeMove.progress, gamma: activeMove.gamma
                    });
                }
            });
        });

        // State node drawn last so it's never occluded by a line's stroke join (cosmetic only).
        this._circle(ctx, stateX, stateY, VBD_STATE_RADIUS, colors.state);
        this._label(ctx, stateX, stateY, stateName, colors.state);

        if (rows.length > 0) {
            ctx.fillStyle = colors.result;
            ctx.font = '10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.globalAlpha = 0.6;
            ctx.fillText('t = k−1', transX, h - 8);
            ctx.globalAlpha = 1;
        }
    },

    // Draws whichever visual belongs to the currently-active transition's own phase, in the
    // action's small workspace area just above its node - the real arithmetic the file header
    // describes: value travels in, reward joins it, they add into a sum, probability joins that,
    // and it all resolves into the final per-transition term (matches t.term exactly, the same
    // number the domain itself already computed). Deliberately a SINGLE text line (not several
    // stacked ones) that changes content as the phase advances - the action node's own radius
    // doesn't leave enough clearance above it for multiple stacked lines without overlapping the
    // node itself, and a single evolving line reads just as clearly as a growing list would.
    _renderActiveTransition(ctx, { anchorX, ty, actionX, workspaceY, priorV, transition, phase, progress, gamma }) {
        const sum = transition.reward + gamma * priorV;

        if (phase === 'travel') {
            const px = anchorX + (actionX - anchorX) * progress;
            const py = ty + (workspaceY - ty) * progress;
            this._drawPriorValueTriangle(ctx, px, py, priorV, { highlighted: true, dimmed: false });
            return;
        }

        let text;
        if (phase === 'reward') {
            text = `${priorV.toFixed(2)} + R:${transition.reward.toFixed(2)}`;
        } else if (phase === 'add') {
            // Switches from "value + reward" to their sum partway through - "add the two"
            // reading as one number replacing two, not two numbers lingering forever.
            text = progress < 0.5
                ? `${priorV.toFixed(2)} + R:${transition.reward.toFixed(2)}`
                : `Σ:${sum.toFixed(2)}`;
        } else if (phase === 'multiply') {
            // First half: the settled sum alongside the newly-revealed probability. Second half:
            // both resolve into the final per-transition term.
            text = progress < 0.5
                ? `Σ:${sum.toFixed(2)} × P:${transition.probability.toFixed(2)}`
                : `= ${transition.term.toFixed(2)}`;
        }
        if (text) this._workspaceText(ctx, actionX, workspaceY, text, 1, true, true);
    },

    _workspaceText(ctx, x, y, text, alpha, small = false, bold = false) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = VBD_TRIANGLE_COLOR;
        ctx.font = `${bold ? 'bold ' : ''}${small ? 9 : 11}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
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

        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toFixed(2), x + s * 0.7 + 5, y);
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
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y);
    },

    _drawEmpty(ctx, w, h, colors) {
        ctx.fillStyle = colors.action;
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('no actions', w / 2, h / 2);
    }
};
