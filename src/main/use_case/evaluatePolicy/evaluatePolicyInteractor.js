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

        // Time-dependent (π_t) policies get a genuinely different algorithm - a finite-horizon
        // backward induction, not the stationary Bellman-expectation-to-convergence sweep below -
        // see PolicyEvaluationState.evaluateTimeIndexed()'s own doc comment for why these are two
        // different quantities, not two code paths for the same one.
        const isTimeDependent = this.simulationState.isTimeDependent();
        const result = isTimeDependent
            ? this.policyEvaluationState.evaluateTimeIndexed(
                this.graph, this.simulationState, startNode.id, inputData.gamma, this.simulationState.piHorizon
            )
            : this.policyEvaluationState.evaluate(
                this.graph, this.simulationState, startNode.id, inputData.gamma, inputData.epsilon
            );
        const valueAtStart = isTimeDependent ? result.valueAt0 : result.valueAtStart;

        // Deep-ish snapshot: policy is flat {stateId: actionId} (safe to shallow-copy);
        // policyWeights is one level nested ({stateId: {actionId: weight}}) so each state's inner
        // object needs its own copy too, or a later live edit would silently mutate this "frozen"
        // snapshot through the shared reference. timeDependentPolicy is nested the same way
        // (stateId -> array), snapshotted separately (not merged into policySnapshot, which stays
        // the stationary shape every existing consumer - hover preview, restore - already expects).
        const policySnapshot = { ...this.simulationState.policy };
        const policyWeightsSnapshot = {};
        Object.entries(this.simulationState.policyWeights).forEach(([stateId, weights]) => {
            policyWeightsSnapshot[stateId] = { ...weights };
        });
        let timeDependentPolicySnapshot;
        if (isTimeDependent) {
            timeDependentPolicySnapshot = {};
            Object.entries(this.simulationState.timeDependentPolicy).forEach(([stateId, seq]) => {
                timeDependentPolicySnapshot[stateId] = seq.slice();
            });
        }

        const entry = this.policyEvaluationState.addEntry({
            valueAtStart,
            valuesByState: result.valuesByState,
            policySnapshot,
            policyWeightsSnapshot,
            timeDependentPolicySnapshot,
            horizon: isTimeDependent ? this.simulationState.piHorizon : undefined
        });

        this.outputBoundary.presentEvaluated(entry);
    }
}
