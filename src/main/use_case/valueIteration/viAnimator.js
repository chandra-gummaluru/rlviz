// Animation orchestrator for Value Iteration visualization
// Only depends on domain (viState) and output boundary — no ViewModel references
class VIAnimator {
    constructor(viState, outputBoundary, viViewModel) {
        this.viState = viState;
        this.outputBoundary = outputBoundary;
        this.viViewModel = viViewModel; // needed to check perActionMode

        this.SUB_PHASES = ['show_equation', 'show_actions', 'show_transitions', 'compute_q_values', 'select_max', 'revealing_value'];

        this.TIMING = {
            COLUMN_SLIDE: 400,
            COLUMN_PAUSE: 300,
            // Sub-phase durations for detailed Bellman backup
            show_equation: 600,
            show_actions: 500,
            show_transitions: 600,
            compute_q_values: 800,
            select_max: 600,
            revealing_value: 500,
            // Per-action mode durations
            show_action: 400,
            show_transition: 400,
            compute_transition: 500,
            show_q_result: 500
        };

        // Shortened durations for Skip (instant-ish)
        this.SKIP_TIMING = {
            show_equation: 0,
            show_actions: 0,
            show_transitions: 0,
            compute_q_values: 0,
            select_max: 0,
            revealing_value: 0,
            show_action: 0,
            show_transition: 0,
            compute_transition: 0,
            show_q_result: 0
        };
    }

    /** Check if per-action mode is enabled */
    get perActionMode() {
        return this.viViewModel && this.viViewModel.perActionMode;
    }

    async animateInitialization() {
        this.outputBoundary.presentInitialized();
        await this.animateColumn(0);
    }

    async animateColumn(columnIndex) {
        this.outputBoundary.presentColumnStart(columnIndex);

        for (let si = 0; si < this.viState.stateCount; si++) {
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;

            const stateId = this.viState.stateIds[si];
            this.viState.currentColumnIndex = columnIndex;
            this.viState.currentStateIndex = si;

            this.outputBoundary.presentStateBackupStart(columnIndex, stateId);
            await this._animateStateBackup(columnIndex, stateId, this.TIMING);

            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') break;
        }

        this.viState.currentStateIndex = this.viState.stateCount;
        this.viState.subPhase = 'idle';
        this.viState.setPhase('idle', 0);
        this.outputBoundary.presentColumnComplete(columnIndex);

        if (this.viState.isPlaying) {
            this.viState.setPhase('pause', this.TIMING.COLUMN_PAUSE);
            this.outputBoundary.presentPhaseChange('pause', this.TIMING.COLUMN_PAUSE);
            await this.waitForPhase();
        }
    }

    /**
     * Animate all sub-phases for a single state's Bellman backup.
     * In per-action mode, loops through actions individually.
     */
    async _animateStateBackup(columnIndex, stateId, timing) {
        const detail = this.viState.getBackupDetail(columnIndex, stateId);
        const hasActions = detail && detail.actions && detail.actions.length > 0;

        // Sub-phase 1: Show equation
        this.viState.subPhase = 'show_equation';
        this.viState.currentActionIndex = 0;
        this.viState.setPhase('computing', timing.show_equation);
        this.outputBoundary.presentEquationStart(columnIndex, stateId);
        await this.waitForPhase();
        if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;

        if (hasActions) {
            if (this.perActionMode) {
                // Per-action mode: for each action, step through each transition
                for (let ai = 0; ai < detail.actions.length; ai++) {
                    this.viState.currentActionIndex = ai;
                    this.viState.currentTransitionIndex = 0;

                    // Show this action diamond
                    this.viState.subPhase = 'show_action';
                    this.viState.setPhase('computing', timing.show_action);
                    this.outputBoundary.presentActionsRevealed(columnIndex, stateId);
                    await this.waitForPhase();
                    if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;

                    // Step through each transition in this action
                    const transitions = detail.actions[ai].transitions;
                    for (let ti = 0; ti < transitions.length; ti++) {
                        this.viState.currentTransitionIndex = ti;

                        // Show the transition edge
                        this.viState.subPhase = 'show_transition';
                        this.viState.setPhase('computing', timing.show_transition);
                        this.outputBoundary.presentTransitionsRevealed(columnIndex, stateId);
                        await this.waitForPhase();
                        if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;

                        // Compute this transition's contribution
                        this.viState.subPhase = 'compute_transition';
                        this.viState.setPhase('computing', timing.compute_transition);
                        this.outputBoundary.presentQValuesComputed(columnIndex, stateId);
                        await this.waitForPhase();
                        if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;
                    }

                    // Show the final Q-value for this action
                    this.viState.subPhase = 'show_q_result';
                    this.viState.setPhase('computing', timing.show_q_result);
                    this.outputBoundary.presentQValuesComputed(columnIndex, stateId);
                    await this.waitForPhase();
                    if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;
                }
            } else {
                // Bundled mode: show all actions at once
                this.viState.subPhase = 'show_actions';
                this.viState.setPhase('computing', timing.show_actions);
                this.outputBoundary.presentActionsRevealed(columnIndex, stateId);
                await this.waitForPhase();
                if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;

                this.viState.subPhase = 'show_transitions';
                this.viState.setPhase('computing', timing.show_transitions);
                this.outputBoundary.presentTransitionsRevealed(columnIndex, stateId);
                await this.waitForPhase();
                if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;

                this.viState.subPhase = 'compute_q_values';
                this.viState.setPhase('computing', timing.compute_q_values);
                this.outputBoundary.presentQValuesComputed(columnIndex, stateId);
                await this.waitForPhase();
                if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;
            }

            // Select max action
            this.viState.subPhase = 'select_max';
            this.viState.setPhase('computing', timing.select_max);
            this.outputBoundary.presentMaxSelected(columnIndex, stateId);
            await this.waitForPhase();
            if (!this.viState.isPlaying && this.viState.phase !== 'stepping') return;
        }

        // Reveal value
        this.viState.subPhase = 'revealing_value';
        this.viState.setPhase('revealing_value', timing.revealing_value);
        this.outputBoundary.presentValueRevealStart(columnIndex, stateId);
        await this.waitForPhase();
        this.outputBoundary.presentStateBackupComplete(columnIndex, stateId);
    }

    /**
     * Advance exactly one sub-phase for the current state (Step button).
     */
    async animateOneSubPhase() {
        const colIdx = this.viState.currentColumnIndex;
        const stateIdx = this.viState.currentStateIndex;

        if (colIdx >= this.viState.totalColumns) return;
        if (stateIdx >= this.viState.stateCount) return;

        const stateId = this.viState.stateIds[stateIdx];
        const currentSubPhase = this.viState.subPhase;

        const detail = this.viState.getBackupDetail(colIdx, stateId);
        const hasActions = detail && detail.actions && detail.actions.length > 0;

        // Build the applicable phases list
        const applicablePhases = this._getApplicablePhases(hasActions, detail);

        // If starting a new column, show it
        if (stateIdx === 0 && (currentSubPhase === 'idle' || currentSubPhase === 'revealing_value')) {
            this.outputBoundary.presentColumnStart(colIdx);
            this.outputBoundary.presentStateBackupStart(colIdx, stateId);
        }

        // Find current position in applicable phases
        let currentIdx = -1;
        if (currentSubPhase !== 'idle') {
            currentIdx = this._findCurrentPhaseIndex(applicablePhases, currentSubPhase);
        }

        let nextIdx;
        if (currentIdx === -1) {
            nextIdx = 0;
            this.outputBoundary.presentStateBackupStart(colIdx, stateId);
        } else {
            nextIdx = currentIdx + 1;
        }

        if (nextIdx >= applicablePhases.length) {
            this._advanceCursorAfterState(colIdx);
            return;
        }

        const nextPhase = applicablePhases[nextIdx];
        const duration = this.TIMING[nextPhase.phase] || 500;

        this.viState.subPhase = nextPhase.phase;
        if (nextPhase.actionIndex !== undefined) {
            this.viState.currentActionIndex = nextPhase.actionIndex;
        }
        if (nextPhase.transitionIndex !== undefined) {
            this.viState.currentTransitionIndex = nextPhase.transitionIndex;
        }
        this.viState.phase = 'stepping';
        this.viState.setPhase('stepping', duration);

        this._callPresenterForSubPhase(nextPhase.phase, colIdx, stateId);

        await this.waitForPhase();
        this.viState.setPhase('idle', 0);

        if (nextPhase.phase === 'revealing_value') {
            this.outputBoundary.presentStateBackupComplete(colIdx, stateId);
            this._advanceCursorAfterState(colIdx);
        }
    }

    /**
     * Build a list of applicable phase steps for a state.
     * In per-action mode, expands action phases per action.
     */
    _getApplicablePhases(hasActions, detail) {
        if (!hasActions) {
            return [
                { phase: 'show_equation' },
                { phase: 'revealing_value' }
            ];
        }

        const phases = [{ phase: 'show_equation' }];

        if (this.perActionMode && detail) {
            // Per-action: for each action, step through each transition
            for (let ai = 0; ai < detail.actions.length; ai++) {
                phases.push({ phase: 'show_action', actionIndex: ai });
                const transitions = detail.actions[ai].transitions;
                for (let ti = 0; ti < transitions.length; ti++) {
                    phases.push({ phase: 'show_transition', actionIndex: ai, transitionIndex: ti });
                    phases.push({ phase: 'compute_transition', actionIndex: ai, transitionIndex: ti });
                }
                phases.push({ phase: 'show_q_result', actionIndex: ai });
            }
        } else {
            // Bundled mode
            phases.push({ phase: 'show_actions' });
            phases.push({ phase: 'show_transitions' });
            phases.push({ phase: 'compute_q_values' });
        }

        phases.push({ phase: 'select_max' });
        phases.push({ phase: 'revealing_value' });
        return phases;
    }

    /**
     * Find the current phase index, accounting for per-action phases
     * that may repeat with different actionIndex values.
     */
    _findCurrentPhaseIndex(applicablePhases, currentSubPhase) {
        const currentActionIdx = this.viState.currentActionIndex;
        const currentTransIdx = this.viState.currentTransitionIndex;
        for (let i = applicablePhases.length - 1; i >= 0; i--) {
            const p = applicablePhases[i];
            if (p.phase !== currentSubPhase) continue;
            const actionMatch = p.actionIndex === undefined || p.actionIndex === currentActionIdx;
            const transMatch = p.transitionIndex === undefined || p.transitionIndex === currentTransIdx;
            if (actionMatch && transMatch) return i;
        }
        // Fallback: match just the phase name
        for (let i = applicablePhases.length - 1; i >= 0; i--) {
            if (applicablePhases[i].phase === currentSubPhase) return i;
        }
        return -1;
    }

    /**
     * Skip: complete one full state backup instantly (Skip button).
     */
    async animateOneState() {
        const colIdx = this.viState.currentColumnIndex;
        const stateIdx = this.viState.currentStateIndex;

        if (colIdx >= this.viState.totalColumns) return;
        if (stateIdx >= this.viState.stateCount) return;

        const stateId = this.viState.stateIds[stateIdx];

        if (stateIdx === 0 && (this.viState.subPhase === 'idle' || this.viState.subPhase === 'revealing_value')) {
            this.outputBoundary.presentColumnStart(colIdx);
        }

        this.outputBoundary.presentStateBackupStart(colIdx, stateId);

        this.viState.phase = 'stepping';
        await this._animateStateBackup(colIdx, stateId, this.SKIP_TIMING);

        this.viState.setPhase('idle', 0);
        this._advanceCursorAfterState(colIdx);
    }

    /** Advance cursor after completing a state backup */
    _advanceCursorAfterState(colIdx) {
        this.viState.currentStateIndex++;
        this.viState.subPhase = 'idle';
        this.viState.currentActionIndex = 0;
        this.viState.currentTransitionIndex = 0;
        if (this.viState.currentStateIndex >= this.viState.stateCount) {
            this.outputBoundary.presentColumnComplete(colIdx);
            this.viState.currentStateIndex = 0;
            this.viState.currentColumnIndex++;
        }

        if (!this.viState.canAdvance()) {
            this.viState.isPlaying = false;
            this.outputBoundary.presentComplete();
        }
    }

    /** Call the correct presenter method for a given sub-phase */
    _callPresenterForSubPhase(subPhase, colIdx, stateId) {
        switch (subPhase) {
            case 'show_equation':
                this.outputBoundary.presentEquationStart(colIdx, stateId);
                break;
            case 'show_actions':
            case 'show_action':
                this.outputBoundary.presentActionsRevealed(colIdx, stateId);
                break;
            case 'show_transitions':
            case 'show_transition':
                this.outputBoundary.presentTransitionsRevealed(colIdx, stateId);
                break;
            case 'compute_q_values':
            case 'compute_transition':
            case 'show_q_result':
                this.outputBoundary.presentQValuesComputed(colIdx, stateId);
                break;
            case 'select_max':
                this.outputBoundary.presentMaxSelected(colIdx, stateId);
                break;
            case 'revealing_value':
                this.outputBoundary.presentValueRevealStart(colIdx, stateId);
                break;
        }
    }

    async continuousPlay() {
        while (this.viState.isPlaying && this.viState.canAdvance()) {
            const colIdx = this.viState.currentColumnIndex;
            const stateIdx = this.viState.currentStateIndex;

            if (stateIdx === 0 && this.viState.subPhase === 'idle') {
                await this.animateColumn(colIdx);
            } else {
                await this._animateRemainingStates(colIdx, stateIdx);
            }

            if (!this.viState.isPlaying) break;
        }

        if (this.viState.isPlaying && !this.viState.canAdvance()) {
            this.viState.isPlaying = false;
            this.outputBoundary.presentComplete();
        }
    }

    async _animateRemainingStates(columnIndex, startStateIdx) {
        for (let si = startStateIdx; si < this.viState.stateCount; si++) {
            if (!this.viState.isPlaying) break;

            const stateId = this.viState.stateIds[si];
            this.viState.currentStateIndex = si;

            this.outputBoundary.presentStateBackupStart(columnIndex, stateId);
            await this._animateStateBackup(columnIndex, stateId, this.TIMING);

            if (!this.viState.isPlaying) break;
        }

        if (this.viState.isPlaying) {
            this.viState.currentStateIndex = 0;
            this.viState.currentColumnIndex++;
            this.outputBoundary.presentColumnComplete(columnIndex);

            this.viState.setPhase('pause', this.TIMING.COLUMN_PAUSE);
            this.outputBoundary.presentPhaseChange('pause', this.TIMING.COLUMN_PAUSE);
            await this.waitForPhase();
        }
    }

    waitForPhase() {
        return new Promise(resolve => {
            const checkComplete = () => {
                if (this.viState.isPhaseComplete() || (!this.viState.isPlaying && this.viState.phase !== 'stepping')) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 50);
                }
            };
            checkComplete();
        });
    }
}
