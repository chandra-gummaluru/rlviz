// src/main/view/viEquationView.js
// Right-pane "Explain" view for Values -> Iteration's 3 split quadrants (handoff 2 - Values ->
// Iteration animation redesign, docs/superpowers/plans/2026-07-21-vi-animation-redesign.md Phase
// 5). Replaces this view's OLD bespoke canvas-diagram + 4-phase reveal (a second, simpler
// animation running alongside the left pane's own, much richer per-card reveal - a real
// duplication the redesign resolves) with a plain-language NARRATOR: a step label, one large
// sentence, and a formula footnote, all driven by setBeat(beat, info) - called from the SAME
// reveal that's animating the active left-pane card (ViBackupDiagram.drawAnimated()'s own onBeat
// callback, forwarded through ViStatesView -> main.js, gated there to only the card matching
// ValueIterationViewModel.activeStateId - see main.js's wiring), not a second, independent
// animation with its own clock. The scoped Q-table below stays exactly as it was - it already
// reads (activeStateId, previewedSweepIndex) correctly and isn't touched by this redesign.
class ViEquationView {
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;

        this.containerEl = null;
        this._stepEl = null;
        this._sentenceEl = null;
        this._formulaEl = null;
        this._qtableBodyEl = null;
        this._bounds = null;
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-equation-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const narrator = document.createElement('div');
        narrator.className = 'vi-equation-view-narrator';
        container.appendChild(narrator);

        const step = document.createElement('div');
        step.className = 'vi-equation-view-step';
        narrator.appendChild(step);
        this._stepEl = step;

        const sentence = document.createElement('div');
        sentence.className = 'vi-equation-view-sentence';
        narrator.appendChild(sentence);
        this._sentenceEl = sentence;

        const formula = document.createElement('div');
        formula.className = 'vi-equation-view-formula';
        narrator.appendChild(formula);
        this._formulaEl = formula;

        const caption = document.createElement('span');
        caption.className = 'vi-chart-view-caption';
        caption.textContent = 'This state’s actions';
        container.appendChild(caption);

        const qtableBody = document.createElement('div');
        qtableBody.className = 'vi-equation-view-qtable';
        container.appendChild(qtableBody);
        this._qtableBodyEl = qtableBody;

        this._idle();
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

    // Re-renders the scoped Q-table and resets the narrator to idle whenever the active state or
    // previewed sweep changes (e.g. clicking a different card) - a live reveal's own setBeat()
    // calls immediately re-drive it moments later if one is actually running for this exact state,
    // matching how the old canvas-based reveal also reset-and-replayed on activeStateId change.
    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        const stateId = this.viViewModel.activeStateId;
        this._idle();
        if (stateId === null || stateId === undefined) {
            this._qtableBodyEl.innerHTML = '<div class="chart-dock-empty">Click a state’s card to see its calculation.</div>';
            return;
        }

        const sweepIndex = this.viViewModel.previewedSweepIndex ?? this.viState.currentSweepIndex;
        const { rows } = ChartDataBuilders.buildQTableRowForState(this.viState, stateId, sweepIndex);
        this._renderQTable(rows);
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
            // Star only when actually computing the optimal policy - see viChartView.js's
            // identical gating for the full rationale.
            const star = a.isBest && this.viState.runMode === 'optimal' ? ' ★' : '';
            tdQ.textContent = a.qValue.toFixed(2) + star;
            if (a.isBest) tdQ.classList.add('chart-dock-qtable-best');
            tr.appendChild(tdQ);
            table.appendChild(tr);
        });
        this._qtableBodyEl.appendChild(table);
    }

    _idle() {
        this._stepEl.textContent = '';
        this._sentenceEl.textContent = 'Click a state’s card, then Run or Step, to walk through one Bellman backup at a time.';
        this._sentenceEl.style.color = AppPalette.text.muted;
        this._formulaEl.textContent = '';
        this._stepEl.style.color = AppPalette.text.muted;
    }

    _set(step, sentenceHtml, formulaHtml, color) {
        this._stepEl.textContent = step;
        this._stepEl.style.color = color || AppPalette.text.placeholder;
        this._sentenceEl.innerHTML = sentenceHtml;
        this._sentenceEl.style.color = AppPalette.text.primary;
        this._formulaEl.innerHTML = formulaHtml || '';
        this._formulaEl.style.color = AppPalette.text.muted;
    }

    // Called once per narration-worthy moment of the ACTIVE state's live reveal (see this file's
    // own header comment for the gating). info shapes mirror ViBackupDiagram.drawAnimated()'s own
    // onBeat() call sites exactly - {s, a, sp, v} for 'value', {s, a, sp, r} for 'reward', etc.
    // Ported verbatim (copy and color-coding) from the prototype's vi-app.js EquationView.setBeat,
    // substituting AppPalette.accent.* for the prototype's own raw hexes (Decision 1 - see the
    // plan's own Phase 0 palette audit for why this substitution is a lossless 1:1 swap in dark
    // mode). 'best' is this plan's own addition (not in the prototype/handoff at all) for
    // runMode === 'optimal' (Find Optimal π), which has no policy to narrate.
    setBeat(beat, info = {}) {
        const em = (text, color) => `<span style="color:${color}">${text}</span>`;
        if (!beat) { this._idle(); return; }

        if (beat === 'value') {
            this._set('1 · look back',
                `What was ${em(info.sp, AppPalette.accent.green)} worth in the last sweep?`,
                `V<sub>t</sub>(${info.sp}) = ${em(this._fmt(info.v), AppPalette.accent.green)} — carried over from t−1`,
                AppPalette.accent.green);
        } else if (beat === 'reward') {
            const c = info.r > 0 ? AppPalette.accent.green : info.r < 0 ? AppPalette.accent.red : AppPalette.text.muted;
            this._set('2 · collect the reward',
                `Landing in ${info.sp} via ${em(info.a, AppPalette.accent.orange)} pays ${em(this._fmt(info.r), c)}.`,
                `r = ${this._fmt(info.r)}, plus the discounted future: r + γ·V<sub>t</sub>(s′)`,
                AppPalette.accent.orange);
        } else if (beat === 'probability') {
            this._set('3 · weight by chance',
                `${em(info.a, AppPalette.accent.orange)} only leads to ${info.sp} ${em(Math.round(info.p * 100) + '%', AppPalette.text.primary)} of the time.`,
                `P(${info.s}, ${info.a}, ${info.sp}) = ${info.p.toFixed(2)} scales this outcome’s share`,
                AppPalette.text.primary);
        } else if (beat === 'q') {
            this._set('4 · value of the action',
                `Adding the weighted outcomes: choosing ${em(info.a, AppPalette.accent.orange)} from ${info.s} is worth ${em(this._fmt(info.q), AppPalette.text.primary)}.`,
                `Q(${info.s}, ${info.a}) = Σ<sub>s′</sub> P·(r + γ·V<sub>t</sub>)`,
                AppPalette.accent.orange);
        } else if (beat === 'pi') {
            this._set('5 · average over actions',
                `The policy ${em('π', AppPalette.accent.cyan)} splits its choices — so ${info.s}’s new value is the average of its Q-values.`,
                'V<sub>t+1</sub>(s) = Σ<sub>a</sub> π(a&thinsp;|&thinsp;s)·Q(s, a)',
                AppPalette.accent.cyan);
        } else if (beat === 'best') {
            // runMode === 'optimal' ending (Find Optimal π) - no policy to average over, so the
            // best action is simply picked.
            this._set('5 · pick the best action',
                `No policy to average — ${info.s} just takes whichever action scores highest: ${em(info.a, AppPalette.accent.orange)}.`,
                'V<sub>t+1</sub>(s) = max<sub>a</sub> Q(s, a)',
                AppPalette.accent.orange);
        } else if (beat === 'v') {
            this._set('done',
                `${info.s} gets its new value: ${em(this._fmt(info.v), AppPalette.accent.yellow)}.`,
                'stored as V<sub>t+1</sub> — the next sweep will look it up here',
                AppPalette.accent.yellow);
        }
    }

    _fmt(v) {
        return v >= 0 ? v.toFixed(2) : '−' + Math.abs(v).toFixed(2);
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
