// Domain entity for synchronous-sweep Value Iteration.
//
// Runs classic value iteration one *sweep* at a time, on demand, and stores each sweep as a
// full snapshot. Sweep 0 is the initialization (V=0 everywhere). Each subsequent sweep applies
// one synchronous Bellman backup reading only the *previous* sweep's V, and records the
// max-norm delta so the view can show convergence. This replaced the old finite-horizon
// backward-induction model that precomputed history[0..T] up front and only animated the reveal.
class ValueIterationState {
    constructor() {
        this.reset();
    }

    reset() {
        this.stateIds = [];       // ordered list of state IDs (stable read order)
        this.stateNames = {};     // stateId -> name
        this.T = 0;               // MAX SWEEPS CAP (hard stop for Play/Step), not an exact horizon
        this.gamma = 0.9;
        this.epsilon = 0.01;      // convergence threshold on the max-norm delta

        // history[k] = one full sweep snapshot. history[0] = sweep 0 (init, all V=0).
        //   V:  {stateId -> number}
        //   Q:  {stateId -> [{actionId, actionName, qValue}]}
        //   policy: {stateId -> actionId|null}  (argmax action; sweep 0 = arbitrary placeholder)
        //   backupDetails: {stateId -> {actions:[...], bestActionId, value}}
        //   delta: number|null   (null only for sweep 0; max_s |V^k(s)-V^{k-1}(s)| for k>=1)
        this.history = [];

        this.currentSweepIndex = 0;   // index of the latest computed sweep (== history.length-1)
        this.initialized = false;
        this.isPlaying = false;
        this.converged = false;       // sticky: set true the first time delta < epsilon, never unset
        this.convergedAtSweep = null;

        // Phase-timing fields kept only for the explanation-card tween machinery (buildExplanationDetail
        // overrides them); the live sweep animator no longer drives a phase state machine.
        this.phaseDuration = 0;
        this.phaseStartTime = 0;

        // Manual Q-value overrides (editable Q-table, "Learning Iteration" / P-unknown
        // presentation only). Keyed `${stateId}:${actionId}`. Presentation-layer annotations,
        // not domain-significant - excluded from graph import/export.
        this.manualOverrides = {};
    }

    /**
     * Initialize sweep 0 (V=0 everywhere). Replaces the old computeHistory() which precomputed
     * the entire T-step backward induction. T here is the MAX SWEEP CAP.
     */
    initialize(graph, T, gamma, epsilon = 0.01) {
        this.T = T;
        this.gamma = gamma;
        this.epsilon = epsilon;

        const states = graph.nodes.filter(n => n.type === 'state');
        // Sort states by y-position for a stable top-to-bottom read order (matches the old
        // convention; layout itself now comes from real graph node positions, not this order).
        states.sort((a, b) => (a.y || 0) - (b.y || 0));
        this.stateIds = states.map(s => s.id);
        this.stateNames = {};
        states.forEach(s => { this.stateNames[s.id] = s.name; });

        const V0 = {};
        const Q0 = {};
        const policy0 = {};
        const backup0 = {};
        this.stateIds.forEach(id => {
            const stateNode = graph.getNodeById(id);
            V0[id] = 0;
            Q0[id] = [];
            // Sweep 0's policy is the state's own FIRST action - an arbitrary, Q-value-independent
            // placeholder. This is intentional (not a bug): it gives sweep 1 a meaningful "policy
            // flipped" moment to visualize once the real argmax is computed.
            policy0[id] = (stateNode && stateNode.actions && stateNode.actions.length > 0)
                ? stateNode.actions[0]
                : null;
            backup0[id] = { actions: [], bestActionId: policy0[id], value: 0 };
        });

        this.history = [{ V: V0, Q: Q0, policy: policy0, backupDetails: backup0, delta: null }];
        this.currentSweepIndex = 0;
        this.initialized = true;
        this.isPlaying = false;
        this.converged = false;
        this.convergedAtSweep = null;
    }

    /**
     * Apply one synchronous Bellman backup, reading V from the previous sweep, and append the new
     * sweep snapshot. Returns the new sweep index. The per-state inner loop is the same Bellman
     * math the old computeHistory used - only the surrounding "when it runs" changed.
     */
    computeNextSweep(graph) {
        if (!this.initialized) return this.currentSweepIndex;
        const prev = this.history[this.history.length - 1];
        const V_prev = prev.V;
        const gamma = this.gamma;

        const V_curr = {};
        const Q_curr = {};
        const policy_curr = {};
        const detail_curr = {};

        this.stateIds.forEach(stateId => {
            const stateNode = graph.getNodeById(stateId);
            if (!stateNode || !stateNode.actions || stateNode.actions.length === 0) {
                V_curr[stateId] = 0;
                Q_curr[stateId] = [];
                policy_curr[stateId] = null;
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

                actionQs.push({ actionId, actionName: actionNode.name, qValue: Q });
                actionDetails.push({ actionId, actionName: actionNode.name, transitions, qValue: Q });

                if (Q > maxQ) {
                    maxQ = Q;
                    bestActionId = actionId;
                }
            });

            const value = maxQ === -Infinity ? 0 : maxQ;
            V_curr[stateId] = value;
            Q_curr[stateId] = actionQs;
            policy_curr[stateId] = bestActionId;
            detail_curr[stateId] = { actions: actionDetails, bestActionId, value };
        });

        // Max-norm change vs the previous sweep.
        let delta = 0;
        this.stateIds.forEach(id => {
            const d = Math.abs((V_curr[id] ?? 0) - (V_prev[id] ?? 0));
            if (d > delta) delta = d;
        });

        this.history.push({ V: V_curr, Q: Q_curr, policy: policy_curr, backupDetails: detail_curr, delta });
        this.currentSweepIndex = this.history.length - 1;

        // Sticky convergence: latch on the first sweep under threshold; never un-latch on later
        // floating-point noise.
        if (!this.converged && delta < this.epsilon) {
            this.converged = true;
            this.convergedAtSweep = this.currentSweepIndex;
        }

        return this.currentSweepIndex;
    }

    /**
     * Hard cap shared by Play AND Step: only the T cap stops advancement. Convergence does NOT
     * block Step (stepping past convergence just re-confirms the fixed point); Play chooses to
     * stop at convergence separately in its own loop.
     */
    canAdvance() {
        return this.initialized && this.currentSweepIndex < this.T;
    }

    /** Total number of sweep snapshots (sweep 0 .. currentSweepIndex). */
    get totalSweeps() {
        return this.history.length;
    }

    /** Number of states */
    get stateCount() {
        return this.stateIds.length;
    }

    play() { this.isPlaying = true; }
    pause() { this.isPlaying = false; }

    /**
     * V-table for a given sweep index. KEEP THIS EXACT CALL SIGNATURE AND RETURN SHAPE -
     * ValuesMethodMatrix.beliefFor() depends on getValues(sweepIndex) -> {stateId: number}.
     */
    getValues(sweepIndex) {
        return this.history[sweepIndex]?.V ?? {};
    }

    /** Q-values [{actionId, actionName, qValue}] for a sweep+state. */
    getQValues(sweepIndex, stateId) {
        return this.history[sweepIndex]?.Q[stateId] ?? [];
    }

    /** argmax action (policy) for a sweep+state. */
    getBestAction(sweepIndex, stateId) {
        return this.history[sweepIndex]?.policy[stateId] ?? null;
    }

    /** Full backup detail (actions/transitions/terms) for a sweep+state. */
    getBackupDetail(sweepIndex, stateId) {
        return this.history[sweepIndex]?.backupDetails[stateId] ?? null;
    }

    /** Max-norm delta at a sweep (null for sweep 0). */
    getDelta(sweepIndex) {
        return this.history[sweepIndex]?.delta ?? null;
    }

    /** Manual override for a Q-value if one has been set (editable Q-table), else computedValue. */
    getEffectiveQValue(stateId, actionId, computedValue) {
        const key = `${stateId}:${actionId}`;
        return Object.prototype.hasOwnProperty.call(this.manualOverrides, key)
            ? this.manualOverrides[key]
            : computedValue;
    }
}
