// Domain entity: exact evaluation of a FIXED policy (not the optimal one Value Iteration
// computes). Owns both the log of past evaluations and the algorithm itself, mirroring
// ValueIterationState's own "owns history + owns the Bellman backup" shape.
//
// evaluate() iterates the Bellman EXPECTATION backup - V(s) = sum_a pi(a|s) * sum_s' P(s'|s,a) *
// [R + gamma*V(s')] - to convergence. There is NO max_a anywhere here: pi(a|s) comes from
// whatever the user actually configured (simulationState.policy/.policyWeights), via the SAME
// getPolicyMode()/_normalizedProbsForState() weighting logic Build/Policy mode's own simulation
// and canvas rendering already use - reused verbatim, not reimplemented. Using max_a here would
// make this identical to (and redundant with) ValueIterationState's V*.
class PolicyEvaluationState {
    constructor() {
        this.entries = [];
    }

    // Pure computation - does not mutate this.entries. startStateId is required to report
    // valueAtStart (unlike ValueIterationState, which reports every state and has no single
    // "start" concept baked into the algorithm itself).
    evaluate(graph, simulationState, startStateId, gamma, epsilon = 0.01) {
        const states = graph.nodes.filter(n => n.type === 'state');
        const stateIds = states.map(s => s.id);

        let V = {};
        stateIds.forEach(id => { V[id] = 0; });

        const MAX_SWEEPS = 500; // safety cap - well-behaved MDPs (gamma < 1) converge far sooner
        for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
            const V_next = {};
            let delta = 0;

            stateIds.forEach(stateId => {
                const stateNode = graph.getNodeById(stateId);
                const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
                if (actions.length === 0) {
                    V_next[stateId] = 0;
                    return;
                }

                const actionProbs = this._actionProbsForState(simulationState, stateId, actions);

                let value = 0;
                actions.forEach(actionId => {
                    const prob = actionProbs.get(Number(actionId)) ?? 0;
                    if (prob === 0) return;
                    const actionNode = graph.getNodeById(actionId);
                    const transitions = (actionNode && actionNode.sas) ? actionNode.sas : [];
                    let Q = 0;
                    transitions.forEach(({ nextState, probability, reward }) => {
                        const nextValue = V[nextState] ?? 0;
                        Q += probability * (reward + gamma * nextValue);
                    });
                    value += prob * Q;
                });

                V_next[stateId] = value;
                const d = Math.abs(value - (V[stateId] ?? 0));
                if (d > delta) delta = d;
            });

            V = V_next;
            if (delta < epsilon) break;
        }

        return { valueAtStart: V[startStateId] ?? 0, valuesByState: V };
    }

    // Exact finite-horizon evaluation of a TIME-DEPENDENT (π_t) policy via backward induction -
    // a genuinely different algorithm from evaluate() above, not a parameterized variant of it.
    // evaluate() iterates a STATIONARY policy's Bellman expectation backup to ε-convergence,
    // which only makes sense because a stationary policy has a well-defined infinite-horizon
    // fixed point. A time-varying policy has no such fixed point - it only has `horizon`
    // well-defined actions per state - so "exact" here means "the expected return from t=0 under
    // this specific finite-horizon policy", computed by walking the horizon backward from
    // V_horizon(s) = 0 (no more reward can accrue once the horizon is reached) down to V_0.
    // Returns { valueAt0, valuesByState } - valuesByState is V_0, the value AT THE START of the
    // horizon, for every state (mirrors evaluate()'s own valuesByState shape).
    evaluateTimeIndexed(graph, simulationState, startStateId, gamma, horizon) {
        const states = graph.nodes.filter(n => n.type === 'state');
        const stateIds = states.map(s => s.id);

        let V = {};
        stateIds.forEach(id => { V[id] = 0; }); // V_horizon(s) = 0 for all s

        for (let t = horizon - 1; t >= 0; t--) {
            const V_prev = {}; // V_t, computed from V (currently V_{t+1})
            stateIds.forEach(stateId => {
                const stateNode = graph.getNodeById(stateId);
                const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
                if (actions.length === 0) {
                    V_prev[stateId] = 0;
                    return;
                }

                const actionProbs = this._actionProbsAtTime(simulationState, stateId, actions, t);

                let value = 0;
                actions.forEach(actionId => {
                    const prob = actionProbs.get(Number(actionId)) ?? 0;
                    if (prob === 0) return;
                    const actionNode = graph.getNodeById(actionId);
                    const transitions = (actionNode && actionNode.sas) ? actionNode.sas : [];
                    let Q = 0;
                    transitions.forEach(({ nextState, probability, reward }) => {
                        const nextValue = V[nextState] ?? 0;
                        Q += probability * (reward + gamma * nextValue);
                    });
                    value += prob * Q;
                });

                V_prev[stateId] = value;
            });
            V = V_prev;
        }

        return { valueAt0: V[startStateId] ?? 0, valuesByState: V };
    }

    // Map<actionId, probability> for one state AT ONE ELAPSED TIMESTEP t, under the time-dependent
    // policy - concrete action gets 1.0, the 'random' sentinel splits uniformly, and a state with
    // no time-dependent entry at all (terminal/single-action states never need one) also splits
    // uniformly, exactly like evaluate()'s own 'uniform' fallback above.
    _actionProbsAtTime(simulationState, stateId, actions, t) {
        const piTAction = simulationState.resolvePiTAction
            ? simulationState.resolvePiTAction(stateId, t)
            : null;
        if (piTAction !== null && piTAction !== undefined && piTAction !== 'random') {
            const normalizedId = Number(piTAction);
            if (actions.some(a => Number(a) === normalizedId)) {
                const probs = new Map();
                actions.forEach(a => probs.set(Number(a), Number(a) === normalizedId ? 1 : 0));
                return probs;
            }
        }
        const uniform = new Map();
        actions.forEach(a => uniform.set(Number(a), 1 / actions.length));
        return uniform;
    }

    // Map<actionId, probability> for one state, under the CURRENT policy - deterministic gets
    // 1.0 on the chosen action, weighted gets the normalized slider weights, uniform splits
    // evenly. Mirrors EdgeViewModel.policyEdgeProbability's own branching on getPolicyMode()
    // exactly, so canvas rendering and this evaluator never disagree about what the policy means.
    _actionProbsForState(simulationState, stateId, actions) {
        const policyMode = simulationState.getPolicyMode(stateId);
        if (policyMode === 'deterministic') {
            const chosen = simulationState.getPolicyAction(stateId);
            const probs = new Map();
            actions.forEach(a => probs.set(Number(a), Number(a) === Number(chosen) ? 1 : 0));
            return probs;
        }
        if (policyMode === 'weighted') {
            const probs = simulationState._normalizedProbsForState(stateId, actions);
            if (probs) return probs;
        }
        const uniform = new Map();
        actions.forEach(a => uniform.set(Number(a), 1 / actions.length));
        return uniform;
    }

    // Appends a fully-formed entry (label/id/isBest computed here) and returns it. Recomputes
    // isBest across ALL entries (not just the new one) since a new entry could tie-break or
    // simply not beat the existing best - only one entry is ever isBest at a time, ties keep
    // whichever was logged first. `horizon` is present only for time-dependent (π_t) entries -
    // stationary entries leave it undefined, which rightPanel.js's Policy log already renders as
    // an em-dash in the reserved "t" column without any change needed there.
    addEntry({ valueAtStart, valuesByState, policySnapshot, policyWeightsSnapshot, timeDependentPolicySnapshot, horizon }) {
        const entry = {
            id: this.entries.length + 1,
            label: `\\pi_{${this.entries.length + 1}}`,
            valueAtStart,
            valuesByState,
            policySnapshot,
            policyWeightsSnapshot,
            timeDependentPolicySnapshot,
            horizon,
            isBest: false
        };
        this.entries.push(entry);

        let bestIdx = 0;
        for (let i = 1; i < this.entries.length; i++) {
            if (this.entries[i].valueAtStart > this.entries[bestIdx].valueAtStart) bestIdx = i;
        }
        this.entries.forEach((e, i) => { e.isBest = (i === bestIdx); });

        return entry;
    }

    clear() {
        this.entries = [];
    }
}
