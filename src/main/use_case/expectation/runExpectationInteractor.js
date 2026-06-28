class RunExpectationInteractor extends RunExpectationInputBoundary {
    constructor(graph, traceGenerator, expectationState, outputBoundary) {
        super();
        this.graph = graph;
        this.traceGenerator = traceGenerator;
        this.expectationState = expectationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        const { startNodeId, policy, runs, maxSteps, gamma } = inputData;

        const startNode = this.graph.getNodeById(startNodeId);
        if (!startNode || startNode.type !== 'state') {
            return this.outputBoundary.presentError('Start node is not a valid state.');
        }

        const validRunCounts = [4, 8, 16];
        if (!validRunCounts.includes(runs)) {
            return this.outputBoundary.presentError(`Invalid run count: ${runs}. Must be 4, 8, or 16.`);
        }
        if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 1000) {
            return this.outputBoundary.presentError(`Invalid maxSteps: ${maxSteps}. Must be integer in [1, 1000].`);
        }
        if (!isFinite(gamma) || gamma < 0 || gamma > 1) {
            return this.outputBoundary.presentError(`Invalid gamma: ${gamma}. Must be finite in [0, 1].`);
        }

        const policySnapshot = Object.assign({}, policy);
        const policyFallbacks = this._validatePolicy(policySnapshot);

        const rollouts = [];
        for (let i = 0; i < runs; i++) {
            const trace = this.traceGenerator.generate(startNode, maxSteps * 2 + 1, policySnapshot);
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
        this.expectationState.runs = runs;
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
