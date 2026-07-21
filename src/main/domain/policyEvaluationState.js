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

// Max simultaneous rows the Policy log holds (policy-logging.md spec) - enforced by callers
// BEFORE they even open the naming modal (see main.js's onEvaluatePolicy/_withPolicyNameGate),
// not inside addEntry() here, so a full log shows a toast instead of prompting for a name that
// would then be refused.
const POLICY_LOG_MAX_ENTRIES = 6;

// How many steps evaluateCurve() walks forward for a STATIONARY policy's value-over-time chart
// curve (a π_t policy's own curve instead stops at its horizon - see EvaluatePolicyInteractor).
// Matches π_t's own Max-steps slider bound (1-20) so both curve flavors read on a comparable
// x-axis scale.
const POLICY_LOG_CURVE_HORIZON = 20;

class PolicyEvaluationState {
    constructor() {
        this.entries = [];
        this._nextId = 1; // persists across removeEntry() splices so ids/colors never get reused
    }

    static get MAX_ENTRIES() {
        return POLICY_LOG_MAX_ENTRIES;
    }

    static get CURVE_HORIZON() {
        return POLICY_LOG_CURVE_HORIZON;
    }

    // Sanitizes + truncates free-text input into something safe to embed in a LaTeX \text{...}
    // label (strips \ { } $ ^ _) and short enough for the log row's fixed-width name column
    // (policy-logging.md's own "≤12 chars" cap). Shared by every caller that turns a raw name
    // into a label - EvaluatePolicyInteractor/LogOptimalPolicyInteractor's own _buildLabel()
    // helpers, and renameEntry() below - so the "name it now" and "rename it later" paths can't
    // drift out of sync on escaping/length rules. Returns '' (not the original input) when the
    // trimmed name is empty, so callers can `||` a fallback.
    static sanitizeName(rawName) {
        const trimmed = (rawName || '').trim();
        if (!trimmed) return '';
        return trimmed.replace(/[\\{}$^_]/g, '').slice(0, 12);
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

                const actionProbs = simulationState.actionProbsForState(stateId, actions);

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
    // policy - concrete action gets 1.0, a weighted-random slot gets its normalized shares, the
    // 'random' sentinel splits uniformly, and a state with no time-dependent entry at all
    // (terminal/single-action states never need one) also splits uniformly, exactly like
    // evaluate()'s own 'uniform' fallback above.
    _actionProbsAtTime(simulationState, stateId, actions, t) {
        const piTAction = simulationState.resolvePiTAction
            ? simulationState.resolvePiTAction(stateId, t)
            : null;
        if (piTAction !== null && piTAction !== undefined && piTAction !== 'random') {
            if (typeof piTAction === 'object') {
                const probs = simulationState._normalizeWeightsObject(piTAction, actions);
                if (probs) return probs;
            } else {
                const normalizedId = Number(piTAction);
                if (actions.some(a => Number(a) === normalizedId)) {
                    const probs = new Map();
                    actions.forEach(a => probs.set(Number(a), Number(a) === normalizedId ? 1 : 0));
                    return probs;
                }
            }
        }
        const uniform = new Map();
        actions.forEach(a => uniform.set(Number(a), 1 / actions.length));
        return uniform;
    }

    // Map<actionId, probability> for one state under an arbitrary DETERMINISTIC policy snapshot
    // (stateId -> actionId, e.g. Value Iteration's own greedy policy) rather than
    // simulationState's live policy - falls back to uniform for a state with no entry, same
    // "unlisted state" fallback evaluate()/actionProbsForState() already use elsewhere.
    _deterministicProbs(actions, chosenActionId) {
        const chosen = chosenActionId !== undefined && chosenActionId !== null ? Number(chosenActionId) : null;
        const hasChosen = chosen !== null && actions.some(a => Number(a) === chosen);
        const probs = new Map();
        actions.forEach(a => probs.set(Number(a), hasChosen ? (Number(a) === chosen ? 1 : 0) : 1 / actions.length));
        return probs;
    }

    // Exact forward propagation of the Markov chain induced by a policy - either whatever
    // `simulationState` currently holds (stationary or time-dependent, resolved the SAME way
    // evaluate()/evaluateTimeIndexed() already do - actionProbsForState()/_actionProbsAtTime()),
    // or, when `policySnapshot` is given, an ARBITRARY deterministic {stateId: actionId} snapshot
    // instead - needed because LogOptimalPolicyInteractor's greedy policy is never reflected in
    // simulationState.policy (VI's own optimal policy is independent of whatever the user has
    // manually configured in Policy mode). Returns valuesByT, an array where
    // valuesByT[t] = E[sum_{k=0}^{t-1} gamma^k * r_k], the expected discounted return accumulated
    // over the FIRST t steps from startStateId. This is the exact counterpart of Monte Carlo's
    // own "G accumulated so far at t" curve (ExpectationState.getMeansOverTime()/
    // _computeUtilities()) - same x-axis meaning (steps elapsed since t=0, globally
    // gamma^k-discounted from the start), same asymptote (valuesByT[horizon] approaches
    // evaluate()'s valueAtStart as horizon grows, and exactly equals evaluateTimeIndexed()'s
    // valueAt0 when horizon matches a π_t policy's own horizon) - just computed by propagating
    // the exact state-visitation probability distribution forward one step at a time instead of
    // sampling rollouts. This is DELIBERATELY NOT the backward-induction V_t(s)
    // evaluateTimeIndexed() computes (value-TO-GO from t, gamma^0-discounted from t's own
    // perspective) - a different quantity that wouldn't line up with the MC chart's own x-axis
    // meaning.
    evaluateCurve(graph, simulationState, startStateId, gamma, horizon, policySnapshot = null) {
        const states = graph.nodes.filter(n => n.type === 'state');
        const stateIds = states.map(s => s.id);
        const isTimeDependent = !policySnapshot && simulationState.isTimeDependent && simulationState.isTimeDependent();

        let dist = {};
        stateIds.forEach(id => { dist[id] = 0; });
        dist[startStateId] = 1;

        const valuesByT = [0];
        let cumulative = 0;

        for (let t = 0; t < horizon; t++) {
            const nextDist = {};
            stateIds.forEach(id => { nextDist[id] = 0; });
            let expectedReward = 0;

            stateIds.forEach(stateId => {
                const p = dist[stateId] || 0;
                if (p === 0) return;
                const stateNode = graph.getNodeById(stateId);
                const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
                if (actions.length === 0) {
                    nextDist[stateId] += p; // terminal/no-action state: stays put, no more reward
                    return;
                }

                const actionProbs = policySnapshot
                    ? this._deterministicProbs(actions, policySnapshot[stateId])
                    : (isTimeDependent
                        ? this._actionProbsAtTime(simulationState, stateId, actions, t)
                        : simulationState.actionProbsForState(stateId, actions));

                actions.forEach(actionId => {
                    const aProb = actionProbs.get(Number(actionId)) ?? 0;
                    if (aProb === 0) return;
                    const actionNode = graph.getNodeById(actionId);
                    const transitions = (actionNode && actionNode.sas) ? actionNode.sas : [];
                    transitions.forEach(({ nextState, probability, reward }) => {
                        const branchProb = p * aProb * probability;
                        expectedReward += branchProb * reward;
                        nextDist[nextState] = (nextDist[nextState] || 0) + branchProb;
                    });
                });
            });

            cumulative += Math.pow(gamma, t) * expectedReward;
            valuesByT.push(cumulative);
            dist = nextDist;
        }

        return valuesByT;
    }

    // Appends a fully-formed entry (label/id/isBest computed here) and returns it. `horizon` is
    // present only for time-dependent (π_t) entries - stationary entries leave it undefined,
    // which rightPanel.js's Policy log already renders as an em-dash in the reserved "t" column
    // without any change needed there. `label`, if given, is used verbatim
    // (LogOptimalPolicyInteractor's own π* + custom-name label) instead of the auto-generated
    // sequential \pi_{n} - every other existing caller (EvaluatePolicyInteractor) omits it and
    // keeps the auto label unchanged. `name` is the plain-text (no LaTeX) version of whatever
    // produced `label`, used to prefill the log row's rename input - falls back to the numeric id
    // when no custom name was given, same as `label`'s own \pi_{n} fallback.
    addEntry({ valueAtStart, mcEstimate, valuesByState, valueCurve, policySnapshot, policyWeightsSnapshot, timeDependentPolicySnapshot, horizon, label, name, gamma, maxSteps }) {
        const id = this._nextId++;
        const entry = {
            id,
            label: label || `\\pi_{${id}}`,
            name: name || String(id),
            valueAtStart,
            mcEstimate,
            valuesByState,
            valueCurve,
            policySnapshot,
            policyWeightsSnapshot,
            timeDependentPolicySnapshot,
            horizon,
            // Frozen at log time - the same (gamma, maxSteps) mcEstimate above was sampled with,
            // kept around so the chart overlays' lazy return-distribution histogram (see
            // ExpectationChartView) can resample under IDENTICAL parameters later, on-demand,
            // rather than whatever gamma/maxSteps happen to be live by the time a chip is first
            // revealed.
            gamma,
            maxSteps,
            isBest: false
        };
        this.entries.push(entry);
        this._recomputeBest();
        return entry;
    }

    // Removes one entry by id (policy-logging.md §2's row "×") and re-derives isBest - a plain
    // splice, no reindexing of other entries' ids (ids are permanent, from `_nextId`, precisely so
    // chart chips/cached histogram samples keyed off them stay valid across removals of OTHER
    // entries).
    removeEntry(id) {
        const idx = this.entries.findIndex(e => e.id === id);
        if (idx === -1) return;
        this.entries.splice(idx, 1);
        this._recomputeBest();
    }

    // Renames an entry in place (policy-logging.md §1's double-click-to-rename). Preserves
    // whichever label "kind" the entry already had - a logged-optimal entry's \pi^{*} star isn't
    // lost on rename, it just gets a new \text{...} subscript, exactly like
    // LogOptimalPolicyInteractor._buildLabel() builds it the first time. Falls back to the
    // entry's previous name (not the numeric id) when the new name sanitizes to empty, so
    // clearing the input and blurring doesn't silently rename to a bare number.
    renameEntry(id, rawName) {
        const entry = this.entries.find(e => e.id === id);
        if (!entry) return;
        const safe = PolicyEvaluationState.sanitizeName(rawName) || entry.name;
        entry.name = safe;
        entry.label = (entry.label && entry.label.indexOf('\\pi^{*}') === 0)
            ? `\\pi^{*}_{\\text{${safe}}}`
            : `\\pi_{\\text{${safe}}}`;
    }

    // Recomputes isBest across ALL entries (not just a newly-added one) since adding OR removing
    // an entry can both change which one wins - only one entry is ever isBest at a time, ties
    // keep whichever appears earliest in `entries`.
    _recomputeBest() {
        if (this.entries.length === 0) return;
        let bestIdx = 0;
        for (let i = 1; i < this.entries.length; i++) {
            if (this.entries[i].valueAtStart > this.entries[bestIdx].valueAtStart) bestIdx = i;
        }
        this.entries.forEach((e, i) => { e.isBest = (i === bestIdx); });
    }

    clear() {
        this.entries = [];
    }
}
