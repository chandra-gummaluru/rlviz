class RunExpectationInputData {
    constructor(startNodeId, policy, displayRuns, maxSteps, gamma, policyWeights = {}) {
        this.startNodeId = startNodeId;
        this.policy = policy;
        this.displayRuns = displayRuns;
        this.maxSteps = maxSteps;
        this.gamma = gamma;
        this.policyWeights = policyWeights;
    }
}
