class RunExpectationInteractor extends RunExpectationInputBoundary {
    constructor(graph, traceGenerator, expectationState, outputBoundary) {
        super();
        this.graph = graph;
        this.traceGenerator = traceGenerator;
        this.expectationState = expectationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        const { startNodeId, policy, displayRuns, maxSteps, gamma, policyWeights = {} } = inputData;

        const startNode = this.graph.getNodeById(startNodeId);
        if (!startNode || startNode.type !== 'state') {
            return this.outputBoundary.presentError('Start node is not a valid state.');
        }

        const validDisplayCounts = [12, 24, 48];
        if (!validDisplayCounts.includes(displayRuns)) {
            return this.outputBoundary.presentError(`Invalid display run count: ${displayRuns}. Must be 12, 24, or 48.`);
        }
        if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1000) {
            return this.outputBoundary.presentError(`Invalid maxSteps: ${maxSteps}. Must be integer in [1, 1000].`);
        }
        if (!isFinite(gamma) || gamma < 0 || gamma > 1) {
            return this.outputBoundary.presentError(`Invalid gamma: ${gamma}. Must be finite in [0, 1].`);
        }

        const policySnapshot = Object.assign({}, policy);
        const policyWeightsSnapshot = Object.assign({}, policyWeights);
        const policyFallbacks = this._validatePolicy(policySnapshot).concat(this._validatePolicyWeights(policyWeightsSnapshot));

        const rollouts = [];
        for (let i = 0; i < EXPECTATION_TOTAL_RUNS; i++) {
            const trace = this.traceGenerator.generate(startNode, maxSteps * 2 + 1, policySnapshot, policyWeightsSnapshot);
            const rewardResult = this._extractRewards(trace);
            if (rewardResult.error) {
                return this.outputBoundary.presentError(rewardResult.error);
            }
            const rewards = rewardResult.rewards;
            const numSteps = Math.floor((trace.length - 1) / 2);
            const utilities = this._computeUtilities(rewards, gamma);
            rollouts.push({ trace, rewards, utilities, numSteps });
        }

        this.expectationState.setRollouts(rollouts);
        this.expectationState.gamma = gamma;
        this.expectationState.displayRuns = displayRuns;
        this.expectationState.maxSteps = maxSteps;
        this.expectationState.policyFallbacks = policyFallbacks;

        const state = this.expectationState;
        const meansOverTime = state.getMeansOverTime();
        const sigmasOverTime = state.getSigmasOverTime();

        this.outputBoundary.presentComplete({
            success: true,
            error: null,
            currentT: 0,
            maxT: state.maxT,
            rollouts,
            mean: state.getMeanAtT(0),
            sigma: state.getSigmaAtT(0),
            meansOverTime,
            sigmasOverTime,
            policyFallbacks
        });
    }

    _validatePolicy(policySnapshot) {
        const fallbacks = [];
        for (const [stateId, actionId] of Object.entries(policySnapshot)) {
            const stateNode = this.graph.getNodeById(Number(stateId));
            if (!stateNode) continue;
            if (!stateNode.actions.includes(Number(actionId))) {
                fallbacks.push({ stateId: Number(stateId), configuredActionId: Number(actionId), reason: 'action_not_available' });
            }
        }
        return fallbacks;
    }

    // Mirrors _validatePolicy for weighted-random policies: reports (once per state) when a
    // configured weight references an action no longer on that state (e.g. deleted after the
    // weight was set) - sampling itself already silently drops such entries and redistributes
    // across the rest (see TraceGenerator.selectRandomAction), this just surfaces it in the UI.
    _validatePolicyWeights(policyWeightsSnapshot) {
        const fallbacks = [];
        for (const [stateId, weights] of Object.entries(policyWeightsSnapshot)) {
            const stateNode = this.graph.getNodeById(Number(stateId));
            if (!stateNode) continue;
            const validActionIds = new Set(stateNode.actions.map(Number));
            const staleActionId = Object.keys(weights)
                .map(Number)
                .find(actionId => !validActionIds.has(actionId));
            if (staleActionId !== undefined) {
                fallbacks.push({ stateId: Number(stateId), configuredActionId: staleActionId, reason: 'action_not_available' });
            }
        }
        return fallbacks;
    }

    _extractRewards(trace) {
        const rewards = [];
        const numSteps = Math.floor((trace.length - 1) / 2);
        for (let k = 0; k < numSteps; k++) {
            const actionEntry = trace[2 * k + 1];
            const nextStateEntry = trace[2 * k + 2];
            const actionNode = this.graph.getNodeById(actionEntry.id);
            if (!actionNode) {
                return { error: `Action node ${actionEntry.id} not found in graph.` };
            }
            const transition = actionNode.sas.find(t => t.nextState === nextStateEntry.id);
            if (!transition) {
                return { error: `Transition from action ${actionEntry.id} to state ${nextStateEntry.id} not found.` };
            }
            if (!isFinite(transition.reward)) {
                return { error: `Non-finite reward on transition from action ${actionEntry.id} to state ${nextStateEntry.id}.` };
            }
            rewards.push(transition.reward);
        }
        return { rewards };
    }

    _computeUtilities(rewards, gamma) {
        const utilities = [0];
        for (let k = 0; k < rewards.length; k++) {
            utilities.push(utilities[k] + Math.pow(gamma, k) * rewards[k]);
        }
        return utilities;
    }
}
