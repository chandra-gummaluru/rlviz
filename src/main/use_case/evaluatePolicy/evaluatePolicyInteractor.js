// Interactor for Evaluate Policy - thin, mirroring RunVIInteractor's own division of labor: no
// Bellman math here, that lives entirely on PolicyEvaluationState.evaluate(). This interactor's
// only job is validate -> call the domain entity -> snapshot the policy -> append a log entry ->
// present.
class EvaluatePolicyInteractor extends EvaluatePolicyInputBoundary {
    constructor(graph, simulationState, policyEvaluationState, outputBoundary, startNodeProvider) {
        super();
        this.graph = graph;
        this.simulationState = simulationState;
        this.policyEvaluationState = policyEvaluationState;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;
    }

    execute(inputData) {
        const startNode = this.startNodeProvider();
        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first');
            return;
        }

        const result = this.policyEvaluationState.evaluate(
            this.graph, this.simulationState, startNode.id, inputData.gamma, inputData.epsilon
        );

        // Deep-ish snapshot: policy is flat {stateId: actionId} (safe to shallow-copy);
        // policyWeights is one level nested ({stateId: {actionId: weight}}) so each state's inner
        // object needs its own copy too, or a later live edit would silently mutate this "frozen"
        // snapshot through the shared reference.
        const policySnapshot = { ...this.simulationState.policy };
        const policyWeightsSnapshot = {};
        Object.entries(this.simulationState.policyWeights).forEach(([stateId, weights]) => {
            policyWeightsSnapshot[stateId] = { ...weights };
        });

        const entry = this.policyEvaluationState.addEntry({
            valueAtStart: result.valueAtStart,
            valuesByState: result.valuesByState,
            policySnapshot,
            policyWeightsSnapshot
        });

        this.outputBoundary.presentEvaluated(entry);
    }
}
