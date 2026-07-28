// Interactor for Log Optimal Policy - thin, mirroring EvaluatePolicyInteractor's own division of
// labor: no Bellman math here. ValueIterationState has ALREADY computed the real optimal V*/Q*
// via its Bellman OPTIMALITY backup (computeNextSweep()'s max_a); this interactor's only job is
// to read out whichever sweep is "the answer" (converged, or the T-cap fallback), snapshot its
// greedy policy, and append it to the SAME Policy log Evaluate π writes to - so the two features
// share one list, distinguished only by the \pi^{*} label this interactor builds (see below)
// versus EvaluatePolicyInteractor's auto \pi_k labels.
class LogOptimalPolicyInteractor extends LogOptimalPolicyInputBoundary {
    constructor(valueIterationState, policyEvaluationState, outputBoundary, startNodeProvider, traceGenerator, simulationState) {
        super();
        this.valueIterationState = valueIterationState;
        this.policyEvaluationState = policyEvaluationState;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;
        this.traceGenerator = traceGenerator;
        this.simulationState = simulationState;
    }

    execute(inputData) {
        const startNode = this.startNodeProvider();
        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first');
            return;
        }

        const viState = this.valueIterationState;
        if (!viState || !viState.initialized) {
            this.outputBoundary.presentError('Run Value Iteration first');
            return;
        }

        // Whichever sweep is "the answer": the sweep convergence actually latched at, or (if the
        // T cap was hit first, or the caller is logging mid-run) the latest computed sweep -
        // ValueIterationState.computeNextSweep()'s own sticky-convergence comment explains why
        // convergedAtSweep is the more authoritative of the two when it's set.
        const sweepIdx = viState.convergedAtSweep ?? viState.currentSweepIndex;
        const valuesByState = viState.getValues(sweepIdx);
        const valueAtStart = valuesByState[startNode.id] ?? 0;

        // ValueIterationState.history[sweepIdx].policy is already the flat {stateId: actionId}
        // greedy-policy shape PolicyEvaluationState.addEntry() expects (same shape
        // EvaluatePolicyInteractor snapshots from simulationState.policy) - copy directly, no
        // per-state getBestAction() loop needed.
        const policySnapshot = { ...viState.history[sweepIdx].policy };

        // "MC estimate" column: a fresh sampled estimate under this exact greedy policy, same
        // gamma VI's own optimality sweep used (the greedy policy has no time-dependent form, so
        // there's no π_t horizon to mirror here - simulationState.maxSteps is the generic cap).
        const mcEstimate = PolicyMcSampler.estimateValue(this.traceGenerator.graph, this.traceGenerator, startNode, {
            policy: policySnapshot,
            policyWeights: {},
            timeDependentPolicy: null,
            maxSteps: this.simulationState.maxSteps,
            gamma: viState.gamma
        });

        // Value-over-time chart curve (policy-logging.md §3) - the greedy policy VI just
        // converged to is stationary (no π_t horizon of its own), so this walks the same shared
        // POLICY_LOG_CURVE_HORIZON EvaluatePolicyInteractor's stationary entries use. Passes
        // policySnapshot explicitly (not just `this.simulationState`) since VI's greedy policy is
        // independent of whatever's currently live in simulationState.policy - see
        // PolicyEvaluationState.evaluateCurve()'s own doc comment.
        const valueCurve = this.policyEvaluationState.evaluateCurve(
            this.traceGenerator.graph, this.simulationState, startNode.id, viState.gamma,
            PolicyEvaluationState.CURVE_HORIZON, policySnapshot
        );

        const name = PolicyEvaluationState.sanitizeName(inputData.name) || 'optimal';
        const entry = this.policyEvaluationState.addEntry({
            valueAtStart,
            mcEstimate,
            valuesByState,
            valueCurve,
            policySnapshot,
            policyWeightsSnapshot: {},
            label: this._buildLabel(name),
            name,
            gamma: viState.gamma,
            maxSteps: this.simulationState.maxSteps
        });

        this.outputBoundary.presentLogged(entry);
    }

    // \pi^{*} (star = "this is THE optimal policy", not just a logged evaluation) subscripted
    // with the user's own name, e.g. "risky-a1" -> \pi^{*}_{\text{risky-a1}}. Takes the ALREADY
    // sanitized name (execute() needs the sanitized plain form for entry.name too) rather than
    // re-sanitizing here.
    _buildLabel(safeName) {
        return `\\pi^{*}_{\\text{${safeName}}}`;
    }
}
