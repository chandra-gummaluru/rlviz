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

// Presenter for Value Iteration — translates state changes to ViewModel updates
class VIPresenter extends VIOutputBoundary {
    constructor(canvasViewModel) {
        super();
        this.viewModel = canvasViewModel;
        this.toolBar = null;
    }

    get viViewModel() {
        return this.viewModel.valueIterationViewModel;
    }

    get viState() {
        return this.viewModel.valueIterationState;
    }

    setToolBar(toolBar) {
        this.toolBar = toolBar;
    }

    setRightPanel(rightPanel) {
        this.rightPanel = rightPanel;
    }

    presentLayoutNeeded(canvasWidth, canvasHeight) {
        if (this.viViewModel) {
            const viState = this.viewModel.valueIterationState;
            this.viViewModel.reset();
            this.viViewModel.computeLayout(viState, canvasWidth, canvasHeight);
        }
        this._redraw();
    }

    presentInitialized() {
        this._redraw();
    }

    presentColumnStart(columnIndex) {
        if (this.viViewModel && this.viViewModel.visibleColumnCount <= columnIndex) {
            this.viViewModel.showNextColumn();
        }
        if (this.viViewModel) {
            this.viViewModel.activeColumnIndex = columnIndex;
        }
        this._redraw();
    }

    presentStateBackupStart(columnIndex, stateId) {
        if (this.viViewModel) {
            this.viViewModel.activeColumnIndex = columnIndex;
            this.viViewModel.activeStateId = stateId;
            this.viViewModel.clearBackupDetail();
        }
        this._redraw();
    }

    presentStateBackupComplete(columnIndex, stateId) {
        if (this.viViewModel) {
            this.viViewModel.revealValue(columnIndex, stateId);
            this.viViewModel.clearBackupDetail();
        }
        this._redraw();
        this._updateRightPanel();
    }

    presentColumnComplete(columnIndex) {
        if (this.viViewModel) {
            this.viViewModel.revealColumn(columnIndex);
            this.viViewModel.clearBackupDetail();
        }
        this._redraw();
        this._updateRightPanel();
    }

    presentComplete() {
        const viState = this.viewModel.valueIterationState;
        if (viState) viState.isPlaying = false;
        if (this.viViewModel) this.viViewModel.clearBackupDetail();
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentPaused() {
        this._updateButtonStates();
        this._redraw();
    }

    presentReset() {
        if (this.viViewModel) {
            this.viViewModel.reset();
        }
        this._updateButtonStates();
        this._redraw();
        this._updateRightPanel();
    }

    presentPhaseChange(phase, duration) {
        this._redraw();
    }

    presentError(message) {
        this.viewModel.lastOperationError = message;
        this._redraw();
    }

    // --- Detailed Bellman backup sub-phase presenters ---

    presentEquationStart(columnIndex, stateId) {
        this._buildBackupDetail(columnIndex, stateId, this.viState.subPhase);
        this._redraw();
    }

    presentActionsRevealed(columnIndex, stateId) {
        this._buildBackupDetail(columnIndex, stateId, this.viState.subPhase);
        this._redraw();
    }

    presentTransitionsRevealed(columnIndex, stateId) {
        this._buildBackupDetail(columnIndex, stateId, this.viState.subPhase);
        this._redraw();
    }

    presentQValuesComputed(columnIndex, stateId) {
        this._buildBackupDetail(columnIndex, stateId, this.viState.subPhase);
        this._redraw();

        if (this.viViewModel) {
            const subPhase = this.viState.subPhase;
            const qVals = this.viState.getQValues(columnIndex, stateId);
            if (subPhase === 'compute_q_values') {
                qVals.forEach(q => this.viViewModel.revealQValue(columnIndex, stateId, q.actionId));
            } else if (subPhase === 'show_q_result') {
                const aq = qVals[this.viState.currentActionIndex];
                if (aq) this.viViewModel.revealQValue(columnIndex, stateId, aq.actionId);
            }
        }
        this._updateRightPanel();
    }

    presentMaxSelected(columnIndex, stateId) {
        this._buildBackupDetail(columnIndex, stateId, this.viState.subPhase);
        this._redraw();
    }

    presentValueRevealStart(columnIndex, stateId) {
        this._buildBackupDetail(columnIndex, stateId, this.viState.subPhase);
        this._redraw();
    }

    // --- Internal helpers ---

    _buildBackupDetail(columnIndex, stateId, subPhase) {
        const detail = this._computeBackupDetail(columnIndex, stateId, subPhase);
        if (detail && this.viViewModel) {
            this.viViewModel.setBackupDetail(detail);
        }
    }

    /**
     * Compute the backupDetail object (positions from current column layout).
     * Returns the object; does not call setBackupDetail.
     * Pass options.explanationMode = true to add explanation metadata and override visibility.
     */
    _computeBackupDetail(columnIndex, stateId, subPhase, options = {}) {
        if (!this.viViewModel || !this.viState) return null;

        const col = this.viViewModel.getColumn(columnIndex);
        if (!col) return null;
        const stateNode = col.states.find(s => s.id === stateId);
        if (!stateNode) return null;

        const detail = this.viState.getBackupDetail(columnIndex, stateId);
        if (!detail) {
            // Terminal column or state with no actions
            return {
                subPhase,
                stateId,
                columnIndex,
                stateX: stateNode.x,
                stateY: stateNode.y,
                stateRadius: stateNode.radius,
                stateName: stateNode.name,
                timestep: col.timestep,
                actions: [],
                bestActionId: null,
                value: 0,
                equationLines: [{ text: this._formatEquationHeader(stateNode.name, col.timestep), type: 'header' }],
                gamma: this.viState.gamma,
                phaseDuration: this.viState.phaseDuration,
                phaseStartTime: this.viState.phaseStartTime,
                selectedActionId: options.actionId ?? null,
                explanationMode: options.explanationMode === true,
                stepIndex: options.stepIndex ?? 0,
            };
        }

        // Get next column for positioning transitions
        const nextCol = this.viViewModel.getColumn(columnIndex + 1);

        // Compute action fan-out positions
        const actionCount = detail.actions.length;
        const midX = nextCol ? (stateNode.x + nextCol.x) / 2 : stateNode.x + 125;
        const spreadRange = Math.max(60, actionCount * 40);

        const actionsWithPositions = detail.actions.map((action, idx) => {
            const actionY = stateNode.y + (idx - (actionCount - 1) / 2) * (spreadRange / Math.max(actionCount - 1, 1));

            const transitionsWithPositions = action.transitions
                .filter(t => nextCol && nextCol.states.some(s => s.id === t.nextState))
                .map(t => {
                    const toState = nextCol.states.find(s => s.id === t.nextState);
                    return {
                        ...t,
                        toX: toState.x,
                        toY: toState.y,
                        toRadius: toState.radius
                    };
                });

            return {
                actionId: action.actionId,
                actionName: action.actionName,
                x: midX,
                y: actionY,
                qValue: action.qValue,
                transitions: transitionsWithPositions
            };
        });

        // Determine visibility for per-action mode
        const perAction = this.viViewModel.perActionMode;
        const actionIdx = this.viState.currentActionIndex;
        const transIdx = this.viState.currentTransitionIndex;
        const perActionPhases = ['show_action', 'show_transition', 'compute_transition', 'show_q_result'];
        const isPerActionPhase = perAction && perActionPhases.includes(subPhase);

        let visibleActionCount;
        let visibleTransitionCount;
        if (isPerActionPhase) {
            visibleActionCount = 1;
            if (subPhase === 'show_action') {
                visibleTransitionCount = 0;
            } else if (subPhase === 'show_transition') {
                visibleTransitionCount = transIdx + 1;
            } else if (subPhase === 'compute_transition') {
                visibleTransitionCount = transIdx + 1;
            } else { // show_q_result
                visibleTransitionCount = actionsWithPositions[actionIdx] ? actionsWithPositions[actionIdx].transitions.length : 0;
            }
        } else if (perAction && subPhase === 'show_equation') {
            visibleActionCount = 0;
            visibleTransitionCount = 0;
        } else {
            visibleActionCount = actionsWithPositions.length;
            visibleTransitionCount = -1;
        }

        // Explanation mode always shows all actions regardless of perActionMode
        if (options.explanationMode) {
            visibleActionCount = actionsWithPositions.length;
            visibleTransitionCount = -1;
        }

        // Build equation lines
        const equationLines = this._formatEquationLines(stateNode.name, col.timestep, detail, subPhase, actionIdx, transIdx);

        return {
            subPhase,
            stateId,
            columnIndex,
            stateX: stateNode.x,
            stateY: stateNode.y,
            stateRadius: stateNode.radius,
            stateName: stateNode.name,
            timestep: col.timestep,
            nextColumnIndex: columnIndex + 1,
            actions: actionsWithPositions,
            visibleActionCount,
            currentActionIndex: actionIdx,
            currentTransitionIndex: transIdx,
            visibleTransitionCount,
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

    /**
     * Build an explanation detail for a specific Q(s,a,t) cell.
     * Called from main.js when a user clicks a revealed Q-value cell.
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

    _formatEquationHeader(stateName, timestep) {
        const s = latexEscapeText(stateName);
        return `V_{${timestep}}(\\text{${s}}) = \\max_a \\sum_{s'} P(s'|s,a)[R + \\gamma V_{${timestep + 1}}(s')]`;
    }

    _formatEquationLines(stateName, timestep, detail, subPhase, actionIdx, transIdx) {
        const lines = [];
        const gamma = this.viState.gamma;
        const s = latexEscapeText(stateName);

        // Always show the general equation header
        lines.push({
            text: `V_{${timestep}}(\\text{${s}}) = \\max\\{ Q(\\text{${s}}, a) \\}`,
            type: 'header'
        });

        const bundledPhases = ['show_equation', 'show_actions', 'show_transitions', 'compute_q_values', 'select_max', 'revealing_value'];
        const phaseIdx = bundledPhases.indexOf(subPhase);
        const showMax = phaseIdx >= 4;

        if (subPhase === 'compute_transition') {
            const action = detail.actions[actionIdx];
            if (action) {
                const visibleTerms = action.transitions.slice(0, transIdx + 1);
                let runningSum = 0;
                visibleTerms.forEach(t => {
                    lines.push({
                        text: `${t.probability.toFixed(2)} \\cdot [${t.reward.toFixed(1)} + ${gamma} \\cdot ${t.nextValue.toFixed(2)}] = ${t.term.toFixed(2)}`,
                        type: 'normal'
                    });
                    runningSum += t.term;
                });
                const a = latexEscapeText(action.actionName);
                lines.push({
                    text: `Q(\\text{${s}}, \\text{${a}}) = ${runningSum.toFixed(2)} \\text{ (so far)}`,
                    type: 'header'
                });
            }
        } else if (subPhase === 'show_q_result') {
            const action = detail.actions[actionIdx];
            if (action) {
                const a = latexEscapeText(action.actionName);
                lines.push({
                    text: `Q(\\text{${s}}, \\text{${a}}) = ${action.qValue.toFixed(2)}`,
                    type: action.actionId === detail.bestActionId ? 'best' : 'normal'
                });
            }
        } else if (phaseIdx >= 3) {
            for (let i = 0; i < detail.actions.length; i++) {
                const action = detail.actions[i];
                const a = latexEscapeText(action.actionName);
                lines.push({
                    text: `Q(\\text{${s}}, \\text{${a}}) = ${action.qValue.toFixed(2)}`,
                    type: action.actionId === detail.bestActionId ? 'best' : 'normal'
                });
            }
        }

        if (showMax) {
            if (detail.actions.length > 0) {
                const qVals = detail.actions.map(a => a.qValue.toFixed(2)).join(',\\, ');
                lines.push({
                    text: `V_{${timestep}}(\\text{${s}}) = \\max\\{${qVals}\\} = ${detail.value.toFixed(2)}`,
                    type: 'result'
                });
            }
        }

        return lines;
    }

    _redraw() {
        if (typeof redraw === 'function') {
            redraw();
        }
    }

    _updateRightPanel() {
        if (this.viewModel.interaction.mode === 'expectation') return;
        if (this.rightPanel) this.rightPanel.updateContent();
    }

    _updateButtonStates() {
        if (this.viewModel.interaction.mode === 'expectation') return;
        if (this.toolBar) {
            const viState = this.viewModel.valueIterationState;
            if (viState) {
                this.toolBar.updateVIButtonStates(viState.isPlaying, viState.canAdvance());
            }
        }
    }
}
