class RunExpectationInputData {
    constructor(startNodeId, policy, displayRuns, maxSteps, gamma, policyWeights = {}, timeDependentPolicy = null) {
        this.startNodeId = startNodeId;
        this.policy = policy;
        this.displayRuns = displayRuns;
        this.maxSteps = maxSteps;
        this.gamma = gamma;
        this.policyWeights = policyWeights;
        // stateId -> array[t] of (actionId | 'random'), or null when the policy is stationary -
        // see TraceGenerator.generate()'s own timeDependentPolicy param.
        this.timeDependentPolicy = timeDependentPolicy;
    }
}
