// src/main/view/helpers/viBackupDiagram.js
// Canvas2D + DOM renderer for a single state's backup diagram (Values -> Iteration, "Substitution"
// choreography redesign - handoff 2, docs/superpowers/plans/2026-07-21-vi-animation-redesign.md).
//
// Split responsibility (the plan's own "who drives the reveal" decision): the <canvas> is a
// PASSIVE VISUAL TREE - state/actions/outcomes, edges, the ghost-subtree value marker, edge
// flares/highlights, and the persistent per-transition term "scoreboard" once landed - plus the
// FLYING-NUMBER SOURCE (every quantity that gets highlighted flies FROM a point on this canvas).
// The LIVE substitution arithmetic - the accumulating `Q(S,a) = ...` line, the dashed
// `P(...)*(r + gamma*Vt(s'))` template with slot boxes, numbers filling slots, the collapse to a
// term, the term flying up into the accumulation - lives in a separate DOM "equation zone" element
// (`eqZoneEl`, built with plain styled <span> tokens + CSS transitions), passed in by the caller
// (viStatesView.js's _buildDiagramCard()) and owned by this file for the duration of a reveal.
//
// draw()/drawSkeleton() are the two non-animated entry points (fully settled / fully unrevealed),
// used for historical sweeps and "frame 0" respectively - draw() also builds the eqZoneEl's own
// settled content directly (no animation), so expanding an older, already-computed sweep's card
// reads as complete rather than blank. drawAnimated() is the live, async, per-state reveal driven
// by RevealTimeline (helpers/RevealTimeline.js) - it owns creation/mutation of tokens inside
// eqZoneEl and returns {cancel, pause, resume}, the same outer contract the prior (canvas-only)
// implementation already exposed, so ViStatesView's ~1000 lines of reveal-sequencing/pause/scroll/
// flash bookkeeping need no changes beyond threading the new eqZoneEl/graph/runMode params through
// (see viStatesView.js's own comments at each call site).
//
// Deliberately NOT mathRenderer-based (its failure-fallback path calls p5 GLOBAL functions that
// always draw to the MAIN canvas regardless of which ctx is passed - a real mismatch for a
// per-card canvas). Canvas labels are plain ctx.fillText() instead; DOM equation-zone tokens are
// plain styled <span> elements (mirroring the prototype's own "manim-ish token writing" - tok()/
// sub()/writeIn()/countUp()/hl() below), not KaTeX - the live fly/substitute/collapse choreography
// needs per-token DOM nodes to animate, which a single KaTeX-rendered formula string can't offer.
const VBD_PADDING = 20;
const VBD_STATE_RADIUS = 31;
const VBD_ACTION_RADIUS = 22;
const VBD_TRIANGLE_SIZE = 16; // half-height of the terminal-state ghost-subtree fallback tail (unused - kept for reference only)
// Same font family Build mode's own canvas text uses (mainView.js's global textFont(Typography.
// sans()), IBM Plex Sans, registered as a CSS @font-face in style.css) - a plain font-family
// string since this file draws via raw ctx.font, not p5's textFont()/Typography's p5.Font object.
const VBD_FONT_FAMILY = '"IBM Plex Sans", Calibri, "Segoe UI", Tahoma, sans-serif';
const VBD_MONO_FAMILY = '"IBM Plex Mono", Consolas, monospace';
const VBD_MATH_FAMILY = '"STIX Two Text", Georgia, serif';

// --- Timing constants (ms, unscaled - RevealTimeline.wait()/tween() apply getSpeedScale() live).
// Ported from vi-engine.js's `_conceptB`/`_transIntro` ("Substitution" choreography) - see
// docs/superpowers/plans/2026-07-21-vi-animation-redesign.md Phase 2 Step 4 for the literal
// line-by-line mapping this file follows.
const VBD_TRANS_HIGHLIGHT_MS = 350;   // transIntro: highlight the outcome's prior-sweep card, before the fly
const VBD_TRANS_FLY_MS = 480;         // transIntro: ghost-tree chip flies from the prior card to this diagram's anchor
const VBD_TRANS_LANDED_PAUSE_MS = 140; // transIntro: brief pause once the tree has landed
const VBD_TRANS_EDGES_PAUSE_MS = 240;  // transIntro: edges-hot beat before the slot template appears
const VBD_WRITE_STAGGER_MS = 26;       // per-token stagger when writing a symbolic line in
const VBD_FILL_PRE_MS = 220;           // pause before the value slot starts filling
const VBD_FILL_FLY_MS = 420;           // a value's own fly-into-slot duration
const VBD_FILL_SETTLE_MS = 120;        // pause once a slot's number has landed
const VBD_REWARD_RING_MS = 260;        // reward's own "lane lights up" pause before its fly
const VBD_PROB_FLARE_MS = 260;         // probability's own "edge flares" pause before its fly
const VBD_COLLAPSE_PRE_MS = 200;       // pause once every slot is filled, before collapsing
const VBD_COLLAPSE_FADE_MS = 240;      // template fades as it collapses to `p x sum`
const VBD_COLLAPSE_HOLD_MS = 420;      // `p x sum` holds before collapsing to the final term
const VBD_COLLAPSE_TERM_HOLD_MS = 220; // the term holds in the workspace before flying up
const VBD_TERM_FLY_MS = 340;           // term flies from the workspace into the accumulation line
const VBD_TRANS_END_PAUSE_MS = 140;    // brief pause once a transition's term has landed
const VBD_Q_COUNTUP_MS = 380;          // an action's own Q count-up once every transition has landed
const VBD_Q_PARK_PAUSE_MS = 300;       // pause once Q resolves, before parking its chip
const VBD_COMBINE_PRE_MS = 300;        // pause before the expectation-combine line appears
const VBD_COMBINE_WRITE_STAGGER_MS = 22;
const VBD_COMBINE_FLY_MS = 420;        // pi's and each action's Q's own fly-into-combine duration
const VBD_COMBINE_ACTION_PAUSE_MS = 160; // pause between one action's combine term and the next
const VBD_V_COUNTUP_MS = 380;          // final V count-up (expectation combine, or the optimal-mode max)
const VBD_COMBINE_END_PAUSE_MS = 300;  // pause once V has resolved, before onComplete
const VBD_BEST_HIGHLIGHT_MS = 550;     // optimal-mode ending: highlight/star the best action

// Ghost-subtree marker sizing/opacity (enlarged past the prototype's own tiny/faint original -
// see _ghostSubtree()/treeChipSVG()). Scale is a plain multiplier on every original px dimension;
// the two alphas (0-100, ColorUtils.applyAlpha's own range) replace the prototype's fixed .5/.22.
const VBD_GHOST_SCALE = 1.6;
const VBD_GHOST_BRANCH_ALPHA = 70;
const VBD_GHOST_OUTCOME_ALPHA = 45;

const ViBackupDiagram = {
    // Registers a single callback fired once, after any image this file loads finishes decoding -
    // lets the caller repaint whichever already-drawn (non-animating) cards might now have a
    // photo available that wasn't ready at their last paint. Unchanged from before this redesign.
    setOnImageLoaded(fn) {
        _onImageLoaded = fn;
    },

    // Fully settled: canvas shows every action/outcome resolved, every ghost-subtree marker
    // landed, the best action highlighted (or, in 'optimal' mode, starred); eqZoneEl is rebuilt
    // directly (no animation, no flying) into the same final textual form a live reveal would have
    // arrived at - one accumulation line per action (`Q(S, a) = term + term = qValue`) plus either
    // the expectation-combine line (`V = pi*Q + ... = value`) or, in 'optimal' mode, a plain
    // `V = max_a Q(S, a) = value` line. Used for historical/already-seen sweeps and for the
    // teardown/supersede "snap to resolved" paths.
    draw(canvas, eqZoneEl, detail, priorValues, colors, stateName, stateId, images = {}, graph = null, runMode = 'expectation') {
        this._renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, graph, this._settledState(detail), runMode);
        this._buildSettledEqZone(eqZoneEl, detail, colors, runMode, stateName);
    },

    // Nothing revealed, nothing arrived - the true "frame 0" for a card that's visible but hasn't
    // reached its own turn in the sequential per-state reveal yet. eqZoneEl is left empty (no
    // accumulation lines exist until the live reveal actually starts building them).
    drawSkeleton(canvas, eqZoneEl, detail, priorValues, colors, stateName, stateId, images = {}, graph = null) {
        // runMode doesn't matter here - nothing is revealed yet (revealedQ is empty), so the
        // star-gating below never triggers regardless of what's passed.
        this._renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, graph, this._emptyVis(), 'expectation');
        if (eqZoneEl) eqZoneEl.innerHTML = '';
    },

    // Animates the real "Substitution" choreography via RevealTimeline (smooth tweening/waiting,
    // speed-scaled live). Returns {cancel, pause, resume} - the exact same outer contract the
    // prior implementation exposed, so ViStatesView's own pause/resume/step-mode plumbing needs no
    // changes.
    //
    // graph: the live Graph domain object (or a plain {getNodeById} shape) - needed by the
    // ghost-subtree marker to look up an outcome's own actions/transitions one level deeper.
    // gamma: the discount factor (ValueIterationState.gamma) - drawn as a literal 'gamma' symbol
    // in the slot template, never substituted with its numeric value (matches the prototype's own
    // "Substitution" concept exactly - only P(...)/r/Vt(s') are real fly-in slots; gamma stays
    // symbolic throughout, unlike the OLDER "inline Bellman" concept the handoff explicitly does
    // not ask for - see Decision 3 in the plan).
    // runMode: 'expectation' (default) plays the full pi/expectation-combine ending; 'optimal'
    // (reachable via "Find Optimal pi") skips pi entirely (every action.pi is null - see
    // ValueIterationState.computeNextSweep()) and instead highlights/stars the best action with a
    // plain `V = max_a Q(S, a) = value` line - the prototype never implements optimality mode at
    // all, so this branch is this plan's own addition, not a port.
    // opts: { getSpeedScale, getStepMode, onHighlightPrior, onFlyValue, onStepPause, onComplete,
    //   onBeat } - all optional, all live-read callbacks (re-invoked fresh, never snapshotted) so
    //   a mid-reveal animation-speed-slider or step-mode change takes effect immediately, matching
    //   the pre-existing convention this file already used for getSpeedScale/getStepMode.
    //   onBeat(beat, info) fires once per narration-worthy moment (mirrors vi-app.js's
    //   EquationView.setBeat contract) - see viStatesView.js/main.js for how this reaches the
    //   Explain narrator, gated to only the ACTIVE state's own reveal.
    drawAnimated(canvas, eqZoneEl, detail, priorValues, colors, stateName, stateId, images = {}, graph = null, gamma = 0.9, runMode = 'expectation', opts = {}) {
        const getSpeedScale = opts.getSpeedScale || (() => 1);
        const getStepMode = opts.getStepMode || (() => false);
        const onHighlightPrior = opts.onHighlightPrior || (() => {});
        const onFlyValue = opts.onFlyValue || (() => {});
        const onStepPause = opts.onStepPause || (() => {});
        const onComplete = opts.onComplete || (() => {});
        const onBeat = opts.onBeat || (() => {});

        const tl = new RevealTimeline(getSpeedScale);
        const vis = this._emptyVis();
        const activeFlyChips = [];
        let cancelled = false;

        const render = () => this._renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, graph, vis, runMode);

        const checkpoint = async () => {
            if (cancelled) return;
            if (getStepMode()) {
                tl.pause();
                onStepPause();
                await tl.wait(0);
            }
        };

        const fly = (fromPagePoint, toEl, text, durationMs, color, html) => {
            const chip = this._fly(fromPagePoint, toEl, text, durationMs, color, html);
            if (chip) activeFlyChips.push(chip);
        };

        eqZoneEl && (eqZoneEl.innerHTML = '');
        render();

        (async () => {
            if (!detail || !detail.actions || detail.actions.length === 0) {
                onComplete();
                return;
            }

            const accLine = document.createElement('div');
            accLine.className = 'vi-backup-diagram-acc-line';
            const workLine = document.createElement('div');
            workLine.className = 'vi-backup-diagram-work-line';
            if (eqZoneEl) { eqZoneEl.appendChild(accLine); eqZoneEl.appendChild(workLine); }

            let key = 0;
            for (const action of detail.actions) {
                if (tl.cancelled) break;
                accLine.innerHTML = '';
                const accToks = [
                    this._tok('Q', 'var', colors), this._tok(`(${stateName}, ${action.actionName})`, 'var', colors),
                    this._tok('=', 'op', colors)
                ];
                accToks.forEach(t => accLine.appendChild(t));
                vis.qActionId = action.actionId;
                render();
                await this._writeIn(tl, accToks, VBD_WRITE_STAGGER_MS);

                for (const transition of action.transitions) {
                    if (tl.cancelled) break;
                    const an = await this._revealTransition(tl, canvas, graph, vis, render, key, action, transition,
                        onHighlightPrior, onFlyValue, onBeat, stateName);
                    if (tl.cancelled) break;

                    workLine.innerHTML = '';
                    const pSlot = this._slot(`P(${stateName}, ${action.actionName}, ${transition.nextStateName})`, colors);
                    const rSlot = this._slot('r', colors);
                    const vSlot = this._slot('Vₜ(s′)', colors);
                    // The actual configured discount factor, not the bare symbol - it's already
                    // known (unlike P/r/Vt(s'), nothing flies in for it), so it's shown directly as
                    // a resolved 'num' token rather than a dashed slot.
                    const gammaTok = this._tok(gamma.toFixed(2), 'num', colors);
                    const wToks = [
                        pSlot, this._tok('·', 'op', colors), this._tok('(', 'plain', colors), rSlot,
                        this._tok('+', 'op', colors), gammaTok, this._tok('·', 'op', colors),
                        vSlot, this._tok(')', 'plain', colors)
                    ];
                    wToks.forEach(t => workLine.appendChild(t));
                    await this._writeIn(tl, wToks, VBD_WRITE_STAGGER_MS);

                    const triPt = this._pagePoint(canvas, an.anchorX, an.ty);
                    const edgePt = this._pagePoint(canvas, an.labelX, an.labelY);
                    const actPt = this._pagePoint(canvas, an.actionX, an.actionY);

                    vis.edgesHot = false; vis.activePhase = 'highlight'; render();
                    await tl.wait(VBD_FILL_PRE_MS);
                    await this._fillSlot(tl, fly, vSlot, this._fmt(transition.nextValue), triPt, this._signColor(transition.nextValue, colors));

                    onBeat('reward', { s: stateName, a: action.actionName, sp: transition.nextStateName, r: transition.reward });
                    vis.hotReward = key; render();
                    await tl.wait(VBD_REWARD_RING_MS);
                    await this._fillSlot(tl, fly, rSlot, this._fmt(transition.reward), edgePt,
                        this._rewardColor(transition.reward, colors.minReward, colors.maxReward, colors));
                    vis.hotReward = null;

                    onBeat('probability', { s: stateName, a: action.actionName, sp: transition.nextStateName, p: transition.probability });
                    vis.edgesHot = true; vis.activePhase = 'edges'; render();
                    await tl.wait(VBD_PROB_FLARE_MS);
                    await this._fillSlot(tl, fly, pSlot, transition.probability.toFixed(2), actPt, colors.subtle);
                    vis.edgesHot = false; vis.activePhase = 'highlight'; render();
                    await tl.wait(VBD_COLLAPSE_PRE_MS);

                    // Collapse: slot template -> `p x sum` -> teal term, entirely inside workLine.
                    await tl.tween(VBD_COLLAPSE_FADE_MS, e => { workLine.style.opacity = String(1 - 0.5 * e); });
                    workLine.innerHTML = '';
                    workLine.style.opacity = '1';
                    const innerSum = transition.reward + gamma * transition.nextValue;
                    const c1 = [this._tok(transition.probability.toFixed(2), 'num', colors), this._tok('×', 'op', colors), this._tok(this._fmt(innerSum), 'num', colors)];
                    c1.forEach(t => workLine.appendChild(t));
                    this._showAll(c1);
                    await tl.wait(VBD_COLLAPSE_HOLD_MS);
                    workLine.innerHTML = '';
                    const termTok = this._tok(this._fmt(transition.term), 'num', colors);
                    termTok.style.color = colors.term;
                    termTok.style.fontWeight = '700';
                    termTok.style.fontSize = '1.05em';
                    workLine.appendChild(termTok);
                    this._showAll([termTok]);
                    await tl.wait(VBD_COLLAPSE_TERM_HOLD_MS);

                    // Term chip flies up into the accumulation line.
                    const fromRect = termTok.getBoundingClientRect();
                    if (accLine.querySelectorAll('[data-term]').length) {
                        const plus = this._tok('+', 'op', colors);
                        accLine.appendChild(plus);
                        this._showAll([plus]);
                    }
                    const accTerm = this._tok(this._fmt(transition.term), 'num', colors);
                    accTerm.dataset.term = '1';
                    accTerm.style.color = colors.term;
                    accTerm.style.fontWeight = '700';
                    accLine.appendChild(accTerm);
                    const toRect = accTerm.getBoundingClientRect();
                    fly(
                        { x: fromRect.left + fromRect.width / 2, y: fromRect.top + fromRect.height / 2 },
                        { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 },
                        this._fmt(transition.term), VBD_TERM_FLY_MS * getSpeedScale(), colors.term
                    );
                    termTok.style.opacity = '0';
                    await tl.wait(VBD_TERM_FLY_MS);
                    this._showAll([accTerm]);
                    workLine.innerHTML = '';
                    vis.arrived.add(key);
                    vis.activeKey = null; vis.edgesHot = false;
                    render();
                    key += 1;
                    await tl.wait(VBD_TRANS_END_PAUSE_MS);
                    await checkpoint();
                }
                if (tl.cancelled) break;

                const eqTok = this._tok('=', 'op', colors);
                accLine.appendChild(eqTok);
                this._showAll([eqTok]);
                const qv = this._tok('0.00', 'num', colors);
                qv.style.color = colors.primary;
                qv.style.fontWeight = '700';
                accLine.appendChild(qv);
                this._showAll([qv]);
                await this._countUp(tl, qv, action.qValue, VBD_Q_COUNTUP_MS);
                onBeat('q', { s: stateName, a: action.actionName, q: action.qValue });
                vis.revealedQ.add(action.actionId);
                vis.qActionId = null;
                render();
                await tl.wait(VBD_Q_PARK_PAUSE_MS);

                const parked = document.createElement('span');
                parked.className = 'vi-backup-diagram-parked-chip';
                parked.style.color = colors.secondary;
                parked.style.background = colors.parkedBg;
                parked.style.borderColor = colors.hairline;
                parked.textContent = `Q(${action.actionName}) = ${this._fmt(action.qValue)}`;
                parked.dataset.actionId = String(action.actionId);
                if (eqZoneEl) eqZoneEl.insertBefore(parked, accLine);
                accLine.innerHTML = '';
                await checkpoint();
            }

            // NOT onComplete() here - cancellation (Skip/Reset/teardown) is handled entirely by
            // ViStatesView's own _cancelCurrentCardOnly()/_cancelActiveReveal(), which snap the
            // canvas+eqZone straight to resolved themselves and resolve the reveal promise
            // directly; calling onComplete() here too would double-fire ViStatesView's own
            // finish()/_collapseCardToPill() and double-advance _liveCursor.
            if (tl.cancelled) return;

            if (runMode === 'optimal') {
                await this._playOptimalEnding(tl, render, vis, accLine, detail, colors, onBeat, stateName);
            } else {
                await this._playExpectationCombine(tl, canvas, render, vis, accLine, detail, colors, onBeat, stateName, fly, checkpoint);
            }

            // Cancellation may have happened DURING the combine/optimal-ending helper (their own
            // early `if (tl.cancelled) return;` checks stop THEIR work, but control still returns
            // here) - same "ViStatesView already handled it" reasoning as above.
            if (!tl.cancelled) onComplete();
        })();

        return {
            cancel: () => {
                cancelled = true;
                tl.cancel();
                activeFlyChips.splice(0).forEach(chip => chip.cancel());
            },
            pause: () => tl.pause(),
            resume: () => tl.resume()
        };
    },

    // Shared per-transition intro: highlights the outcome's prior card, flies the ghost-tree chip
    // in from it, lands it permanently at this diagram's own anchor, then heats the edges just
    // before the slot template appears. Ported from vi-engine.js's `_transIntro`.
    async _revealTransition(tl, canvas, graph, vis, render, key, action, transition, onHighlightPrior, onFlyValue, onBeat, stateName) {
        const layout = this._layout(canvas);
        const an = layout.anchors.get(key);
        vis.activeKey = key; vis.activePhase = 'flyIn'; vis.edgesHot = false;
        render();
        onHighlightPrior(transition.nextState);
        await tl.wait(VBD_TRANS_HIGHLIGHT_MS);
        if (tl.cancelled) return an;
        // ViStatesView owns the fly's ORIGIN (the prior card's own DOM position, in an older
        // sweep's section) - this file only knows the DESTINATION (its own anchor point).
        // ViStatesView threads the ghost-tree SVG content in via ViBackupDiagram.treeChipSVG().
        onFlyValue({
            nextStateId: transition.nextState,
            canvasX: an.anchorX,
            canvasY: an.ty,
            durationMs: VBD_TRANS_FLY_MS * tl.getSpeedScale()
        });
        await tl.wait(VBD_TRANS_FLY_MS);
        if (tl.cancelled) return an;
        if (!vis.landedTrees) vis.landedTrees = new Set();
        vis.landedTrees.add(key);
        onBeat('value', { s: stateName, a: action.actionName, sp: transition.nextStateName, v: transition.nextValue });
        vis.activePhase = 'highlight';
        render();
        await tl.wait(VBD_TRANS_LANDED_PAUSE_MS);
        vis.edgesHot = true; vis.activePhase = 'edges';
        render();
        await tl.wait(VBD_TRANS_EDGES_PAUSE_MS);
        return an;
    },

    // Fills one dashed slot: flies `value` in from `fromPagePoint`, then settles it into the
    // slot's own final styling. Ported from vi-engine.js's `fill()` closure inside `_conceptB`.
    async _fillSlot(tl, fly, slotEl, value, fromPagePoint, color) {
        fly(fromPagePoint, slotEl, value, VBD_FILL_FLY_MS * tl.getSpeedScale(), color, null);
        slotEl.style.borderColor = color;
        await tl.wait(VBD_FILL_FLY_MS);
        slotEl.textContent = value;
        slotEl.style.fontFamily = VBD_MONO_FAMILY;
        slotEl.style.fontStyle = 'normal';
        slotEl.style.fontSize = '0.88em';
        slotEl.style.color = color;
        slotEl.style.borderColor = 'transparent';
        slotEl.style.background = 'rgba(127,127,140,.08)';
        await tl.wait(VBD_FILL_SETTLE_MS);
    },

    // Expectation-combine ending (runMode !== 'optimal'): the FULL symbolic equation is written in
    // one shot first - `V_{t+1}(S) = π(a0|S)·Q(S,a0) + π(a1|S)·Q(S,a1) + ...`, every term for every
    // action, real action/state names substituted for "a"/"S" - and only THEN does substitution
    // begin, one part at a time: each π(a|s)/Q(s,a) slot flies its real number in and the label is
    // replaced outright (via the shared _fillSlot(), same clean swap the per-transition P/r/Vt(s')
    // template already uses - no lingering "=" alongside the label), so the policy is genuinely
    // visible as part of the equation's structure before it resolves to plain numbers, matching the
    // per-transition template's own "symbolic first, then substitute" convention exactly.
    async _playExpectationCombine(tl, canvas, render, vis, accLine, detail, colors, onBeat, stateName, fly, checkpoint) {
        vis.policyPhase = true;
        render();
        onBeat('pi', { s: stateName });
        await tl.wait(VBD_COMBINE_PRE_MS);
        if (tl.cancelled) return;

        accLine.innerHTML = '';
        const allToks = [this._sub('V', 't+1', colors), this._tok(`(${stateName})`, 'var', colors), this._tok('=', 'op', colors)];
        const terms = [];
        detail.actions.forEach((action, i) => {
            if (i) allToks.push(this._tok('+', 'op', colors));
            const piSlot = this._slot(`π(${action.actionName}|${stateName})`, colors);
            const dotTok = this._tok('·', 'op', colors);
            const qSlot = this._slot(`Q(${stateName}, ${action.actionName})`, colors);
            allToks.push(piSlot, dotTok, qSlot);
            terms.push({ action, piSlot, qSlot });
        });
        allToks.forEach(t => accLine.appendChild(t));
        await this._writeIn(tl, allToks, VBD_COMBINE_WRITE_STAGGER_MS);
        await tl.wait(VBD_COMBINE_PRE_MS);

        const parkedChips = new Map();
        (accLine.parentElement ? Array.from(accLine.parentElement.children) : [])
            .filter(el => el.classList && el.classList.contains('vi-backup-diagram-parked-chip'))
            .forEach(chip => parkedChips.set(Number(chip.dataset.actionId), chip));

        for (const { action, piSlot, qSlot } of terms) {
            if (tl.cancelled) return;

            const layout = this._layout(canvas);
            const actEntry = layout.actionAnchors.get(action.actionId);
            const piFrom = actEntry
                ? this._pagePoint(canvas, (layout.stateX + layout.actionX) / 2, (layout.stateY + actEntry.ay) / 2 - 5)
                : this._pagePoint(canvas, layout.stateX, layout.stateY);
            await this._fillSlot(tl, fly, piSlot, (action.pi ?? 0).toFixed(2), piFrom, colors.pi);

            const chip = parkedChips.get(Number(action.actionId));
            const qFrom = chip
                ? (() => { const r = chip.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()
                : piFrom;
            if (chip) chip.style.borderColor = colors.secondary;
            await this._fillSlot(tl, fly, qSlot, this._fmt(action.qValue), qFrom, colors.primary);
            if (chip) chip.style.borderColor = colors.hairline;

            await tl.wait(VBD_COMBINE_ACTION_PAUSE_MS);
            await checkpoint();
        }

        const eqTok = this._tok('=', 'op', colors);
        accLine.appendChild(eqTok);
        this._showAll([eqTok]);
        const vTok = this._tok('0.00', 'num', colors);
        vTok.style.color = colors.live;
        vTok.style.fontWeight = '700';
        accLine.appendChild(vTok);
        this._showAll([vTok]);
        await this._countUp(tl, vTok, detail.value, VBD_V_COUNTUP_MS);
        vis.best = true;
        render();
        await tl.wait(VBD_COMBINE_END_PAUSE_MS);
    },

    // 'optimal'-mode ending (not covered by the handoff/prototype at all - see drawAnimated()'s
    // own doc comment): no policy to combine, so simply highlight/star the best action and show a
    // plain `V = max_a Q(S, a) = value` line instead of the pi/expectation-combine choreography.
    async _playOptimalEnding(tl, render, vis, accLine, detail, colors, onBeat, stateName) {
        vis.best = true;
        render();
        const bestAction = detail.actions.find(a => a.actionId === detail.bestActionId);
        onBeat('best', { s: stateName, a: bestAction ? bestAction.actionName : '', v: detail.value });
        await tl.wait(VBD_BEST_HIGHLIGHT_MS);
        if (tl.cancelled) return;

        accLine.innerHTML = '';
        const head = [
            this._sub('V', 't+1', colors), this._tok(`(${stateName})`, 'var', colors), this._tok('=', 'op', colors),
            this._tok('max', 'op', colors), this._sub('', 'a', colors), this._tok('Q', 'var', colors),
            this._tok(`(${stateName}, a)`, 'var', colors)
        ];
        head.forEach(t => accLine.appendChild(t));
        await this._writeIn(tl, head, VBD_WRITE_STAGGER_MS);
        await tl.wait(VBD_COMBINE_PRE_MS);
        const eqTok = this._tok('=', 'op', colors);
        accLine.appendChild(eqTok);
        this._showAll([eqTok]);
        const vTok = this._tok('0.00', 'num', colors);
        vTok.style.color = colors.live;
        vTok.style.fontWeight = '700';
        accLine.appendChild(vTok);
        this._showAll([vTok]);
        await this._countUp(tl, vTok, detail.value, VBD_V_COUNTUP_MS);
        await tl.wait(VBD_COMBINE_END_PAUSE_MS);
    },

    // Rebuilds eqZoneEl directly into its final, settled textual form - no animation, no flying.
    // One accumulation line per action, plus the expectation-combine (or optimal-mode max) line.
    _buildSettledEqZone(eqZoneEl, detail, colors, runMode, stateName) {
        if (!eqZoneEl) return;
        eqZoneEl.innerHTML = '';
        if (!detail || !detail.actions || detail.actions.length === 0) return;

        detail.actions.forEach(action => {
            const line = document.createElement('div');
            line.className = 'vi-backup-diagram-acc-line';
            const toks = [this._tok('Q', 'var', colors), this._tok(`(${stateName}, ${action.actionName})`, 'var', colors), this._tok('=', 'op', colors)];
            action.transitions.forEach((t, i) => {
                if (i > 0) toks.push(this._tok('+', 'op', colors));
                const termTok = this._tok(this._fmt(t.term), 'num', colors);
                termTok.style.color = colors.term;
                termTok.style.fontWeight = '700';
                toks.push(termTok);
            });
            toks.push(this._tok('=', 'op', colors));
            const qTok = this._tok(this._fmt(action.qValue), 'num', colors);
            qTok.style.color = colors.primary;
            qTok.style.fontWeight = '700';
            toks.push(qTok);
            toks.forEach(t => line.appendChild(t));
            this._showAll(toks);
            eqZoneEl.appendChild(line);
        });

        const combine = document.createElement('div');
        combine.className = 'vi-backup-diagram-acc-line';
        let toks;
        if (runMode === 'optimal') {
            toks = [
                this._sub('V', 't+1', colors), this._tok('=', 'op', colors), this._tok('max', 'op', colors),
                this._sub('', 'a', colors), this._tok('Q', 'var', colors), this._tok('=', 'op', colors)
            ];
            const vTok = this._tok(this._fmt(detail.value), 'num', colors);
            vTok.style.color = colors.live; vTok.style.fontWeight = '700';
            toks.push(vTok);
        } else {
            // Matches what a live reveal's own combine phase settles into once every pi(a|s)/
            // Q(s,a) slot has been substituted (see _playExpectationCombine() - _fillSlot()
            // REPLACES each slot's label with its resolved number, it doesn't keep both) - plain
            // numbers here, not labels, for a historical/already-seen sweep's card.
            toks = [this._sub('V', 't+1', colors), this._tok(`(${stateName})`, 'var', colors), this._tok('=', 'op', colors)];
            detail.actions.forEach((action, i) => {
                if (i) toks.push(this._tok('+', 'op', colors));
                const piTok = this._tok((action.pi ?? 0).toFixed(2), 'num', colors);
                piTok.style.color = colors.pi;
                const qTok = this._tok(this._fmt(action.qValue), 'num', colors);
                qTok.style.fontWeight = '700';
                toks.push(piTok, this._tok('·', 'op', colors), qTok);
            });
            toks.push(this._tok('=', 'op', colors));
            const vTok = this._tok(this._fmt(detail.value), 'num', colors);
            vTok.style.color = colors.live; vTok.style.fontWeight = '700';
            toks.push(vTok);
        }
        toks.forEach(t => combine.appendChild(t));
        this._showAll(toks);
        eqZoneEl.appendChild(combine);
    },

    // --- DOM token helpers (mirrors vi-engine.js's tok()/sub()/writeIn()/showAll()/countUp(),
    // adapted to take `colors` instead of a module-global PAL) ---

    _tok(text, kind, colors) {
        const s = document.createElement('span');
        s.textContent = text;
        s.className = 'vi-backup-diagram-tok';
        if (kind === 'var') { s.style.fontFamily = VBD_MATH_FAMILY; s.style.fontStyle = 'italic'; s.style.color = colors.primary; }
        else if (kind === 'num') { s.style.fontFamily = VBD_MONO_FAMILY; s.style.fontSize = '0.88em'; s.style.color = colors.secondary; }
        else if (kind === 'op') { s.style.fontFamily = VBD_MATH_FAMILY; s.style.color = colors.muted; s.style.padding = '0 3px'; }
        else { s.style.fontFamily = VBD_MATH_FAMILY; s.style.color = colors.primary; }
        return s;
    },

    _sub(base, subText, colors) {
        const w = this._tok('', 'var', colors);
        w.textContent = '';
        const b = document.createElement('span'); b.textContent = base;
        const sub = document.createElement('sub'); sub.textContent = subText; sub.style.fontSize = '0.65em';
        w.appendChild(b); w.appendChild(sub);
        return w;
    },

    _slot(label, colors) {
        const s = document.createElement('span');
        s.textContent = label;
        s.className = 'vi-backup-diagram-slot';
        s.style.fontFamily = VBD_MATH_FAMILY;
        s.style.fontStyle = 'italic';
        s.style.color = colors.muted;
        s.style.borderColor = colors.hairline;
        return s;
    },

    async _writeIn(tl, tokens, stagger) {
        for (const t of tokens) {
            if (tl.cancelled) break;
            t.classList.add('vi-backup-diagram-tok--shown');
            await tl.wait(stagger);
        }
        this._showAll(tokens);
    },

    _showAll(tokens) {
        tokens.forEach(t => t.classList.add('vi-backup-diagram-tok--shown'));
    },

    async _countUp(tl, el, target, ms) {
        await tl.tween(ms, e => { el.textContent = this._fmt(target * e); });
        el.textContent = this._fmt(target);
    },

    _fmt(v) {
        return v >= 0 ? v.toFixed(2) : '−' + Math.abs(v).toFixed(2);
    },

    _emptyVis() {
        return {
            arrived: new Set(), revealedQ: new Set(), best: false, activeKey: null, activePhase: null,
            edgesHot: false, qActionId: null, hotReward: null, landedTrees: new Set(), policyPhase: false
        };
    },

    // Fully-resolved vis for draw()'s canvas pass - every transition arrived, every Q revealed,
    // best highlighted, every ghost-subtree landed.
    _settledState(detail) {
        const arrived = new Set();
        const revealedQ = new Set();
        const landedTrees = new Set();
        let key = 0;
        if (detail && detail.actions) {
            detail.actions.forEach(action => {
                revealedQ.add(action.actionId);
                action.transitions.forEach(() => { arrived.add(key); landedTrees.add(key); key += 1; });
            });
        }
        return {
            arrived, revealedQ, best: true, activeKey: null, activePhase: null, edgesHot: false,
            qActionId: null, hotReward: null, landedTrees, policyPhase: false
        };
    },

    // --- Layout (shared by canvas rendering and the async driver's page-point lookups) ---

    _layout(canvas, detailOverride) {
        const w = canvas._logicalWidth || canvas.width;
        const h = canvas._logicalHeight || canvas.height;
        const detail = detailOverride || canvas._vbdDetail;
        const stateX = VBD_PADDING + VBD_STATE_RADIUS;
        const stateY = h / 2;
        const actionX = w * 0.40;
        const transX = w * 0.70;
        const anchors = new Map();
        const actionAnchors = new Map();
        if (!detail || !detail.actions || detail.actions.length === 0) {
            return { stateX, stateY, actionX, transX, anchors, actionAnchors };
        }
        const rows = [];
        detail.actions.forEach(a => a.transitions.forEach(t => rows.push({ a, t })));
        const rowH = (h - 2 * VBD_PADDING) / Math.max(rows.length, 1);
        let cursor = 0, key = 0;
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            const ay = VBD_PADDING + (cursor + span / 2) * rowH;
            const keyStart = key;
            actionAnchors.set(action.actionId, { ay, keyStart, keyEnd: keyStart + action.transitions.length });
            action.transitions.forEach((t, idx) => {
                const ty = VBD_PADDING + (cursor + idx + 0.5) * rowH;
                anchors.set(key, {
                    key, ty, tx: transX, anchorX: transX + VBD_ACTION_RADIUS + 8,
                    actionX, actionY: ay, workspaceY: ay - VBD_ACTION_RADIUS - 11,
                    labelX: (actionX + transX) / 2, labelY: ty,
                    nextState: t.nextState
                });
                key += 1;
            });
            cursor += span;
        });
        return { stateX, stateY, actionX, transX, anchors, actionAnchors };
    },

    _pagePoint(canvas, x, y) {
        const rect = canvas.getBoundingClientRect();
        const lw = canvas._logicalWidth || canvas.width || 1;
        const lh = canvas._logicalHeight || canvas.height || 1;
        return { x: rect.left + x * (rect.width / lw), y: rect.top + y * (rect.height / lh) };
    },

    // --- Canvas rendering ---

    _renderFrame(canvas, detail, priorValues, colors, stateName, stateId, images, graph, vis, runMode = 'expectation') {
        const ctx = canvas.getContext('2d');
        const w = canvas._logicalWidth || canvas.width;
        const h = canvas._logicalHeight || canvas.height;
        const dpr = canvas._logicalWidth ? canvas.width / canvas._logicalWidth : 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        canvas._vbdDetail = detail;

        if (!detail || !detail.actions || detail.actions.length === 0) {
            this._drawEmpty(ctx, w, h, colors, stateName, stateId, images);
            return;
        }

        const L = this._layout(canvas, detail);

        // Edges pass - drawn before any node so nodes always sit on top of every edge touching them.
        detail.actions.forEach(action => {
            const anchor = L.actionAnchors.get(action.actionId);
            const ay = anchor.ay;
            ctx.save();
            // No state->action edge highlight while an action's Q is being computed (removed per
            // feedback - vis.qActionId is still tracked, just no longer rendered any differently).
            // The branch DOES highlight green once the winning action is determined, matching the
            // node's own green "best" treatment - both gated to runMode === 'optimal' (see isBest
            // below, computed the same way the nodes pass computes its own).
            const isBestBranch = vis.best && runMode === 'optimal' && action.actionId === detail.bestActionId;
            ctx.strokeStyle = isBestBranch ? colors.best : colors.default;
            ctx.lineWidth = isBestBranch ? 3 : 2;
            ctx.beginPath(); ctx.moveTo(L.stateX, L.stateY); ctx.lineTo(L.actionX, ay); ctx.stroke();

            // pi(a|s) on the state->action edge - only while the expected value is being combined.
            if (vis.policyPhase && action.pi != null) {
                ctx.save();
                ctx.fillStyle = colors.pi;
                ctx.font = `600 11px ${VBD_MONO_FAMILY}`;
                this._edgeText(ctx, `π = ${action.pi.toFixed(2)}`, L.stateX, L.stateY, L.actionX, ay, 0.5, -5);
                ctx.restore();
            }

            action.transitions.forEach((t, idx) => {
                const key = anchor.keyStart + idx;
                const an = L.anchors.get(key);
                const hot = vis.edgesHot && vis.activeKey === key;
                if (hot) {
                    ctx.save();
                    ctx.strokeStyle = ColorUtils.applyAlpha(colors.highlighted, 22);
                    ctx.lineWidth = 12 + 4 * t.probability;
                    ctx.beginPath(); ctx.moveTo(L.actionX, ay); ctx.lineTo(an.tx, an.ty); ctx.stroke();
                    ctx.restore();
                }
                ctx.strokeStyle = hot ? colors.highlighted : this._rewardColor(t.reward, colors.minReward, colors.maxReward, colors);
                ctx.lineWidth = 1 + 4 * t.probability;
                ctx.beginPath(); ctx.moveTo(L.actionX, ay); ctx.lineTo(an.tx, an.ty); ctx.stroke();
            });
            ctx.restore();
        });

        // Nodes + labels pass.
        detail.actions.forEach(action => {
            const anchor = L.actionAnchors.get(action.actionId);
            const ay = anchor.ay;
            // Gated to runMode === 'optimal' - in 'expectation' mode detail.bestActionId just
            // marks whichever action the configured policy favors most, not a true argmax, so the
            // green "winner" treatment (node fill, bold/yellow Q label, star) would overstate it.
            // Only when actually computing the optimal policy (Find Optimal pi) does "best" mean
            // an actual argmax worth highlighting.
            const isBest = vis.best && runMode === 'optimal' && action.actionId === detail.bestActionId;
            this._drawNodeWithImage(ctx, L.actionX, ay, VBD_ACTION_RADIUS, isBest ? colors.best : colors.action, action.actionName, images[action.actionId], colors);

            if (vis.revealedQ.has(action.actionId)) {
                ctx.fillStyle = isBest ? colors.live : colors.result;
                ctx.font = isBest ? `bold 17px ${VBD_FONT_FAMILY}` : `17px ${VBD_FONT_FAMILY}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                const star = isBest ? ' ★' : '';
                ctx.fillText(`Q = ${this._fmt(action.qValue)}${star}`, L.actionX, ay - VBD_ACTION_RADIUS - 24);
            }

            action.transitions.forEach((t, idx) => {
                const key = anchor.keyStart + idx;
                const an = L.anchors.get(key);
                const ty = an.ty;
                this._drawNodeWithImage(ctx, an.tx, ty, VBD_ACTION_RADIUS, colors.state, t.nextStateName, images[t.nextState], colors, true);

                const arrived = vis.arrived.has(key);
                const isCurrent = vis.activeKey === key;
                const highlightTri = isCurrent && vis.activePhase === 'highlight';
                const landed = vis.landedTrees && vis.landedTrees.has(key);
                const showTree = landed || arrived || (isCurrent && vis.activePhase === 'highlight');
                if (showTree) {
                    const alpha = highlightTri ? 1 : 0.97;
                    this._ghostSubtree(ctx, an.anchorX, ty, priorValues[t.nextState] ?? 0, alpha, t.nextState, graph, colors);
                }

                if (isCurrent || arrived) {
                    const hotR = vis.hotReward === key;
                    ctx.save();
                    ctx.globalAlpha *= (isCurrent || hotR ? 1 : 0.8);
                    ctx.font = `600 ${hotR ? '11px' : '10px'} ${VBD_MONO_FAMILY}`;
                    const showTerm = arrived;
                    const txt = isCurrent && !arrived
                        ? `r = ${t.reward > 0 ? '+' : t.reward < 0 ? '−' : ''}${Math.abs(t.reward).toFixed(2)}`
                        : showTerm ? this._fmt(t.term) : null;
                    if (txt != null) {
                        let ang = Math.atan2(an.ty - an.actionY, an.tx - an.actionX);
                        if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
                        const wTxt = ctx.measureText(txt).width;
                        ctx.translate(an.labelX, an.labelY); ctx.rotate(ang);
                        ctx.fillStyle = colors.backplate;
                        ctx.beginPath();
                        ctx.roundRect(-wTxt / 2 - 5, -9, wTxt + 10, 18, 4);
                        ctx.fill();
                        if (hotR) {
                            ctx.strokeStyle = this._rewardColor(t.reward, colors.minReward, colors.maxReward, colors);
                            ctx.lineWidth = 1.5;
                            ctx.stroke();
                        }
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillStyle = isCurrent && !arrived ? this._rewardColor(t.reward, colors.minReward, colors.maxReward, colors) : colors.term;
                        ctx.fillText(txt, 0, 0);
                    }
                    ctx.restore();
                }
            });
        });

        this._drawNodeWithImage(ctx, L.stateX, L.stateY, VBD_STATE_RADIUS, colors.state, stateName, images[stateId], colors);

        ctx.fillStyle = colors.result;
        ctx.font = `14px ${VBD_FONT_FAMILY}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.globalAlpha = 0.6;
        ctx.fillText('t = k−1', L.transX, h - 8);
        ctx.globalAlpha = 1;
    },

    // Draws text rotated parallel to the edge it labels, kept upright (flipped 180deg rather than
    // ever rendering upside-down), offset perpendicular by a signed pixel amount. Ported from
    // vi-engine.js's `edgeText()`. Used for the pi(a|s) label on state->action edges (the only
    // caller today - promote to GeometricHelper.js if a second one appears).
    _edgeText(ctx, text, x1, y1, x2, y2, at, perp) {
        let ang = Math.atan2(y2 - y1, x2 - x1);
        if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
        const px = x1 + (x2 - x1) * at, py = y1 + (y2 - y1) * at;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.textAlign = 'center';
        ctx.textBaseline = perp < 0 ? 'bottom' : 'top';
        ctx.fillText(text, 0, perp);
        ctx.restore();
    },

    // GHOST SUBTREE: a faded copy of s'own backup tree hangs off the node - Vt(s') IS a
    // collapsed computation from the prior sweep, and this shows it as such, instead of an
    // unexplained plain triangle marker. Up to 3 actions as short lines+dots, up to 2 outcomes per
    // action one level fainter; terminal states (no actions) get a fading tail instead. Value text
    // colored by sign. Ported from vi-engine.js's `BackupDiagram._triangle()`, then enlarged/
    // brightened (VBD_GHOST_SCALE, VBD_GHOST_BRANCH_ALPHA/OUTCOME_ALPHA) past the prototype's own
    // tiny/faint original sizing for legibility at this diagram's actual on-screen scale.
    _ghostSubtree(ctx, x, y, value, alpha, stateId, graph, colors) {
        ctx.save();
        ctx.globalAlpha *= alpha;
        const s = VBD_GHOST_SCALE;
        const col = this._signColor(value, colors);
        const st = graph && stateId != null ? graph.getNodeById(stateId) : null;
        const actions = st && st.actions ? st.actions.map(id => graph.getNodeById(id)).filter(Boolean).slice(0, 3) : [];
        const branchColor = ColorUtils.applyAlpha(colors.edgeGray, VBD_GHOST_BRANCH_ALPHA);
        const outcomeColor = ColorUtils.applyAlpha(colors.edgeGray, VBD_GHOST_OUTCOME_ALPHA);
        const x0 = x + 2 * s;
        if (actions.length) {
            const n = actions.length;
            actions.forEach((a, i) => {
                const ay = y + (i - (n - 1) / 2) * 10 * s;
                ctx.strokeStyle = branchColor; ctx.lineWidth = 1.4;
                ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 10 * s, ay); ctx.stroke();
                ctx.fillStyle = branchColor;
                ctx.beginPath(); ctx.arc(x0 + 11.5 * s, ay, 2 * s, 0, Math.PI * 2); ctx.fill();
                const trs = (a.sas || []).slice(0, 2);
                trs.forEach((t, j) => {
                    const ty2 = ay + (j - (trs.length - 1) / 2) * 7 * s;
                    ctx.strokeStyle = outcomeColor; ctx.lineWidth = 1.4;
                    ctx.beginPath(); ctx.moveTo(x0 + 13.5 * s, ay); ctx.lineTo(x0 + 21 * s, ty2); ctx.stroke();
                    ctx.fillStyle = outcomeColor;
                    ctx.beginPath(); ctx.arc(x0 + 22.5 * s, ty2, 1.4 * s, 0, Math.PI * 2); ctx.fill();
                });
            });
        } else {
            const grad = ctx.createLinearGradient(x0, y, x0 + 18 * s, y);
            grad.addColorStop(0, branchColor);
            grad.addColorStop(1, ColorUtils.applyAlpha(colors.edgeGray, 0));
            ctx.strokeStyle = grad; ctx.lineWidth = 1.5 * s;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + 18 * s, y); ctx.stroke();
        }
        ctx.font = `600 ${Math.round(12 * s)}px ${VBD_MONO_FAMILY}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = col;
        ctx.fillText(this._fmt(value), x0 + 29 * s, y);
        ctx.restore();
    },

    _signColor(value, colors) {
        if (Math.abs(value) < 1e-9) return colors.muted;
        return value >= 0 ? colors.positive : colors.negative;
    },

    // Small inline-SVG replica of the ghost subtree, used as the flying chip's body during the
    // value flight (ViStatesView._flyPriorValue() -> here, since that's the one flight whose
    // ORIGIN lives outside this file's own DOM - a prior card in an older sweep's section).
    // Ported from vi-engine.js's `_treeChipHTML()`, scaled/brightened to match _ghostSubtree()'s
    // own enlarged sizing (VBD_GHOST_SCALE) so the flying chip and the marker it lands on/becomes
    // don't visibly jump in size.
    treeChipSVG(stateId, value, graph, colors) {
        const st = graph && stateId != null ? graph.getNodeById(stateId) : null;
        const actions = st && st.actions ? st.actions.slice(0, 3) : [];
        const s = VBD_GHOST_SCALE;
        const col = this._signColor(value, colors);
        const branchColor = ColorUtils.applyAlpha(colors.edgeGray, VBD_GHOST_BRANCH_ALPHA);
        const outcomeColor = ColorUtils.applyAlpha(colors.edgeGray, VBD_GHOST_OUTCOME_ALPHA);
        const w = Math.round(26 * s), h = Math.round(28 * s);
        let branches = '';
        if (actions.length) {
            actions.forEach((aid, i) => {
                const ay = (14 + (i - (actions.length - 1) / 2) * 10 * s).toFixed(1);
                const x12 = (12 * s).toFixed(1), x13_5 = (13.5 * s).toFixed(1), x15_5 = (15.5 * s).toFixed(1);
                const x22 = (22 * s).toFixed(1), x23 = (23 * s).toFixed(1), yLo = (Number(ay) - 3 * s).toFixed(1), yHi = (Number(ay) + 3 * s).toFixed(1);
                branches += `<line x1="2" y1="14" x2="${x12}" y2="${ay}" stroke="${branchColor}" stroke-width="1.4"/><circle cx="${x13_5}" cy="${ay}" r="${(2 * s).toFixed(1)}" fill="${branchColor}"/><line x1="${x15_5}" y1="${ay}" x2="${x22}" y2="${yLo}" stroke="${outcomeColor}" stroke-width="1.4"/><line x1="${x15_5}" y1="${ay}" x2="${x22}" y2="${yHi}" stroke="${outcomeColor}" stroke-width="1.4"/><circle cx="${x23}" cy="${yLo}" r="${(1.4 * s).toFixed(1)}" fill="${outcomeColor}"/><circle cx="${x23}" cy="${yHi}" r="${(1.4 * s).toFixed(1)}" fill="${outcomeColor}"/>`;
            });
        } else {
            branches = `<line x1="2" y1="14" x2="${(20 * s).toFixed(1)}" y2="14" stroke="${branchColor}" stroke-width="1.5"/>`;
        }
        return `<span style="display:inline-flex;align-items:center;gap:2px;"><svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="overflow:visible">${branches}</svg><span style="color:${col};font-size:${(1 + (s - 1) * 0.4).toFixed(2)}em">${this._fmt(value)}</span></span>`;
    },

    // --- Fly overlay (self-contained flights that originate/land within this file's own DOM -
    // reward/probability/pi/Q. The cross-card value flight stays driven by ViStatesView, which
    // owns the ORIGIN card's page position - see treeChipSVG() above). Lazily-created, shared
    // position:fixed overlay, mirroring viStatesView.js's own _ensureFlyOverlay() convention.

    _ensureFlyOverlay() {
        if (_flyOverlayEl && document.body.contains(_flyOverlayEl)) return _flyOverlayEl;
        const overlay = document.createElement('div');
        overlay.className = 'vi-backup-diagram-fly-overlay';
        document.body.appendChild(overlay);
        _flyOverlayEl = overlay;
        return overlay;
    },

    // toDestination: either a DOM element (its center rect is used) or a plain {x, y} page point.
    // Returns a handle with cancel() so drawAnimated()'s own cancel() can force-cleanup any chip
    // still in flight when a reveal is cancelled mid-flight (Skip/Reset).
    _fly(fromPagePoint, toDestination, text, durationMs, color, html) {
        if (!toDestination) return null;
        const overlay = this._ensureFlyOverlay();
        const chip = document.createElement('div');
        if (html) chip.innerHTML = html; else chip.textContent = text;
        chip.className = 'vi-backup-diagram-fly-chip';
        chip.style.color = color;
        chip.style.left = fromPagePoint.x + 'px';
        chip.style.top = fromPagePoint.y + 'px';
        chip.style.transitionDuration = Math.max(1, durationMs) + 'ms';
        overlay.appendChild(chip);

        const toRect = typeof toDestination.getBoundingClientRect === 'function'
            ? toDestination.getBoundingClientRect() : null;
        const toX = toRect ? toRect.left + toRect.width / 2 : toDestination.x;
        const toY = toRect ? toRect.top + toRect.height / 2 : toDestination.y;

        let settled = false;
        const cleanup = () => {
            if (settled) return;
            settled = true;
            chip.removeEventListener('transitionend', onTransitionEnd);
            clearTimeout(fallback);
            chip.remove();
        };
        const onTransitionEnd = (e) => { if (e.target === chip) cleanup(); };
        chip.addEventListener('transitionend', onTransitionEnd);
        const fallback = setTimeout(cleanup, durationMs + 150);

        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (settled) return;
            chip.classList.add('vi-backup-diagram-fly-chip--flying');
            chip.style.left = toX + 'px';
            chip.style.top = toY + 'px';
        }));

        return { cancel: cleanup };
    },

    // --- Node/image drawing (unchanged from before this redesign) ---

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

    // Same reward->color mapping as EdgeViewModel's own - kept here as a plain pure function
    // (rather than importing/instantiating an EdgeViewModel, which needs a real EdgeObj) so an
    // action->outcome edge here looks identical to the same transition's real edge in Graph view.
    _rewardColor(reward, minReward, maxReward, colors) {
        if (reward === 0) return colors.muted;
        if (reward > 0) {
            const intensity = maxReward === 0 ? 0 : reward / maxReward;
            const saturation = Math.round(10 + 80 * intensity);
            return `hsl(140, ${saturation}%, 45%)`;
        }
        const intensity = minReward === 0 ? 0 : Math.abs(reward / minReward);
        const saturation = Math.round(10 + 80 * intensity);
        return `hsl(0, ${saturation}%, 50%)`;
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

// Native (Canvas2D-drawable) image cache, keyed by URL - shared across every diagram instance
// since the same state/action photo commonly reappears across many sweeps/cards. Unchanged from
// before this redesign.
const _imageCache = new Map();
let _onImageLoaded = null;
// Lazily-created, shared position:fixed overlay for this file's own reward/probability/pi/Q
// flights - see ViBackupDiagram._ensureFlyOverlay().
let _flyOverlayEl = null;
