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
// reveal the reward ABOVE its own action->outcome edge (it stays there permanently, never
// traveling elsewhere) -> highlight the edges, which then STAY highlighted through the rest of
// this transition's own phases -> add the value and reward together (shown at that same
// above-edge spot - the value's own workspace display folds into it) -> reveal the probability ->
// multiply into the final term - repeat for the next transition. Only once every transition for
// an action has landed does that action's Q reveal; only once every action is done does the best
// one highlight - the same "backward induction" the equation pane's own Bellman header conveys,
// applied here to the diagram itself. An outcome's green triangle marker is invisible until that
// specific transition's own turn arrives (never shown pre-emptively for a transition still
// waiting its turn), and each transition's fully-computed term stays visible above its own
// action->outcome edge once it has landed - the exact same spot its own arithmetic already
// occupied while animating, so there's no visual jump into place.
//
// Deliberately NOT mathRenderer-based (its failure-fallback path calls p5 GLOBAL functions that
// always draw to the MAIN canvas regardless of which ctx is passed - a real mismatch for a
// per-card canvas). Labels are plain ctx.fillText() instead. Deliberately NOT TreeLayout.js-based -
// that solves a harder, general recursive-unrolling problem; this is exactly one level deep with a
// small bounded fan-out, so a fixed three-column layout is simpler and sufficient.
const VBD_PADDING = 20;
const VBD_STATE_RADIUS = 31;
const VBD_ACTION_RADIUS = 22;
const VBD_TRIANGLE_SIZE = 16;              // half-height of the green "prior value" triangle marker
const VBD_PHASE_HIGHLIGHT_MS = 350;       // highlight the outcome's prior value (+ its own card, cross-section)
const VBD_PHASE_FLYIN_MS = 550;           // the value flies from its real prior card to this diagram's triangle anchor
const VBD_PHASE_TRAVEL_MS = 300;          // the remaining short hop: triangle anchor into this diagram's workspace
const VBD_PHASE_REWARD_REVEAL_MS = 300;   // reward fades in above its own edge - it stays there from here on
const VBD_PHASE_EDGE_HIGHLIGHT_MS = 300;  // dedicated beat: edges switch to highlighted, then stay that way
const VBD_PHASE_ADD_MS = 400;             // combine value + reward into one sum
const VBD_PHASE_PROB_REVEAL_MS = 300;     // probability fades in below the settled sum
const VBD_PHASE_MULTIPLY_MS = 550;        // multiply the sum by the (already-revealed) probability into the final term
const VBD_MOVE_ACTIONDONE_MS = 200;       // pause once an action's Q is fully revealed
const VBD_MOVE_BEST_MS = 550;             // final best-action highlight pass
const VBD_TRIANGLE_COLOR = '#4CAF50';     // fixed green, independent of theme - marks "prior step"
// The state->action/action->outcome edges switch to colors.highlighted starting at 'edgeHighlight'
// and STAY that way through every remaining phase of the transition (add/probReveal/multiply) -
// referenced from both drawAnimated()'s tick() (which builds activeMove.phase) and _renderFrame()
// (which reads it for edge coloring), so it lives at module scope rather than inside either
// method's own closure.
const EDGE_HIGHLIGHT_PHASES = new Set(['edgeHighlight', 'add', 'probReveal', 'multiply']);
// Same font family Build mode's own canvas text uses (mainView.js's global textFont(Typography.
// sans()), IBM Plex Sans, registered as a CSS @font-face in style.css) - a plain font-family
// string since this file draws via raw ctx.font, not p5's textFont()/Typography's p5.Font object.
const VBD_FONT_FAMILY = '"IBM Plex Sans", Calibri, "Segoe UI", Tahoma, sans-serif';

// Native (Canvas2D-drawable) image cache, keyed by URL - shared across every diagram instance
// since the same state/action photo commonly reappears across many sweeps/cards. Deliberately a
// SEPARATE cache from mainView.js's/treeView.js's own node._imageObj (a p5.Image, only drawable
// via p5's global image()/loadImage(), which always targets p5's own default canvas - a real
// mismatch for this file's own per-card <canvas> + raw ctx.drawImage()). onImageLoaded (below) is
// one single, stable subscriber - not re-registered per render call - so a slow-loading image
// doesn't accumulate listeners across 60fps animation frames.
const _imageCache = new Map();
let _onImageLoaded = null;

const ViBackupDiagram = {
    // Registers a single callback fired once, after any image this file loads finishes decoding -
    // lets the caller repaint whichever already-drawn (non-animating) cards might now have a
    // photo available that wasn't ready at their last paint. Animating cards need no such hook -
    // they already repaint every rAF frame and pick up a freshly-loaded image on their very next
    // frame for free.
    setOnImageLoaded(fn) {
        _onImageLoaded = fn;
    },

    // canvas: an HTMLCanvasElement, already sized (see viStatesView.js's _buildDiagramCard()).
    // detail: ValueIterationState.getBackupDetail()'s exact return shape.
    // priorValues: { [stateId]: number } - the PRIOR sweep's V for every state (sweep 0's own init
    // values if this is sweep 0), used for each outcome's green-triangle marker.
    // colors: { state, action, best, result, highlighted } - hex color strings. `state` fills both
    // the state node and every outcome node (outcomes ARE states); `action` fills non-best action
    // nodes; `best` highlights the best action's node/Q-label; `highlighted` (AppPalette.edge's own
    // "active" color, the same one Graph/Tree view's simulation reveal uses) marks whichever
    // state->action/action->outcome edge is currently mid-arithmetic.
    // stateName: the state's display name (e.g. "S0") - drawn inside the state circle.
    // stateId: the state's real node id - looked up (with every action/outcome id) against
    // `images` to draw an uploaded photo instead of a plain label, mirroring mainView.js's/
    // treeView.js's own node-image convention.
    // images: { [nodeId]: string|null } - plain image URLs (or null/absent), precomputed once by
    // viStatesView.js's _buildDiagramCard() - this file only resolves/caches/draws them, it never
    // reaches into graph/domain state on its own (same reasoning as the `gamma` param below).
    draw(canvas, detail, priorValues, colors, stateName, stateId, images = {}) {
        this._renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, this._settledState(detail));
    },

    // Full tree, fully at rest (nothing revealed, nothing arrived) - for a card that's visible
    // but hasn't reached its own turn in the sequential per-state reveal yet. Distinct from
    // draw() (fully RESOLVED) - this is fully UNRESOLVED, the true "frame 0" of drawAnimated().
    drawSkeleton(canvas, detail, priorValues, colors, stateName, stateId, images = {}) {
        this._renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, {
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
    // getSpeedScale: () => number, multiplies every base duration - 1 = this file's own base
    // pacing, >1 slower, <1 faster. A LIVE callback (not a snapshotted number) re-read every
    // frame, so moving the app's existing animation-speed slider takes effect immediately on
    // whatever's currently animating, not just on the next reveal - see viStatesView.js's
    // construction in main.js for where this tracks the same global control Play/Step/Skip's own
    // sweep pacing already uses.
    // getStepMode: () => boolean, a LIVE callback (same "read fresh every frame" convention as
    // getSpeedScale) - when true, the engine auto-pauses itself the instant each move completes
    // instead of chaining into the next one, so an external caller can single-step through the
    // reveal one move at a time (Step). Read fresh at the moment each move finishes (not
    // snapshotted), so a caller can flip it off mid-reveal - e.g. "Find Optimal" taking over a
    // Step-paused reveal - and playback continues seamlessly into the next move rather than
    // re-pausing, with no special-casing needed here.
    // onHighlightPrior(nextStateId): called once per transition, right as its highlight phase
    // begins - lets the caller flash that SAME state's card back in the prior sweep's section
    // (this diagram only knows its own canvas, not the rest of the page).
    // onFlyValue({nextStateId, canvasX, canvasY, durationMs}): called once per transition, right
    // as its flyIn phase begins - canvasX/canvasY is this diagram's own triangle anchor point for
    // that transition (canvas-space), durationMs is the phase's own already-speed-scaled
    // duration. Lets the caller fly a DOM chip from the real prior card over to arrive exactly
    // here (this diagram only knows its own canvas, not the rest of the page, and doesn't know the
    // prior value's own numeric value - the caller already has it via its own priorValues).
    // onStepPause: called once each time getStepMode() causes the engine to auto-pause after a
    // move (never called for the final move - that always goes straight to onComplete instead,
    // regardless of step mode, so finishing a state's reveal never needs an extra "confirm done"
    // step). Lets the caller keep its own paused/enablement bookkeeping in sync.
    // onComplete: called once, after the final best-highlight has rendered. Never called if
    // cancel() fires first.
    drawAnimated(canvas, detail, priorValues, colors, stateName, stateId, images = {}, gamma, getSpeedScale = () => 1, getStepMode = () => false, onHighlightPrior = () => {}, onFlyValue = () => {}, onStepPause = () => {}, onComplete = () => {}) {
        const moves = this._buildMoves(detail);
        let cancelled = false;
        let paused = false;
        let rafId = null;
        const revealedActionIds = new Set();
        const arrivedKeys = new Set();
        let bestRevealed = false;
        let moveIndex = 0;
        let moveStartTime = null;
        // Tracks the most recent rAF timestamp seen by tick() - pause() uses it to compute how
        // far into the current move we'd progressed, since pause() itself is triggered by an
        // external event (a user click), not from within a rAF frame.
        let lastNow = performance.now();
        let pausedElapsed = 0;
        let firedHighlightForMoveIndex = -1;
        let firedFlyForMoveIndex = -1;
        // The speed scale in effect for the CURRENT move, as of the last frame - compared against
        // a fresh read every frame so a mid-move slider change is detected and rebased (see
        // tick()) instead of silently ignored until the next move/reveal starts.
        let lastSpeedScale = null;

        const finishMove = (move) => {
            if (move.type === 'multiply') {
                arrivedKeys.add(move.key);
            } else if (move.type === 'actionDone') {
                revealedActionIds.add(move.action.actionId);
            } else if (move.type === 'best') {
                bestRevealed = true;
            }
        };

        // Drives the workspace-arithmetic rendering (_renderActiveTransition, edge coloring) -
        // deliberately excludes 'flyIn' (a DOM chip is carrying the value across the page during
        // that window; nothing local to render for it).
        const TRANSITION_PHASES = new Set(['highlight', 'travel', 'rewardReveal', 'edgeHighlight', 'add', 'probReveal', 'multiply']);

        const tick = (now) => {
            if (cancelled || paused) return;
            lastNow = now;
            const move = moves[moveIndex];
            if (!move) {
                onComplete();
                return;
            }
            if (moveStartTime === null) { moveStartTime = now; lastSpeedScale = getSpeedScale(); }
            if (move.type === 'highlight' && firedHighlightForMoveIndex !== moveIndex) {
                firedHighlightForMoveIndex = moveIndex;
                onHighlightPrior(move.transition.nextState);
            }
            if (move.type === 'flyIn' && firedFlyForMoveIndex !== moveIndex) {
                firedFlyForMoveIndex = moveIndex;
                const region = (canvas._triangleHitRegions || []).find(r => r.key === move.key);
                if (region) {
                    onFlyValue({
                        nextStateId: move.transition.nextState,
                        canvasX: region.anchorX,
                        canvasY: region.ty,
                        durationMs: move.baseDuration * getSpeedScale()
                    });
                }
            }
            // Re-read every frame (not just once per move) so a mid-move slider change takes
            // effect immediately. If it changed since the last frame, rebase moveStartTime so the
            // CURRENT progress carries over continuously under the new rate instead of jumping -
            // the exact same "rebase the recorded start time" trick pause()/resume() already use.
            const liveSpeedScale = getSpeedScale();
            if (liveSpeedScale !== lastSpeedScale) {
                const oldDuration = move.baseDuration * lastSpeedScale;
                const rawTSoFar = oldDuration > 0 ? Math.min(1, (now - moveStartTime) / oldDuration) : 1;
                const newDuration = move.baseDuration * liveSpeedScale;
                moveStartTime = now - rawTSoFar * newDuration;
                lastSpeedScale = liveSpeedScale;
            }
            const duration = move.baseDuration * liveSpeedScale;
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
            // Tracks "is this transition currently being processed at all," independent of
            // TRANSITION_PHASES gating (unlike activeMove, this stays set through 'flyIn' too) -
            // lets the resting-triangle visibility logic distinguish "not yet its turn" (hidden)
            // from "already had its turn" (shown dimmed), without being fooled by the flyIn gap.
            const activeKey = move.key !== undefined ? move.key : null;
            const activeRawPhase = activeKey !== null ? move.type : null;

            this._renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, {
                revealedActionIds, bestRevealed, activeMove, arrivedKeys, activeKey, activeRawPhase
            });

            if (done) {
                moveIndex += 1;
                moveStartTime = null;
                if (moveIndex >= moves.length) {
                    // The very last move (best) finishing always concludes immediately,
                    // regardless of step mode - a state's reveal being "done" is never itself a
                    // steppable beat, so this never needs an extra "confirm done" click.
                    onComplete();
                    return;
                }
                if (getStepMode()) {
                    // Auto-pause exactly like a manual Pause click would - moveStartTime is
                    // already null (the next move hasn't started), so pausedElapsed is 0 and a
                    // later resume() (Step advancing one more beat, or "Find Optimal" taking over)
                    // starts that next move fresh, from progress 0.
                    paused = true;
                    pausedElapsed = 0;
                    rafId = null;
                    onStepPause();
                    return;
                }
            }
            rafId = requestAnimationFrame(tick);
        };
        rafId = requestAnimationFrame(tick);

        return {
            cancel: () => {
                cancelled = true;
                if (rafId !== null) cancelAnimationFrame(rafId);
            },
            // Stops the rAF schedule without losing position - the canvas simply keeps showing
            // whatever _renderFrame() last painted (true visual freeze), and moveIndex/
            // revealedActionIds/arrivedKeys/bestRevealed all stay exactly as they were.
            pause: () => {
                if (paused || cancelled) return;
                paused = true;
                if (rafId !== null) cancelAnimationFrame(rafId);
                rafId = null;
                pausedElapsed = moveStartTime === null ? 0 : (lastNow - moveStartTime);
            },
            // Rebases moveStartTime relative to the resuming frame's own timestamp BEFORE
            // calling tick(), so the very next progress calculation reproduces pausedElapsed
            // exactly instead of jumping ahead by however long the pause itself lasted.
            resume: () => {
                if (!paused || cancelled) return;
                paused = false;
                rafId = requestAnimationFrame((now) => {
                    moveStartTime = now - pausedElapsed;
                    tick(now);
                });
            }
        };
    },

    // Flat timeline: 8 phases per (action, transition) pair - keyed by the transition's flat
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
                    moves.push({ type: 'flyIn', action, transition: t, key, baseDuration: VBD_PHASE_FLYIN_MS });
                    moves.push({ type: 'travel', action, transition: t, key, baseDuration: VBD_PHASE_TRAVEL_MS });
                    moves.push({ type: 'rewardReveal', action, transition: t, key, baseDuration: VBD_PHASE_REWARD_REVEAL_MS });
                    moves.push({ type: 'edgeHighlight', action, transition: t, key, baseDuration: VBD_PHASE_EDGE_HIGHLIGHT_MS });
                    moves.push({ type: 'add', action, transition: t, key, baseDuration: VBD_PHASE_ADD_MS });
                    moves.push({ type: 'probReveal', action, transition: t, key, baseDuration: VBD_PHASE_PROB_REVEAL_MS });
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
    // activeMove: null | {key, phase, progress, gamma}, activeKey: null | number,
    // activeRawPhase: null | string }. Always draws the full tree (state/actions/outcomes/edges)
    // regardless of state - only each action's Q-value text, the best-action highlight, each
    // outcome's green prior-value triangle, and the active transition's workspace arithmetic are
    // gated. activeKey/activeRawPhase track "is this transition currently being processed at all"
    // independent of activeMove's TRANSITION_PHASES gating (activeMove is null during 'flyIn';
    // activeKey/activeRawPhase are not) - callers that don't supply them (draw()/drawSkeleton(),
    // via _settledState()) default to null, which is correct there since every key is either fully
    // arrived or not-yet-started with no "currently processing" transition at all. Stashes
    // canvas._triangleHitRegions (recomputed every call, only for currently-visible triangles) so
    // viStatesView.js's hover handler can hit-test the mouse against each outcome's triangle
    // without this file owning any DOM event wiring itself.
    _renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, state) {
        const { revealedActionIds, bestRevealed, activeMove, arrivedKeys, activeKey = null, activeRawPhase = null } = state;
        const ctx = canvas.getContext('2d');
        // Layout/drawing below operates entirely in LOGICAL (CSS-pixel) coordinates - the canvas's
        // actual backing buffer is devicePixelRatio-scaled for crisp HiDPI rendering (see
        // viStatesView.js's _sizeDiagramCanvas()), so w/h here are canvas._logicalWidth/Height,
        // not the raw (larger) canvas.width/height, and a setTransform (not scale - this runs every
        // frame during an animation, and scale() would compound if not reset each time) maps every
        // logical-space draw call onto the real, higher-resolution buffer transparently.
        const w = canvas._logicalWidth || canvas.width;
        const h = canvas._logicalHeight || canvas.height;
        const dpr = canvas._logicalWidth ? canvas.width / canvas._logicalWidth : 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        canvas._triangleHitRegions = [];

        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors, stateName, stateId, images);
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
        // Per-action [start, end) ranges over the same flat transition-key space _buildMoves()
        // assigns - lets the state->action edge highlight whenever ANY of that action's own
        // transitions is the currently-active one, without _buildMoves() itself needing to know
        // about edges at all.
        let keyCursor = 0;
        const actionKeyRanges = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            actionPositions.set(action.actionId, VBD_PADDING + (rowCursor + span / 2) * rowH);
            rowCursor += span;
            actionKeyRanges.set(action.actionId, { start: keyCursor, end: keyCursor + action.transitions.length });
            keyCursor += action.transitions.length;
        });

        // Two full passes over the same rows, not one interleaved pass: every edge is drawn
        // first, then every node on top of ALL of them. A single interleaved pass would draw
        // each action's OWN outgoing action->outcome edges AFTER that action's node was already
        // painted, visually slicing a line across the node's circle/photo at its starting point -
        // nodes must sit above every edge touching them, incoming or outgoing.
        let rowIdx = 0;
        let transitionIndex = 0;
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const keyRange = actionKeyRanges.get(action.actionId);
            // Edges only switch to the highlighted color once we reach 'edgeHighlight'/'multiply' -
            // they stay default-colored through 'highlight'/'flyIn'/'travel'/'rewardReveal'/
            // 'rewardTravel'/'add', so highlighting itself reads as its own deliberate beat rather
            // than lighting up the instant a transition becomes active.
            const isActionEdgeHighlighted = !!(activeMove && activeMove.key >= keyRange.start && activeMove.key < keyRange.end
                && EDGE_HIGHLIGHT_PHASES.has(activeMove.phase));

            // Matches mainView.js's own state->action edge exactly: flat weight 2 (this diagram
            // shows every action, not one chosen policy edge, so there's no policy-weighted
            // case here - always the "no policy set" default), default gray unless highlighted.
            ctx.strokeStyle = isActionEdgeHighlighted ? colors.highlighted : colors.default;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(stateX, stateY);
            ctx.lineTo(actionX, ay);
            ctx.stroke();

            action.transitions.forEach(t => {
                const ty = VBD_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;
                const key = transitionIndex;
                transitionIndex += 1;
                const isEdgeHighlighted = !!(activeMove && activeMove.key === key && EDGE_HIGHLIGHT_PHASES.has(activeMove.phase));

                // Matches mainView.js's own action->state edge exactly: reward-gradient color
                // (green/red, saturation scaled by the reward's intensity within the graph's real
                // min/max range), weight scaled by the transition's own probability.
                ctx.strokeStyle = isEdgeHighlighted ? colors.highlighted : this._rewardColor(t.reward, colors.minReward, colors.maxReward);
                ctx.lineWidth = 1 + 4 * t.probability;
                ctx.beginPath();
                ctx.moveTo(actionX, ay);
                ctx.lineTo(transX, ty);
                ctx.stroke();
            });
        });

        rowIdx = 0;
        transitionIndex = 0;
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const isBest = bestRevealed && action.actionId === detail.bestActionId;
            const fill = isBest ? colors.best : colors.action;
            const workspaceY = ay - VBD_ACTION_RADIUS - 11;

            this._drawNodeWithImage(ctx, actionX, ay, VBD_ACTION_RADIUS, fill, action.actionName, images[action.actionId], colors);

            if (revealedActionIds.has(action.actionId)) {
                ctx.fillStyle = isBest ? colors.best : colors.result;
                ctx.font = isBest ? `bold 17px ${VBD_FONT_FAMILY}` : `17px ${VBD_FONT_FAMILY}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${isBest ? ' ★' : ''}`, actionX, workspaceY - 4);
            }

            action.transitions.forEach(t => {
                const ty = VBD_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;
                const key = transitionIndex;
                transitionIndex += 1;
                const isActive = !!(activeMove && activeMove.key === key);

                this._drawNodeWithImage(ctx, transX, ty, VBD_ACTION_RADIUS, colors.state, t.nextStateName, images[t.nextState], colors, true);

                const phase = isActive ? activeMove.phase : null;
                const hasArrived = arrivedKeys.has(key);
                const priorV = priorValues[t.nextState] ?? 0;
                const anchorX = transX + VBD_ACTION_RADIUS + 8;
                // isCurrentTransition covers this transition's ENTIRE turn, including 'flyIn'
                // (unlike isActive, which is only true for the TRANSITION_PHASES subset) - this is
                // what lets the triangle stay correctly hidden during the flyIn gap without also
                // being mistaken for "hasn't had its turn yet".
                const isCurrentTransition = activeKey === key;
                const currentRawPhase = isCurrentTransition ? activeRawPhase : null;
                const restingHighlighted = currentRawPhase === 'highlight';
                // Hidden before this transition has ever started (the new "only reveal once
                // chosen" rule) - OR once it starts but has moved past its own 'highlight' beat
                // (a DOM chip, a locally-traveling copy, or the settled workspace math has taken
                // over the visual role of this value from there on) - and shown again, dimmed,
                // once it has fully arrived.
                const notYetTurn = !isCurrentTransition && !hasArrived;
                const duringTransit = isCurrentTransition && currentRawPhase !== 'highlight';
                const restingHidden = notYetTurn || duringTransit;
                if (!restingHidden) {
                    this._drawPriorValueTriangle(ctx, anchorX, ty, priorV, {
                        highlighted: restingHighlighted, dimmed: hasArrived && !isActive
                    });
                    canvas._triangleHitRegions.push({ x: anchorX - 2, y: ty - 18, w: 100, h: 34, nextStateId: t.nextState, key, anchorX, ty });
                }

                // Above the midpoint of THIS transition's own action->outcome edge - where the
                // reward/sum/probability/term arithmetic lives from 'rewardReveal' onward, and
                // where the persistent post-arrival term (below) keeps showing it, so there's
                // never a jump between "still animating" and "already landed."
                const edgeMidX = (actionX + transX) / 2;
                const edgeMidY = (ay + ty) / 2 - 12;

                if (isActive) {
                    this._renderActiveTransition(ctx, {
                        anchorX, ty, actionX, workspaceY, priorV, transition: t, phase,
                        progress: activeMove.progress, gamma: activeMove.gamma, edgeMidX, edgeMidY
                    });
                }

                // Once a transition's contribution has landed, its fully-computed term
                // (transition.term - the exact number ValueIterationState.computeNextSweep()
                // already computed, no new state to track) stays permanently visible above its
                // own action->outcome edge, rather than disappearing once the next transition
                // starts animating - a standing "scoreboard" of each contribution as they finish.
                if (hasArrived) {
                    ctx.save();
                    ctx.globalAlpha = 0.85;
                    ctx.fillStyle = colors.result;
                    ctx.font = `bold 12px ${VBD_FONT_FAMILY}`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(t.term.toFixed(2), edgeMidX, edgeMidY);
                    ctx.restore();
                }
            });
        });

        // State node drawn last so it's never occluded by any edge (cosmetic only).
        this._drawNodeWithImage(ctx, stateX, stateY, VBD_STATE_RADIUS, colors.state, stateName, images[stateId], colors);

        if (rows.length > 0) {
            ctx.fillStyle = colors.result;
            ctx.font = `14px ${VBD_FONT_FAMILY}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.globalAlpha = 0.6;
            ctx.fillText('t = k−1', transX, h - 8);
            ctx.globalAlpha = 1;
        }
    },

    // Resolves (and lazily loads/caches) a Canvas2D-drawable image for `url`. Returns null if
    // there's no url, or the image hasn't finished decoding yet - callers just fall back to their
    // normal label-only look in that case, and repaint automatically once _onImageLoaded fires.
    _getImage(url) {
        if (!url) return null;
        let entry = _imageCache.get(url);
        if (!entry) {
            entry = { img: new Image(), loaded: false };
            entry.img.onload = () => {
                entry.loaded = true;
                if (_onImageLoaded) _onImageLoaded();
            };
            entry.img.src = url;
            _imageCache.set(url, entry);
        }
        return entry.loaded ? entry.img : null;
    },

    // Draws one node (state/action/outcome circle) - a plain colored circle + centered label by
    // default, or, when `imageUrl` resolves to an already-loaded image, the same circle as a
    // backdrop plus the photo clipped to a circular mask on top and the name moved above the node
    // instead of centered inside it. Mirrors mainView.js's/treeView.js's own node-image convention
    // (circular clip at 0.8x radius, image drawn at 1.6x radius) adapted for this file's own raw
    // Canvas2D context. dashed: outcome nodes draw a dashed circle stroke, matching their existing
    // look.
    _drawNodeWithImage(ctx, x, y, r, fill, name, imageUrl, colors, dashed = false) {
        if (dashed) {
            ctx.save();
            ctx.setLineDash([4, 3]);
            this._circle(ctx, x, y, r, fill, true);
            ctx.restore();
        } else {
            this._circle(ctx, x, y, r, fill);
        }

        const img = this._getImage(imageUrl);
        if (!img) {
            this._label(ctx, x, y, name, fill);
            return;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
        ctx.clip();
        const imgSize = r * 1.6;
        ctx.drawImage(img, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
        ctx.restore();

        ctx.save();
        ctx.fillStyle = colors.result;
        ctx.font = `13px ${VBD_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(name, x, y - r - 6);
        ctx.restore();
    },

    // Draws whichever visual belongs to the currently-active transition's own phase. The value
    // itself (priorV) travels into and briefly holds in the action's small workspace area above
    // its node - but the rest of the arithmetic the file header describes (reward, sum,
    // probability, final term) all happens ABOVE THIS TRANSITION'S OWN EDGE instead (edgeMidX/
    // edgeMidY, computed once in _renderFrame() from the same formula the persistent post-arrival
    // term uses), matching t.term exactly, the same number the domain itself already computed.
    // Each phase is a SINGLE text line (not several stacked ones, except the brief two-line
    // probReveal beat) that changes content as the phase advances.
    _renderActiveTransition(ctx, { anchorX, ty, actionX, workspaceY, priorV, transition, phase, progress, gamma, edgeMidX, edgeMidY }) {
        const sum = transition.reward + gamma * priorV;

        if (phase === 'travel') {
            const px = anchorX + (actionX - anchorX) * progress;
            const py = ty + (workspaceY - ty) * progress;
            this._drawPriorValueTriangle(ctx, px, py, priorV, { highlighted: true, dimmed: false });
            return;
        }

        if (phase === 'rewardReveal') {
            // V_k has already landed in the workspace and keeps showing there; the reward fades
            // in above its own edge - shown first, before anything else, per the requested
            // reordering - and stays there for the rest of this transition (never travels).
            this._workspaceText(ctx, actionX, workspaceY, priorV.toFixed(2), 1, true, true);
            this._workspaceText(ctx, edgeMidX, edgeMidY, `Reward: ${transition.reward.toFixed(2)}`, progress, true, false);
            return;
        }

        if (phase === 'edgeHighlight') {
            // No text change - this beat is purely about the edges (drawn in _renderFrame's pass
            // 1) switching to the highlighted color, which now stays through every remaining
            // phase of this transition (see EDGE_HIGHLIGHT_PHASES).
            this._workspaceText(ctx, actionX, workspaceY, priorV.toFixed(2), 1, true, true);
            this._workspaceText(ctx, edgeMidX, edgeMidY, `Reward: ${transition.reward.toFixed(2)}`, 1, true, false);
            return;
        }

        if (phase === 'add') {
            // The value's own standalone workspace display disappears here - it joins the reward
            // above the edge instead, which becomes this transition's arithmetic home from here
            // on (matching the "keep the edge there" request - nothing more happens up by the
            // action node after this point).
            const text = progress < 0.5
                ? `${priorV.toFixed(2)} + Reward: ${transition.reward.toFixed(2)}`
                : `Σ: ${sum.toFixed(2)}`;
            this._workspaceText(ctx, edgeMidX, edgeMidY, text, 1, true, true);
            return;
        }

        if (phase === 'probReveal') {
            // The settled sum holds steady on one line while the probability fades in just below.
            this._workspaceText(ctx, edgeMidX, edgeMidY - 10, `Σ: ${sum.toFixed(2)}`, 1, true, true);
            this._workspaceText(ctx, edgeMidX, edgeMidY + 10, `Prob: ${transition.probability.toFixed(2)}`, progress, true, false);
            return;
        }

        if (phase === 'multiply') {
            // First half: the settled sum alongside the already-revealed probability. Second
            // half: both resolve into the final per-transition term.
            const text = progress < 0.5
                ? `Σ: ${sum.toFixed(2)} × Prob: ${transition.probability.toFixed(2)}`
                : `= ${transition.term.toFixed(2)}`;
            this._workspaceText(ctx, edgeMidX, edgeMidY, text, 1, true, true);
        }
    },

    _workspaceText(ctx, x, y, text, alpha, small = false, bold = false) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = VBD_TRIANGLE_COLOR;
        ctx.font = `${bold ? 'bold ' : ''}${small ? 13 : 15}px ${VBD_FONT_FAMILY}`;
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

        ctx.font = `15px ${VBD_FONT_FAMILY}`;
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
        ctx.font = `15px ${VBD_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y);
    },

    // Exact same reward->color mapping as EdgeViewModel._getRewardColor()/_interpolateToGreen()/
    // _interpolateToRed() - kept here as a plain pure function (rather than importing/instantiating
    // an EdgeViewModel, which needs a real EdgeObj) so an action->outcome edge here looks identical
    // to the same transition's real edge in Graph view. minReward/maxReward: the graph's real
    // reward range (see viStatesView.js's _buildDiagramCard()), not just this one diagram's own
    // transitions, matching EdgeViewModel's own graph-wide normalization.
    _rewardColor(reward, minReward, maxReward) {
        if (reward === 0) return AppPalette.reward.zero;
        if (reward > 0) {
            const intensity = maxReward === 0 ? 0 : reward / maxReward;
            const saturation = Math.round(10 + 80 * intensity);
            return `hsl(140, ${saturation}%, 38%)`;
        }
        const intensity = minReward === 0 ? 0 : Math.abs(reward / minReward);
        const saturation = Math.round(10 + 80 * intensity);
        return `hsl(0, ${saturation}%, 40%)`;
    },

    _drawEmpty(ctx, w, h, colors, stateName, stateId, images = {}) {
        const cx = w / 2;
        const cy = h / 2 - VBD_STATE_RADIUS - 12;
        this._drawNodeWithImage(ctx, cx, cy, VBD_STATE_RADIUS, colors.state, stateName, images[stateId], colors);

        ctx.fillStyle = colors.action;
        ctx.font = `17px ${VBD_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('no actions', cx, cy + VBD_STATE_RADIUS + 28);
    }
};
