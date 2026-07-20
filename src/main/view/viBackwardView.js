// Right-pane view for Values -> Iteration's known:full quadrant, offered only while a
// time-dependent (π_t) policy is active (Evaluate redesign Phase 6 - see the "Backward" entry in
// viRightViewPill.js's VI_RIGHT_VIEW_PILL_OPTIONS). Shows, for the active state
// (ValueIterationViewModel.activeStateId, same field viEquationView.js reads), every OTHER
// state's (action) pair that transitions INTO it - "for this s', which (s,a) lead here" - the
// mirror image of viEquationView's own "for this s, which actions lead OUT."
//
// Deliberately NOT an animated reveal like viEquationView.js's own 4-phase tween engine: this is
// a pure re-grouping of already-computed ValueIterationState.history data (getBackupDetail() per
// OTHER state, filtered to transitions landing on the active state) - no new domain math, so a
// static list is the honest representation, not an animation with nothing new to reveal.
class ViBackwardView {
    constructor(canvasViewModel, valueIterationState, valueIterationViewModel) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.viViewModel = valueIterationViewModel;

        this.containerEl = null;
        this._headerEl = null;
        this._rowsEl = null;
        this._bounds = null;
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-backward-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const header = document.createElement('div');
        header.className = 'vi-backward-view-header';
        container.appendChild(header);
        this._headerEl = header;

        const caption = document.createElement('span');
        caption.className = 'vi-chart-view-caption';
        caption.textContent = 'Which (s, a) lead here';
        container.appendChild(caption);

        const rows = document.createElement('div');
        rows.className = 'vi-backward-view-rows';
        container.appendChild(rows);
        this._rowsEl = rows;

        this.hide();
    }

    // x, y, width, height: the right pane's full box, same convention as viEquationView.js's
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

    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        const targetStateId = this.viViewModel.activeStateId;
        if (targetStateId === null || targetStateId === undefined) {
            this._renderPlaceholder();
            return;
        }

        const sweepIndex = this.viViewModel.previewedSweepIndex ?? this.viState.currentSweepIndex;
        const targetName = this.viState.stateNames[targetStateId] || `S${targetStateId}`;
        this._headerEl.innerHTML = KatexRenderer.render(`\\to \\text{${KatexRenderer.escapeText(targetName)}}`, true);

        const incoming = [];
        this.viState.stateIds.forEach(otherId => {
            if (otherId === targetStateId) return;
            const detail = this.viState.getBackupDetail(sweepIndex, otherId);
            if (!detail || !detail.actions) return;
            const otherName = this.viState.stateNames[otherId] || `S${otherId}`;
            detail.actions.forEach(action => {
                (action.transitions || []).forEach(tr => {
                    if (tr.nextState !== targetStateId) return;
                    incoming.push({
                        fromName: otherName,
                        actionName: action.actionName,
                        probability: tr.probability,
                        reward: tr.reward
                    });
                });
            });
        });

        this._rowsEl.innerHTML = '';
        if (incoming.length === 0) {
            this._rowsEl.innerHTML = '<div class="chart-dock-empty">no transitions lead into this state</div>';
            return;
        }
        incoming.forEach(row => {
            const rowEl = document.createElement('div');
            rowEl.className = 'vi-backward-view-row';

            const from = document.createElement('span');
            from.className = 'vi-backward-view-row-from';
            from.textContent = row.fromName;
            rowEl.appendChild(from);

            const via = document.createElement('span');
            via.className = 'vi-backward-view-row-via';
            via.textContent = `—${row.actionName}→`;
            rowEl.appendChild(via);

            const p = document.createElement('span');
            p.className = 'vi-backward-view-row-p';
            p.textContent = `p = ${row.probability.toFixed(2)}`;
            rowEl.appendChild(p);

            const r = document.createElement('span');
            r.className = 'vi-backward-view-row-r';
            r.textContent = `r = ${row.reward.toFixed(2)}`;
            rowEl.appendChild(r);

            this._rowsEl.appendChild(rowEl);
        });
    }

    _renderPlaceholder() {
        this._headerEl.innerHTML = '';
        this._rowsEl.innerHTML = '<div class="chart-dock-empty">Click a state’s card to see what leads into it.</div>';
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
