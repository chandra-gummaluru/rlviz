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

    /**
     * Build the backupDetail object for the view, with positions computed
     * from the current column layout. Progressive: each subPhase includes
     * all data from earlier phases.
     */
    _buildBackupDetail(columnIndex, stateId, subPhase) {
        if (!this.viViewModel || !this.viState) return;

        const col = this.viViewModel.getColumn(columnIndex);
        if (!col) return;
        const stateNode = col.states.find(s => s.id === stateId);
        if (!stateNode) return;

        const detail = this.viState.getBackupDetail(columnIndex, stateId);
        if (!detail) {
            // Terminal column or state with no actions
            this.viViewModel.setBackupDetail({
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
                equationLines: [this._formatEquationHeader(stateNode.name, col.timestep)],
                gamma: this.viState.gamma,
                phaseDuration: this.viState.phaseDuration,
                phaseStartTime: this.viState.phaseStartTime
            });
            return;
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
        let visibleTransitionCount; // how many transitions of the current action to show
        if (isPerActionPhase) {
            visibleActionCount = 1; // only show current action
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
            visibleTransitionCount = -1; // show all
        }

        // Build equation lines
        const equationLines = this._formatEquationLines(stateNode.name, col.timestep, detail, subPhase, actionIdx, transIdx);

        this.viViewModel.setBackupDetail({
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
            phaseStartTime: this.viState.phaseStartTime
        });
    }

    _formatEquationHeader(stateName, timestep) {
        return `V${timestep}(${stateName}) = max_a \u03A3 P(s'|s,a)[R + \u03B3\u00B7V${timestep + 1}(s')]`;
    }

    _formatEquationLines(stateName, timestep, detail, subPhase, actionIdx, transIdx) {
        const lines = [];
        const gamma = this.viState.gamma;

        // Always show the general equation
        lines.push({
            text: `V${timestep}(${stateName}) = max { Q(${stateName}, a) }`,
            type: 'header'
        });

        const bundledPhases = ['show_equation', 'show_actions', 'show_transitions', 'compute_q_values', 'select_max', 'revealing_value'];
        const phaseIdx = bundledPhases.indexOf(subPhase);
        const showMax = phaseIdx >= 4;

        if (subPhase === 'compute_transition') {
            // Per-transition: show the current action's running computation
            const action = detail.actions[actionIdx];
            if (action) {
                // Show terms computed so far (up to and including current transition)
                const visibleTerms = action.transitions.slice(0, transIdx + 1);
                let runningSum = 0;
                visibleTerms.forEach(t => {
                    lines.push({
                        text: `${t.probability.toFixed(2)}\u00B7[${t.reward.toFixed(1)} + ${gamma}\u00B7${t.nextValue.toFixed(2)}] = ${t.term.toFixed(2)}`,
                        type: 'normal'
                    });
                    runningSum += t.term;
                });
                lines.push({
                    text: `Q(${stateName}, ${action.actionName}) = ${runningSum.toFixed(2)} (so far)`,
                    type: 'header'
                });
            }
        } else if (subPhase === 'show_q_result') {
            // Show the final Q-value for the current action
            const action = detail.actions[actionIdx];
            if (action) {
                lines.push({
                    text: `Q(${stateName}, ${action.actionName}) = ${action.qValue.toFixed(2)}`,
                    type: action.actionId === detail.bestActionId ? 'best' : 'normal'
                });
            }
        } else if (phaseIdx >= 3) {
            // Bundled mode or select_max/revealing_value: show all Q-values
            for (let i = 0; i < detail.actions.length; i++) {
                const action = detail.actions[i];
                lines.push({
                    text: `Q(${stateName}, ${action.actionName}) = ${action.qValue.toFixed(2)}`,
                    type: action.actionId === detail.bestActionId ? 'best' : 'normal'
                });
            }
        }

        if (showMax) {
            if (detail.actions.length > 0) {
                const qVals = detail.actions.map(a => a.qValue.toFixed(2)).join(', ');
                lines.push({
                    text: `V${timestep}(${stateName}) = max{${qVals}} = ${detail.value.toFixed(2)}`,
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
        // Signal that right panel content needs refresh
    }

    _updateButtonStates() {
        if (this.toolBar) {
            const viState = this.viewModel.valueIterationState;
            if (viState) {
                this.toolBar.updateVIButtonStates(viState.isPlaying, viState.canAdvance());
            }
        }
    }
}
