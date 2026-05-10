// Domain entity for Value Iteration state machine and precomputed history
class ValueIterationState {
    constructor() {
        this.reset();
    }

    reset() {
        // Precomputed data
        this.history = [];        // history[0] = V_T (all zeros), history[i] = V_{T-i}
        this.qValues = [];        // qValues[i][stateId] = [{actionId, actionName, qValue}]
        this.bestActions = [];    // bestActions[i][stateId] = actionId
        this.backupDetails = [];  // backupDetails[i][stateId] = { actions: [...], bestActionId, value }
        this.stateIds = [];       // ordered list of state IDs
        this.stateNames = {};     // stateId -> name
        this.T = 0;
        this.gamma = 0.9;

        // Animation cursor
        this.currentColumnIndex = 0;   // which column is being animated (0 = terminal, 1 = T-1, etc.)
        this.currentStateIndex = 0;    // which state within that column
        this.initialized = false;

        // Phase state machine
        this.phase = 'idle';
        this.phaseStartTime = 0;
        this.phaseDuration = 0;

        // Sub-phase for detailed Bellman backup animation
        // idle | show_equation | show_actions | show_transitions | compute_q_values | select_max | revealing_value
        // Per-action mode adds: show_action | compute_action (one action at a time)
        this.subPhase = 'idle';
        this.currentActionIndex = 0;      // which action within per-action mode
        this.currentTransitionIndex = 0;  // which transition within current action

        // Playback control
        this.isPlaying = false;
    }

    /**
     * Run full value iteration and store results.
     * history[0] = V_T (zeros), history[1] = V_{T-1}, ..., history[T] = V_0
     */
    computeHistory(graph, T, gamma) {
        this.T = T;
        this.gamma = gamma;

        const states = graph.nodes.filter(n => n.type === 'state');
        // Sort states by y-position so VI animates top-to-bottom visually
        states.sort((a, b) => (a.y || 0) - (b.y || 0));
        this.stateIds = states.map(s => s.id);
        states.forEach(s => { this.stateNames[s.id] = s.name; });

        // V_T = 0 for all states
        const V_T = {};
        this.stateIds.forEach(id => { V_T[id] = 0; });
        this.history = [V_T];
        this.qValues = [{}]; // no Q-values at terminal
        this.bestActions = [{}];
        this.backupDetails = [{}]; // no backup details at terminal

        // Backup T steps
        for (let step = 0; step < T; step++) {
            const V_prev = this.history[this.history.length - 1];
            const V_curr = {};
            const Q_curr = {};
            const best_curr = {};
            const detail_curr = {};

            this.stateIds.forEach(stateId => {
                const stateNode = graph.getNodeById(stateId);
                if (!stateNode || !stateNode.actions || stateNode.actions.length === 0) {
                    V_curr[stateId] = 0;
                    Q_curr[stateId] = [];
                    best_curr[stateId] = null;
                    detail_curr[stateId] = { actions: [], bestActionId: null, value: 0 };
                    return;
                }

                let maxQ = -Infinity;
                let bestActionId = null;
                const actionQs = [];
                const actionDetails = [];

                stateNode.actions.forEach(actionId => {
                    const actionNode = graph.getNodeById(actionId);
                    if (!actionNode || !actionNode.sas) return;

                    let Q = 0;
                    const transitions = [];
                    actionNode.sas.forEach(({ nextState, probability, reward }) => {
                        const nextValue = V_prev[nextState] ?? 0;
                        const term = probability * (reward + gamma * nextValue);
                        Q += term;
                        transitions.push({
                            nextState,
                            nextStateName: this.stateNames[nextState] || `S${nextState}`,
                            probability,
                            reward,
                            nextValue,
                            term
                        });
                    });

                    actionQs.push({
                        actionId: actionId,
                        actionName: actionNode.name,
                        qValue: Q
                    });

                    actionDetails.push({
                        actionId,
                        actionName: actionNode.name,
                        transitions,
                        qValue: Q
                    });

                    if (Q > maxQ) {
                        maxQ = Q;
                        bestActionId = actionId;
                    }
                });

                const value = maxQ === -Infinity ? 0 : maxQ;
                V_curr[stateId] = value;
                Q_curr[stateId] = actionQs;
                best_curr[stateId] = bestActionId;
                detail_curr[stateId] = {
                    actions: actionDetails,
                    bestActionId,
                    value
                };
            });

            this.history.push(V_curr);
            this.qValues.push(Q_curr);
            this.bestActions.push(best_curr);
            this.backupDetails.push(detail_curr);
        }

        this.initialized = true;
        this.currentColumnIndex = 0;
        this.currentStateIndex = 0;
    }

    /** Total number of columns (T+1) */
    get totalColumns() {
        return this.history.length;
    }

    /** Number of states */
    get stateCount() {
        return this.stateIds.length;
    }

    /**
     * Advance cursor to next state, or next column if at end of current column.
     * Returns false if already at the end.
     */
    advance() {
        if (!this.canAdvance()) return false;

        this.currentStateIndex++;
        if (this.currentStateIndex >= this.stateCount) {
            this.currentStateIndex = 0;
            this.currentColumnIndex++;
        }
        return true;
    }

    canAdvance() {
        if (!this.initialized) return false;
        // We've processed all columns
        if (this.currentColumnIndex >= this.totalColumns) return false;
        // Last column, last state already done
        if (this.currentColumnIndex === this.totalColumns - 1 &&
            this.currentStateIndex >= this.stateCount) return false;
        return true;
    }

    /** Check if the current column is fully completed */
    isColumnComplete() {
        return this.currentStateIndex >= this.stateCount;
    }

    play() {
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
    }

    // Phase timing
    setPhase(phase, duration) {
        this.phase = phase;
        this.phaseDuration = duration;
        this.phaseStartTime = Date.now();
    }

    isPhaseComplete() {
        if (this.phaseDuration <= 0) return true;
        return (Date.now() - this.phaseStartTime) >= this.phaseDuration;
    }

    /** Get the V-table for a given column index */
    getValues(columnIndex) {
        if (columnIndex < 0 || columnIndex >= this.history.length) return {};
        return this.history[columnIndex];
    }

    /** Get the Q-values for a given column index and state */
    getQValues(columnIndex, stateId) {
        if (columnIndex < 0 || columnIndex >= this.qValues.length) return [];
        return this.qValues[columnIndex][stateId] || [];
    }

    /** Get the best action for a given column index and state */
    getBestAction(columnIndex, stateId) {
        if (columnIndex < 0 || columnIndex >= this.bestActions.length) return null;
        return this.bestActions[columnIndex][stateId] || null;
    }

    /** Get the timestep label for a column index (column 0 = t=T, column i = t=T-i) */
    getTimestep(columnIndex) {
        return this.T - columnIndex;
    }

    /** Get full backup detail for a given column and state (transitions, Q-values, terms) */
    getBackupDetail(columnIndex, stateId) {
        if (columnIndex < 0 || columnIndex >= this.backupDetails.length) return null;
        return this.backupDetails[columnIndex][stateId] || null;
    }
}
