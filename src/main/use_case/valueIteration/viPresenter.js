// Escape user-controlled names for use inside LaTeX \text{} blocks
function latexEscapeText(value) {
    return String(value)
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[{}]/g, match => `\\${match}`)
        .replace(/_/g, '\\_')
        .replace(/%/g, '\\%')
        .replace(/&/g, '\\&')
        .replace(/#/g, '\\#')
        .replace(/\$/g, '\\$');
}

// Presenter for synchronous-sweep Value Iteration — translates domain sweep events into
// ViewModel / view / right-panel / chart-dock / sweep-chip updates.
class VIPresenter extends VIOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.topBar = null;
        this.rightPanel = null;
        this.chartDock = null;
        this.sweepChip = null;
    }

    get viViewModel() {
        return this.viewModel.valueIterationViewModel;
    }

    get viState() {
        return this.viewModel.valueIterationState;
    }

    setTopBar(topBar) { this.topBar = topBar; }
    setRightPanel(rightPanel) { this.rightPanel = rightPanel; }
    setChartDock(chartDock) { this.chartDock = chartDock; }
    setSweepChip(sweepChip) { this.sweepChip = sweepChip; }

    // --- Lifecycle events ---

    presentInitialized() {
        if (this.viViewModel) this.viViewModel.reset();
        this._refreshSweepChip();
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentSweepComplete(sweepIndex) {
        this._refreshSweepChip();
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentComplete() {
        if (this.viState) this.viState.isPlaying = false;
        this._refreshSweepChip();
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentPaused() {
        this._refreshSweepChip();
        this._updateButtonStates();
        this._redraw();
    }

    presentReset() {
        if (this.viViewModel) this.viViewModel.reset();
        this._refreshSweepChip();
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentError(message) {
        this.viewModel.lastOperationError = message;
        this._redraw();
    }

    // --- Explanation card (clicking a Q-table cell) ---

    /**
     * Build an explanation detail for a specific Q(s,a) cell at a given sweep. Anchors the
     * fan-out overlay to the REAL graph node position; its internal spread geometry stays
     * synthetic (an intentionally decluttered schematic).
     */
    buildExplanationDetail({
        columnIndex,
        stateId,
        actionId,
        subPhase = 'select_max',
        stepIndex = 4,
        stepLabel = subPhase,
        totalSteps = 6
    }) {
        const detail = this._computeBackupDetail(columnIndex, stateId, subPhase, {
            actionId,
            explanationMode: true,
            stepIndex
        });
        if (!detail) return null;
        return {
            ...detail,
            actionId,
            selectedActionId: actionId,
            explanationMode: true,
            stepIndex,
            stepLabel,
            totalSteps,
            phaseDuration: 700,
            phaseStartTime: Date.now()
        };
    }

    /**
     * Compute a backup-detail object anchored to the real graph node. sweepIndex is the sweep the
     * Q-values come from; the fan-out's action diamonds are offset synthetically from the node and
     * transitions terminate at the real successor nodes.
     */
    _computeBackupDetail(sweepIndex, stateId, subPhase, options = {}) {
        if (!this.viState || !this.viewModel.graph) return null;
        const graph = this.viewModel.graph;
        const stateNode = graph.getNodeById(stateId);
        if (!stateNode) return null;

        const stateRadius = stateNode.size;
        const detail = this.viState.getBackupDetail(sweepIndex, stateId);

        if (!detail || !detail.actions || detail.actions.length === 0) {
            return {
                subPhase,
                stateId,
                columnIndex: sweepIndex,
                stateX: stateNode.x,
                stateY: stateNode.y,
                stateRadius,
                stateName: stateNode.name,
                timestep: sweepIndex,
                actions: [],
                visibleActionCount: 0,
                visibleTransitionCount: -1,
                bestActionId: null,
                value: 0,
                equationLines: [{ text: this._formatEquationHeader(stateNode.name, sweepIndex), type: 'header' }],
                gamma: this.viState.gamma,
                phaseDuration: this.viState.phaseDuration,
                phaseStartTime: this.viState.phaseStartTime,
                selectedActionId: options.actionId ?? null,
                explanationMode: options.explanationMode === true,
                stepIndex: options.stepIndex ?? 0,
            };
        }

        // Synthetic fan-out geometry anchored to the real node; transitions to real successors.
        const actionCount = detail.actions.length;
        const midX = stateNode.x + 120;
        const spreadRange = Math.max(60, actionCount * 44);
        const step = spreadRange / Math.max(actionCount - 1, 1);

        const actionsWithPositions = detail.actions.map((action, idx) => {
            const actionY = stateNode.y + (idx - (actionCount - 1) / 2) * step;
            const transitionsWithPositions = action.transitions
                .map(t => {
                    const toNode = graph.getNodeById(t.nextState);
                    if (!toNode) return null;
                    return { ...t, toX: toNode.x, toY: toNode.y, toRadius: toNode.size };
                })
                .filter(Boolean);
            return {
                actionId: action.actionId,
                actionName: action.actionName,
                x: midX,
                y: actionY,
                qValue: action.qValue,
                transitions: transitionsWithPositions
            };
        });

        const equationLines = this._formatEquationLines(stateNode.name, sweepIndex, detail, subPhase);

        return {
            subPhase,
            stateId,
            columnIndex: sweepIndex,
            stateX: stateNode.x,
            stateY: stateNode.y,
            stateRadius,
            stateName: stateNode.name,
            timestep: sweepIndex,
            actions: actionsWithPositions,
            visibleActionCount: actionsWithPositions.length,
            visibleTransitionCount: -1,
            currentActionIndex: 0,
            currentTransitionIndex: 0,
            bestActionId: detail.bestActionId,
            value: detail.value,
            equationLines,
            gamma: this.viState.gamma,
            phaseDuration: this.viState.phaseDuration,
            phaseStartTime: this.viState.phaseStartTime,
            selectedActionId: options.actionId ?? null,
            explanationMode: options.explanationMode === true,
            stepIndex: options.stepIndex ?? 0,
        };
    }

    // --- Equation formatting (sweep-numbered V^k, per-term color) ---

    _accentHex() {
        const entry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
        const ns = AppPalette[entry.paletteNamespace];
        return (ns && ns.result) || AppPalette.text.medium;
    }

    _formatEquationHeader(stateName, sweepIndex) {
        const s = latexEscapeText(stateName);
        const accent = this._accentHex();
        return `V^{${sweepIndex}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)\\bigl[R + \\gamma \\textcolor{${accent}}{V^{${sweepIndex - 1}}(s')}\\bigr]`;
    }

    _formatEquationLines(stateName, sweepIndex, detail, subPhase) {
        const s = latexEscapeText(stateName);
        const lines = [{ text: `V^{${sweepIndex}}(\\text{${s}}) = \\max\\{ Q(\\text{${s}}, a) \\}`, type: 'header' }];

        for (const action of detail.actions) {
            const a = latexEscapeText(action.actionName);
            lines.push({
                text: `Q(\\text{${s}}, \\text{${a}}) = ${action.qValue.toFixed(2)}`,
                type: action.actionId === detail.bestActionId ? 'best' : 'normal'
            });
        }

        if (detail.actions.length > 0) {
            const qVals = detail.actions.map(a => a.qValue.toFixed(2)).join(',\\, ');
            lines.push({
                text: `V^{${sweepIndex}}(\\text{${s}}) = \\max\\{${qVals}\\} = ${detail.value.toFixed(2)}`,
                type: 'result'
            });
        }
        return lines;
    }

    // --- Internal helpers ---

    _redraw() {
        if (typeof redraw === 'function') redraw();
    }

    _refreshSweepChip() {
        if (this.sweepChip) this.sweepChip.refresh();
    }

    _updateRightPanel() {
        if (this.chartDock) this.chartDock.refresh();
        if (this.viewModel.interaction.mode === 'values' && this.viewModel.valuesSubView === 'mc') return;
        if (this.rightPanel) this.rightPanel.updateContent();
    }

    _updateButtonStates() {
        if (this.viewModel.interaction.mode === 'values' && this.viewModel.valuesSubView === 'mc') return;
        if (!this.topBar || !this.viState) return;
        const { canStep, canPlay } = this.viState.getButtonEnablement();
        this.topBar.updateVIButtonStates(this.viState.isPlaying, canStep, canPlay);
    }
}
