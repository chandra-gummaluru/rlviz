// Inline Q-table + Convergence charts for Iteration's left pane "Chart" view (Phase 3b
// follow-on) - a real DOM component (like expectationChartView.js, not a p5-canvas overlay),
// layered over the canvas region mainView.js's VI draw dispatch leaves for the left pane when
// leftView === 'chart'. Fixed layout (Q-table on top, Convergence below), matching
// ExpectationChartView's own established simplification (no per-slot picker). Reuses
// ChartDataBuilders' existing pure functions verbatim - no new chart math here, only a new
// render target. Applies to all 3 split quadrants (unlike the States view's backup diagram,
// which is known:full-only) - Q-table and convergence data are equally real for Belief
// Iteration and PO Q-Learning.
class ViChartView {
    // policyLogDeps: same shape as ExpectationChartView's own (policy-logging.md) - shares the
    // SAME policyEvaluationState/expectationViewModel instances MC's chart view already holds
    // (hiddenPolicyIds/hoveredPolicyId deliberately live on ExpectationViewModel, not duplicated
    // per view, so a policy hidden/hovered from either pane stays that way in both), and the same
    // onLogPolicy callback (main.js's onEvaluatePolicy) the toolbar's own "Evaluate π" button uses.
    constructor(canvasViewModel, valueIterationState, expectationState, policyLogDeps = {}) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.expectationState = expectationState;
        this.policyEvaluationState = policyLogDeps.policyEvaluationState || null;
        this.expectationViewModel = policyLogDeps.expectationViewModel || null;
        this.onLogPolicy = policyLogDeps.onLogPolicy || null;

        this.containerEl = null;
        this._chipStripEl = null;
        this._qtableBodyEl = null;
        this._convergenceBodyEl = null;
        this._convergenceChartInstance = null;
        this._bounds = null;

        // --- Multi-sweep Q-table state (handoff 2's own redesign) ---
        // Whether every sweep column is shown (true) or only the last two, with older ones
        // collapsed behind a clickable "... n" header cell (false, the default) - toggled by
        // clicking that header cell itself. Persists across refresh() calls (not reset per sweep).
        this._expandedAll = false;
        // Which sweep index _filled/_doneCount below track - reset whenever a NEW sweep starts,
        // so the live column starts blank again for it.
        this._doneSweep = -1;
        // stateIds whose row has already been filled (one-shot, no count-up) in the live column.
        this._filled = new Set();
        // Count of states filled so far in the live sweep - drives the convergence chart's
        // growing-fraction-of-a-segment progress (see _renderConvergence()'s own vStar-adjacent
        // teal V(S0) line).
        this._doneCount = 0;
        // Fractional sweep progress the V(S0) line is currently drawn through - k-1 + doneCount/
        // stateCount, tweened smoothly on each highlightFill() call rather than jumping.
        this._progress = 0;
        this._progressRaf = null;
        // { stateId -> td } for the LIVE column only, and { stateId -> [td, ...] } for the t-1
        // column - both rebuilt on every _renderQTable() call, read by highlightFill() to outline
        // a just-finished state's own row (yellow) and its successors' prior-sweep source cells
        // (green) for ~1s, without re-deriving DOM lookups from scratch each time.
        this._liveCellsByState = new Map();
        this._priorCellsByState = new Map();
        this._highlightTimeout = null;
    }

    // Builds one card (header row + body) - mirrors expectationChartView.js's own slot markup
    // exactly, so both Chart views share the same box treatment.
    _buildSlot(container, captionText) {
        const slot = document.createElement('div');
        slot.className = 'vi-chart-view-slot';

        const header = document.createElement('div');
        header.className = 'vi-chart-view-header';

        const caption = document.createElement('span');
        caption.className = 'vi-chart-view-caption';
        caption.textContent = captionText;
        header.appendChild(caption);

        const stat = document.createElement('span');
        stat.className = 'vi-chart-view-stat';
        header.appendChild(stat);

        slot.appendChild(header);

        const body = document.createElement('div');
        body.className = 'vi-chart-view-body';
        slot.appendChild(body);

        container.appendChild(slot);
        return { body, stat };
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-chart-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const qtable = this._buildSlot(container, 'Expected value');
        this._qtableBodyEl = qtable.body;

        // Policy log chip strip (policy-logging.md §3) - scoped to the Convergence card right
        // below it, not the Q-table above (a policy's curve overlays the convergence line, not
        // the Q-table), so it sits between the two slots rather than above both like
        // expectationChartView.js's own placement.
        const chipStrip = document.createElement('div');
        chipStrip.className = 'policy-chip-strip';
        container.appendChild(chipStrip);
        this._chipStripEl = chipStrip;

        const convergence = this._buildSlot(container, 'V̂(S₀) vs V*');
        this._convergenceBodyEl = convergence.body;

        this.hide();
    }

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

    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        this._syncSweepTracking();
        this._renderQTable();
        this._renderChipStrip();
        this._renderConvergence();
    }

    // Detects a NEW live sweep (not just a highlightFill() call) and resets the one-shot "which
    // states have filled their live column yet" tracking for it - a plain refresh() (e.g. a theme
    // toggle, or entering the Chart pane fresh) must see this reset too, not only highlightFill().
    _syncSweepTracking() {
        if (!this.viState || !this.viState.initialized) {
            this._doneSweep = -1;
            this._filled = new Set();
            this._doneCount = 0;
            this._progress = 0;
            return;
        }
        const k = this.viState.currentSweepIndex;
        if (this._doneSweep !== k) {
            this._doneSweep = k;
            this._filled = new Set();
            this._doneCount = 0;
            // Rest at "previous sweep fully drawn" rather than leaving a stale/zero progress -
            // covers both a genuine sweep transition (the new sweep's own states haven't started
            // filling yet, so the line should still show everything through k-1) AND the very
            // first refresh() of an already-computed history (e.g. reviewing a resumed run,
            // expanding an older sweep) that never went through a live highlightFill() tween at
            // all - without this, the convergence line would incorrectly start from progress 0.
            this._progress = Math.max(this._progress, k - 1);
        }
    }

    // Called once per state as its left-pane card finishes its own reveal (ViStatesView's
    // onRevealProgress({stateId, detail}) -> main.js -> here) - fills that ONE row in the live
    // column in one shot (no count-up, _renderQTable() already does that via _filled), outlines it
    // yellow, outlines the t-1 cells of its successor states green for ~1s (the values it just
    // read), and nudges the convergence chart's V(S0) line forward by one state's worth of the
    // current sweep segment. Bookkeeping (_filled/_doneCount/_progress) updates REGARDLESS of
    // whether this pane is currently visible (a live VI run keeps advancing while the user is
    // looking at States/Equation instead of Chart) - only the DOM re-render is skipped while
    // hidden, so switching to Chart later shows the fully-caught-up state via the next show()/
    // refresh() rather than a stale one that silently stopped tracking while off-screen.
    highlightFill(stateId, detail) {
        if (!this.viState || !this.viState.initialized || stateId == null) return;
        this._syncSweepTracking();
        this._filled.add(stateId);
        this._doneCount = Math.min(this._doneCount + 1, Math.max(this.viState.stateIds.length, 1));

        const from = this._progress;
        const to = Math.max(0, this.viState.currentSweepIndex - 1 + this._doneCount / Math.max(this.viState.stateIds.length, 1));

        if (!this.containerEl || this.containerEl.style.display === 'none') {
            this._progress = to;
            return;
        }

        this._renderQTable();
        this._renderChipStrip();
        this._tweenProgress(from, to, 360);
        this._applyFillHighlight(stateId, detail);
    }

    // A small local rAF tween (this view has no RevealTimeline of its own - it's a passive
    // display reacting to ViStatesView's own reveal, not driving one) - mirrors the prototype's
    // own `tl.tween(360, e => panel.setProgress(...))` call.
    _tweenProgress(from, to, ms) {
        if (this._progressRaf) cancelAnimationFrame(this._progressRaf);
        const start = performance.now();
        const tick = (now) => {
            const t = Math.min(1, (now - start) / ms);
            this._progress = from + (to - from) * EasingUtils.easeInOut(t);
            this._renderConvergence();
            if (t < 1) {
                this._progressRaf = requestAnimationFrame(tick);
            } else {
                this._progressRaf = null;
            }
        };
        this._progressRaf = requestAnimationFrame(tick);
    }

    // Outlines the just-filled state's own live-column cells yellow, and the t-1 cells of every
    // state its actions transition into green (full opacity) - both fade back after ~1s. Ported
    // from vi-engine.js's `ChartPanel.highlightFill()`.
    _applyFillHighlight(stateId, detail) {
        clearTimeout(this._highlightTimeout);
        const hot = [];
        (this._liveCellsByState.get(stateId) || new Map()).forEach(td => {
            td.classList.add('vi-chart-view-qtable-cell--hot-live');
            hot.push(td);
        });
        const seenNext = new Set();
        ((detail && detail.actions) || []).forEach(a => (a.transitions || []).forEach(t => {
            if (seenNext.has(t.nextState)) return;
            seenNext.add(t.nextState);
            (this._priorCellsByState.get(t.nextState) || []).forEach(td => {
                td.classList.add('vi-chart-view-qtable-cell--hot-source');
                td.classList.remove('vi-chart-view-qtable-cell--dim');
                hot.push(td);
            });
        }));
        this._highlightTimeout = setTimeout(() => {
            hot.forEach(td => {
                td.classList.remove('vi-chart-view-qtable-cell--hot-live');
                if (td.classList.contains('vi-chart-view-qtable-cell--hot-source')) {
                    td.classList.remove('vi-chart-view-qtable-cell--hot-source');
                    td.classList.add('vi-chart-view-qtable-cell--dim');
                }
            });
        }, 1000);
    }

    // Thin wrapper around the shared PolicyChartOverlay.renderChipStrip() - see
    // expectationChartView.js's identical wrapper for the full rationale (incl. why hover
    // deliberately re-renders only _renderConvergence(), not a full refresh()).
    _renderChipStrip() {
        PolicyChartOverlay.renderChipStrip(this._chipStripEl, {
            policyEvaluationState: this.policyEvaluationState,
            expectationViewModel: this.expectationViewModel,
            onLogPolicy: this.onLogPolicy,
            onToggle: () => this.refresh(),
            onHover: () => this._renderConvergence()
        });
    }

    // Multi-sweep-column "Expected value" table (handoff 2 §4) - one Q column per sweep, `t = 0`
    // the all-zero init column, newest on the right; only the last two stay expanded, older
    // collapse behind a clickable "... n" header cell. Greedy action per column gets teal + star.
    // The live column's cells stay blank until that state's own left-pane card finishes
    // (highlightFill() fills the row in one shot, no count-up) - matches the reveal's own
    // sequential pacing instead of showing every answer up front.
    _renderQTable() {
        const body = this._qtableBodyEl;
        if (!body) return;
        body.innerHTML = '';
        this._liveCellsByState = new Map();
        this._priorCellsByState = new Map();

        const { columns, rows, cellsByColumn } = ChartDataBuilders.buildQTableColumns(this.viState);
        if (rows.length === 0 || columns.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chart-dock-empty';
            empty.textContent = 'Run Value Iteration to populate.';
            body.appendChild(empty);
            return;
        }

        const k = columns[columns.length - 1];
        const shown = this._expandedAll ? columns : columns.slice(-2);
        const hiddenCount = columns.length - shown.length;
        const showGap = hiddenCount > 0 && !this._expandedAll;

        body.style.overflowX = 'auto';
        const table = document.createElement('table');
        table.className = 'chart-dock-qtable vi-chart-view-qtable-history';

        const headRow = document.createElement('tr');
        const stateHead = document.createElement('td');
        stateHead.textContent = 'state';
        stateHead.className = 'vi-chart-view-qtable-headcell';
        headRow.appendChild(stateHead);
        const actionHead = document.createElement('td');
        actionHead.textContent = 'action';
        actionHead.className = 'vi-chart-view-qtable-headcell';
        headRow.appendChild(actionHead);
        if (showGap || this._expandedAll) {
            const gapHead = document.createElement('td');
            gapHead.textContent = this._expandedAll ? '◂' : `⋯ ${hiddenCount}`;
            gapHead.className = 'vi-chart-view-qtable-headcell vi-chart-view-qtable-gap';
            gapHead.title = this._expandedAll ? 'collapse older sweeps' : 'show all sweeps';
            gapHead.addEventListener('click', () => {
                this._expandedAll = !this._expandedAll;
                this._renderQTable();
                body.scrollLeft = body.scrollWidth;
            });
            headRow.appendChild(gapHead);
        }
        shown.forEach(t => {
            const th = document.createElement('td');
            th.textContent = `t = ${t}`;
            th.className = 'vi-chart-view-qtable-headcell vi-chart-view-qtable-headcell--num';
            if (t === k) th.classList.add('vi-chart-view-qtable-col--live');
            headRow.appendChild(th);
        });
        table.appendChild(headRow);

        rows.forEach(row => {
            const liveCells = new Map();
            const priorCells = [];
            row.actions.forEach((a, ai) => {
                const tr = document.createElement('tr');
                if (ai === 0) {
                    const tdS = document.createElement('td');
                    tdS.textContent = row.stateName;
                    tdS.rowSpan = row.actions.length;
                    tdS.className = 'chart-dock-qtable-state';
                    tr.appendChild(tdS);
                }
                const tdA = document.createElement('td');
                tdA.textContent = a.actionName;
                tr.appendChild(tdA);
                if (showGap) {
                    const gapCell = document.createElement('td');
                    gapCell.textContent = '⋯';
                    gapCell.className = 'vi-chart-view-qtable-gap-cell';
                    tr.appendChild(gapCell);
                }
                shown.forEach(t => {
                    const td = document.createElement('td');
                    td.className = 'vi-chart-view-qtable-cell';
                    const cell = cellsByColumn[t] && cellsByColumn[t][row.stateId] ? cellsByColumn[t][row.stateId][a.actionId] : null;
                    if (t === 0) {
                        td.textContent = '0.00';
                        if (k > 0) td.classList.add('vi-chart-view-qtable-cell--dim');
                    } else if (cell) {
                        // The live column stays blank until this state's card finishes on the
                        // left - see highlightFill().
                        const pending = t === k && !this._filled.has(row.stateId);
                        if (!pending) {
                            // Star only when actually computing the optimal policy - in
                            // 'expectation' mode isBest just marks whichever action the configured
                            // policy favors most, not a true argmax (the teal/bold styling below
                            // still marks it either way).
                            const star = cell.isBest && this.viState.runMode === 'optimal' ? ' ★' : '';
                            td.textContent = cell.qValue.toFixed(2) + star;
                            if (cell.isBest) td.classList.add('chart-dock-qtable-best');
                        }
                        if (t < k) td.classList.add('vi-chart-view-qtable-cell--dim');
                    }
                    if (t === k) liveCells.set(a.actionId, td);
                    if (t === k - 1) priorCells.push(td);
                    tr.appendChild(td);
                });
                table.appendChild(tr);
            });
            this._liveCellsByState.set(row.stateId, liveCells);
            this._priorCellsByState.set(row.stateId, priorCells);
        });

        body.appendChild(table);
        body.scrollLeft = body.scrollWidth; // pin to the newest sweep
    }

    _renderConvergence() {
        const body = this._convergenceBodyEl;
        if (!body) return;
        if (this._convergenceChartInstance) {
            this._convergenceChartInstance.destroy();
            this._convergenceChartInstance = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const { mcMeans, mcSEs, viValues, vStar } = ChartDataBuilders.buildConvergenceData(
            this.expectationState, this.viState);

        const visiblePolicyEntries = PolicyChartOverlay.visibleEntries(this.policyEvaluationState, this.expectationViewModel);
        const hoveredPolicyId = this.expectationViewModel ? this.expectationViewModel.hoveredPolicyId : null;

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(
            mcMeans.length, viValues.length, 1,
            ...visiblePolicyEntries.map(e => e.valueCurve.length)
        );

        // One dashed line per visible logged policy (policy-logging.md §3), shared with
        // expectationChartView.js's identical Convergence overlay - see PolicyChartOverlay.js.
        const datasets = PolicyChartOverlay.buildCurveDatasets(visiblePolicyEntries, hoveredPolicyId);
        if (mcMeans.length > 0 && mcSEs.length === mcMeans.length) {
            datasets.push({
                label: 'E[G] − SE',
                data: mcMeans.map((y, x) => ({ x, y: y - (mcSEs[x] || 0) })),
                borderColor: 'transparent', pointRadius: 0, fill: false
            });
            datasets.push({
                label: 'E[G] ± SE',
                data: mcMeans.map((y, x) => ({ x, y: y + (mcSEs[x] || 0) })),
                borderColor: 'transparent', pointRadius: 0, fill: '-1',
                backgroundColor: ColorUtils.applyAlpha(AppPalette.accent.orange, 35)
            });
        }
        if (viValues.length > 0) {
            const methodEntry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
            // Grows a FRACTION of the live sweep's segment as each state resolves (progress =
            // k-1 + doneCount/stateCount, tracked by highlightFill()/_tweenProgress()), not a
            // full column at sweep end - Chart.js has no native "grow a line's last segment
            // fractionally" primitive, so the data array itself is recomputed to end at an
            // interpolated point every tick (see _tweenProgress()) instead of asking Chart.js to
            // animate; `animation: false` below is therefore correct, not fought.
            const progress = Math.min(this._progress, viValues.length - 1);
            const full = Math.max(0, Math.floor(progress));
            const frac = progress - full;
            const viData = [];
            for (let i = 0; i <= full; i++) viData.push({ x: i, y: viValues[i] });
            if (frac > 0 && viValues[full + 1] !== undefined) {
                viData.push({ x: full + frac, y: viValues[full] + (viValues[full + 1] - viValues[full]) * frac });
            }
            datasets.push({
                label: `V (${methodEntry.pillLabel})`,
                data: viData,
                borderColor: AppPalette.accent[methodEntry.accent],
                borderWidth: 2, pointRadius: 0, tension: 0,
                _labelEndpoint: true
            });
        }
        if (mcMeans.length > 0) {
            datasets.push({
                label: 'estimate',
                data: mcMeans.map((y, x) => ({ x, y })),
                borderColor: AppPalette.accent.orange,
                borderWidth: 2, pointRadius: 0, tension: 0.3,
                _labelEndpoint: true
            });
        }
        if (vStar !== null) {
            datasets.push({
                label: `V* = ${vStar.toFixed(2)}`,
                data: [{ x: 0, y: vStar }, { x: maxLen - 1, y: vStar }],
                borderColor: AppPalette.text.muted,
                borderDash: [4, 4], borderWidth: 1, pointRadius: 0
            });
        }

        // Endpoint dot+label plugin, legend filter, and right-padding are all shared with
        // expectationChartView.js's own Convergence chart (see PolicyChartOverlay.js) - kept as
        // ONE implementation rather than two near-identical copies now that both charts overlay
        // policy curves.
        this._convergenceChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            plugins: [PolicyChartOverlay.createEndpointPlugin()],
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                layout: { padding: { right: PolicyChartOverlay.convergenceRightPadding(visiblePolicyEntries.length > 0) } },
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'end',
                        labels: {
                            boxWidth: 16, boxHeight: 2, font: { size: 10 }, color: AppPalette.text.muted,
                            filter: PolicyChartOverlay.legendFilter
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        ticks: { font: { size: 9 }, color: AppPalette.text.muted, stepSize: 1 },
                        grid: { color: AppPalette.border.chartGrid },
                        title: { display: true, text: `${maxLen} episodes`, align: 'end', font: { size: 9 }, color: AppPalette.text.muted }
                    },
                    y: { ticks: { font: { size: 9 }, color: AppPalette.text.muted }, grid: { color: AppPalette.border.chartGrid } }
                }
            }
        });
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
