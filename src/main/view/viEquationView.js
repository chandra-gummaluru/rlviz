// src/main/view/viEquationView.js
// New right-pane view for Values -> Iteration's 3 split quadrants (2026-07-17 redesign): replaces
// the live MDP graph BY DEFAULT (see viRightViewPill.js for the toggle back to Graph). Shows the
// active state's (ValueIterationViewModel.activeStateId, set by clicking a card in the left
// pane's States view) Bellman equation header, an animated step-by-step reveal of how its Q-values
// were computed (highlight V -> show each outcome's reward -> show its transition probability ->
// tween/merge both into that action's Q -> highlight the best action), and a Q-table scoped to
// just that state's own actions.
//
// The reveal is a bespoke animation distinct from viBackupDiagram.js's simpler staged reveal (used
// by the left pane's diagram cards) - this view's whole point is showing the ARITHMETIC building
// up (reward and probability as separate visual elements converging into Q), not just nodes
// appearing one at a time. Driven by requestAnimationFrame + elapsed wall-clock time (Date.now()),
// not p5's own frame loop (this is a plain DOM/Canvas2D component, same family as
// viChartView.js/viStatesView.js, not a p5.js draw() participant).
const VEV_CANVAS_W = 420;
const VEV_CANVAS_H = 220;
const VEV_PADDING = 14;
const VEV_STATE_RADIUS = 18;
const VEV_ACTION_RADIUS = 13;

const VEV_PHASE_HIGHLIGHT_MS = 600;
const VEV_PHASE_REWARDS_MS = 600;
const VEV_PHASE_PROBS_SHOW_MS = 250;
const VEV_PHASE_PROBS_TWEEN_MS = 500;
const VEV_PHASE_PROBS_SETTLE_MS = 150;
const VEV_PHASE_PROBS_MS = VEV_PHASE_PROBS_SHOW_MS + VEV_PHASE_PROBS_TWEEN_MS + VEV_PHASE_PROBS_SETTLE_MS;
const VEV_PHASE_BEST_MS = 600;
const VEV_TOTAL_MS = VEV_PHASE_HIGHLIGHT_MS + VEV_PHASE_REWARDS_MS + VEV_PHASE_PROBS_MS + VEV_PHASE_BEST_MS;

class ViEquationView {
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;

        this.containerEl = null;
        this._headerEl = null;
        this._canvas = null;
        this._qtableBodyEl = null;
        this._bounds = null;

        this._rafHandle = null;
        this._lastKey = null; // `${stateId}:${sweepIndex}` last rendered/animated, for replay-vs-hold
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-equation-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const header = document.createElement('div');
        header.className = 'vi-equation-view-header';
        container.appendChild(header);
        this._headerEl = header;

        const canvas = document.createElement('canvas');
        canvas.width = VEV_CANVAS_W;
        canvas.height = VEV_CANVAS_H;
        canvas.className = 'vi-equation-view-canvas';
        container.appendChild(canvas);
        this._canvas = canvas;

        const caption = document.createElement('span');
        caption.className = 'vi-chart-view-caption';
        caption.textContent = 'This state’s actions';
        container.appendChild(caption);

        const qtableBody = document.createElement('div');
        qtableBody.className = 'vi-equation-view-qtable';
        container.appendChild(qtableBody);
        this._qtableBodyEl = qtableBody;

        this.hide();
    }

    // x, y, width, height: the right pane's full box, same convention as viChartView.js's
    // updateBounds().
    updateBounds(x, y, width, height) {
        this._bounds = { x, y, width, height };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        const { x, y, width, height } = this._bounds;
        this.containerEl.style.left = x + 'px';
        this.containerEl.style.top = y + 'px';
        this.containerEl.style.width = width + 'px';
        this.containerEl.style.height = height + 'px';
    }

    // Re-renders whenever the active state or previewed sweep changes; safe to call on every VI
    // lifecycle event the same way ViStatesView/ViChartView's own refresh() hooks already are.
    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        const stateId = this.viViewModel.activeStateId;
        if (stateId === null || stateId === undefined) {
            this._renderPlaceholder();
            return;
        }

        const sweepIndex = this.viViewModel.previewedSweepIndex ?? this.viState.currentSweepIndex;
        const key = `${stateId}:${sweepIndex}`;
        const forceReplay = key !== this._lastKey;
        this._lastKey = key;

        const stateName = this.viState.stateNames[stateId] || `S${stateId}`;
        this._headerEl.innerHTML = KatexRenderer.render(this._formatHeader(stateName, sweepIndex), true);

        const detail = this.viState.getBackupDetail(sweepIndex, stateId);
        const priorValues = sweepIndex > 0 ? this.viState.getValues(sweepIndex - 1) : this.viState.getValues(0);
        const colors = {
            state: AppPalette.node.state,
            action: AppPalette.node.action,
            best: AppPalette.valueIteration.best,
            result: AppPalette.valueIteration.result
        };

        this._cancelReveal();
        if (forceReplay) {
            this._startReveal(detail, priorValues, colors, stateName);
        } else {
            this._renderFrame(detail, priorValues, colors, stateName, VEV_TOTAL_MS);
        }

        const { rows } = ChartDataBuilders.buildQTableRowForState(this.viState, stateId, sweepIndex);
        this._renderQTable(rows);
    }

    _renderPlaceholder() {
        this._cancelReveal();
        this._lastKey = null;
        this._headerEl.innerHTML = '';
        const ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._qtableBodyEl.innerHTML =
            '<div class="chart-dock-empty">Click a state’s card to see its calculation.</div>';
    }

    _renderQTable(rows) {
        this._qtableBodyEl.innerHTML = '';
        if (!rows || rows.length === 0) {
            this._qtableBodyEl.innerHTML = '<div class="chart-dock-empty">no actions</div>';
            return;
        }
        const table = document.createElement('table');
        table.className = 'chart-dock-qtable';
        rows.forEach(a => {
            const tr = document.createElement('tr');
            const tdA = document.createElement('td');
            tdA.textContent = a.actionName;
            tr.appendChild(tdA);
            const tdQ = document.createElement('td');
            tdQ.textContent = a.qValue.toFixed(2) + (a.isBest ? ' ★' : '');
            if (a.isBest) tdQ.classList.add('chart-dock-qtable-best');
            tr.appendChild(tdQ);
            table.appendChild(tr);
        });
        this._qtableBodyEl.appendChild(table);
    }

    _formatHeader(stateName, sweepIndex) {
        const s = KatexRenderer.escapeText(stateName);
        const accentNs = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability).paletteNamespace;
        const accent = (AppPalette[accentNs] && AppPalette[accentNs].result) || AppPalette.text.medium;
        return `V^{${sweepIndex}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + \\gamma \\textcolor{${accent}}{V^{${sweepIndex - 1}}(s')}\\bigr]`;
    }

    // --- Reveal engine ---

    _startReveal(detail, priorValues, colors, stateName) {
        const startTime = Date.now();
        const tick = () => {
            const elapsed = Math.min(Date.now() - startTime, VEV_TOTAL_MS);
            this._renderFrame(detail, priorValues, colors, stateName, elapsed);
            if (elapsed < VEV_TOTAL_MS) {
                this._rafHandle = requestAnimationFrame(tick);
            } else {
                this._rafHandle = null;
            }
        };
        tick();
    }

    _cancelReveal() {
        if (this._rafHandle) {
            cancelAnimationFrame(this._rafHandle);
            this._rafHandle = null;
        }
    }

    _computePhase(elapsedMs) {
        const t1 = VEV_PHASE_HIGHLIGHT_MS;
        const t2 = t1 + VEV_PHASE_REWARDS_MS;
        const t3 = t2 + VEV_PHASE_PROBS_MS;
        const t4 = t3 + VEV_PHASE_BEST_MS;
        if (elapsedMs < t1) return { phase: 'highlight_value', localT: elapsedMs / t1 };
        if (elapsedMs < t2) return { phase: 'show_rewards', localT: (elapsedMs - t1) / VEV_PHASE_REWARDS_MS };
        if (elapsedMs < t3) {
            const local = elapsedMs - t2;
            if (local < VEV_PHASE_PROBS_SHOW_MS) {
                return { phase: 'show_probabilities', sub: 'show', localT: local / VEV_PHASE_PROBS_SHOW_MS };
            }
            if (local < VEV_PHASE_PROBS_SHOW_MS + VEV_PHASE_PROBS_TWEEN_MS) {
                return {
                    phase: 'show_probabilities', sub: 'tween',
                    localT: (local - VEV_PHASE_PROBS_SHOW_MS) / VEV_PHASE_PROBS_TWEEN_MS
                };
            }
            return { phase: 'show_probabilities', sub: 'settle', localT: 1 };
        }
        if (elapsedMs < t4) return { phase: 'select_best', localT: (elapsedMs - t3) / VEV_PHASE_BEST_MS };
        return { phase: 'done', localT: 1 };
    }

    _renderFrame(detail, priorValues, colors, stateName, elapsedMs) {
        const ctx = this._canvas.getContext('2d');
        const w = this._canvas.width, h = this._canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (!detail || !detail.actions || detail.actions.length === 0) {
            ctx.fillStyle = colors.action;
            ctx.font = '11px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('no actions', w / 2, h / 2);
            return;
        }

        const info = this._computePhase(elapsedMs);
        const stateX = VEV_PADDING + VEV_STATE_RADIUS;
        const stateY = h / 2;
        const actionX = w * 0.42;
        const transX = w * 0.75;

        const rows = [];
        detail.actions.forEach(action => action.transitions.forEach(t => rows.push({ action, transition: t })));
        const rowCount = Math.max(rows.length, 1);
        const rowH = (h - 2 * VEV_PADDING) / rowCount;

        let rowCursor = 0;
        const actionPositions = new Map();
        detail.actions.forEach(action => {
            const span = Math.max(action.transitions.length, 1);
            actionPositions.set(action.actionId, VEV_PADDING + (rowCursor + span / 2) * rowH);
            rowCursor += span;
        });

        const showRewards = info.phase !== 'highlight_value';
        const showProbs = info.phase === 'show_probabilities' || info.phase === 'select_best' || info.phase === 'done';
        const tweening = info.phase === 'show_probabilities' && info.sub === 'tween';
        const tweenT = tweening ? EasingUtils.easeInOut(info.localT)
            : (info.phase === 'select_best' || info.phase === 'done'
                || (info.phase === 'show_probabilities' && info.sub === 'settle') ? 1 : 0);
        const qRevealed = info.phase === 'select_best' || info.phase === 'done';
        const bestRevealed = info.phase === 'done' || (info.phase === 'select_best' && info.localT > 0.3);

        const pulse = info.phase === 'highlight_value' ? Math.sin(info.localT * Math.PI) * 3 : 0;
        this._circle(ctx, stateX, stateY, VEV_STATE_RADIUS + pulse, colors.state);
        this._label(ctx, stateX, stateY, stateName, colors.state);

        let rowIdx = 0;
        detail.actions.forEach(action => {
            const ay = actionPositions.get(action.actionId);
            const isBest = action.actionId === detail.bestActionId;
            const dim = bestRevealed && !isBest;
            ctx.globalAlpha = dim ? 0.4 : 1;

            ctx.strokeStyle = colors.action;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(stateX, stateY);
            ctx.lineTo(actionX, ay);
            ctx.stroke();
            const actionFill = (bestRevealed && isBest) ? colors.best : colors.action;
            this._circle(ctx, actionX, ay, VEV_ACTION_RADIUS, actionFill);
            this._label(ctx, actionX, ay, action.actionName, actionFill);

            if (qRevealed) {
                ctx.fillStyle = (bestRevealed && isBest) ? colors.best : colors.result;
                ctx.font = (bestRevealed && isBest) ? 'bold 12px monospace' : '11px monospace';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(`Q = ${action.qValue.toFixed(2)}${(bestRevealed && isBest) ? ' ★' : ''}`,
                    actionX, ay - VEV_ACTION_RADIUS - 10);
            }

            action.transitions.forEach(t => {
                const ty = VEV_PADDING + (rowIdx + 0.5) * rowH;
                rowIdx += 1;

                ctx.strokeStyle = colors.action;
                ctx.beginPath();
                ctx.moveTo(actionX, ay);
                ctx.lineTo(transX, ty);
                ctx.stroke();

                ctx.save();
                ctx.setLineDash([4, 3]);
                this._circle(ctx, transX, ty, VEV_ACTION_RADIUS, colors.state, true);
                ctx.restore();
                this._label(ctx, transX, ty, t.nextStateName, colors.state);

                if (showRewards) {
                    const originX = transX + VEV_ACTION_RADIUS + 10;
                    const rOriginY = ty - 7;
                    const pOriginY = ty + 7;
                    const qAnchorX = actionX;
                    const qAnchorY = ay - VEV_ACTION_RADIUS - 10;

                    const rX = originX + (qAnchorX - originX) * tweenT;
                    const rY = rOriginY + (qAnchorY - rOriginY) * tweenT;
                    const fadeOut = tweenT > 0.6 ? Math.max(0, 1 - (tweenT - 0.6) / 0.4) : 1;

                    ctx.globalAlpha = (dim ? 0.4 : 1) * fadeOut;
                    ctx.fillStyle = colors.result;
                    ctx.font = '9px monospace';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`R=${t.reward.toFixed(2)}`, rX, rY);

                    if (showProbs) {
                        const pX = originX + (qAnchorX - originX) * tweenT;
                        const pY = pOriginY + (qAnchorY - pOriginY) * tweenT;
                        ctx.fillText(`P=${t.probability.toFixed(2)}`, pX, pY);
                    }
                    ctx.globalAlpha = dim ? 0.4 : 1;
                }
            });
            ctx.globalAlpha = 1;
        });

        if (rows.length > 0) {
            ctx.fillStyle = colors.result;
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.globalAlpha = 0.6;
            ctx.fillText('t = k−1 (prior sweep)', transX, h - 8);
            ctx.globalAlpha = 1;
        }
    }

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
    }

    _label(ctx, x, y, name, fill) {
        ctx.fillStyle = ColorUtils.contrastText(fill);
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y);
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
        this._cancelReveal();
    }
}
