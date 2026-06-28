class RunExpectationInputData {
    constructor(startNodeId, policy, runs, maxSteps, gamma) {
        this.startNodeId = startNodeId;
        this.policy = policy;
        this.runs = runs;
        this.maxSteps = maxSteps;
        this.gamma = gamma;
    }
}
