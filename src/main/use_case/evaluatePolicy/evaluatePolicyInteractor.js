// Interactor for Evaluate Policy - thin, mirroring RunVIInteractor's own division of labor: no
// Bellman math here, that lives entirely on PolicyEvaluationState.evaluate(). This interactor's
// only job is validate -> call the domain entity -> snapshot the policy -> append a log entry ->
// present.
class EvaluatePolicyInteractor extends EvaluatePolicyInputBoundary {
    constructor(graph, simulationState, policyEvaluationState, outputBoundary, startNodeProvider, traceGenerator) {
        super();
        this.graph = graph;
        this.simulationState = simulationState;
        this.policyEvaluationState = policyEvaluationState;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;
        this.traceGenerator = traceGenerator;
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
        // A weighted-random π_t slot is itself an object, same "shared reference" risk as
        // policyWeights above - seq.slice() alone only copies the array, not each such element.
        const policySnapshot = { ...this.simulationState.policy };
        const policyWeightsSnapshot = {};
        Object.entries(this.simulationState.policyWeights).forEach(([stateId, weights]) => {
            policyWeightsSnapshot[stateId] = { ...weights };
        });
        let timeDependentPolicySnapshot;
        if (isTimeDependent) {
            timeDependentPolicySnapshot = {};
            Object.entries(this.simulationState.timeDependentPolicy).forEach(([stateId, seq]) => {
                timeDependentPolicySnapshot[stateId] = seq.map(v => (v && typeof v === 'object') ? { ...v } : v);
            });
        }

        // "MC estimate" column: a fresh, independent sampled estimate under this exact policy -
        // same gamma as the exact evaluation above, so the two columns are apples-to-apples.
        // Horizon for the sampler mirrors whichever cap actually bounds this policy's episodes:
        // piHorizon for π_t (evaluateTimeIndexed's own finite horizon), maxSteps otherwise.
        const maxSteps = isTimeDependent ? this.simulationState.piHorizon : this.simulationState.maxSteps;
        const mcEstimate = PolicyMcSampler.estimateValue(this.graph, this.traceGenerator, startNode, {
            policy: policySnapshot,
            policyWeights: policyWeightsSnapshot,
            timeDependentPolicy: timeDependentPolicySnapshot || null,
            maxSteps,
            gamma: inputData.gamma
        });

        // Value-over-time chart curve (policy-logging.md §3): a π_t policy's curve stops at its
        // own horizon (beyond it the policy has no defined action); a stationary policy's curve
        // walks the shared POLICY_LOG_CURVE_HORIZON instead, since it has no horizon of its own.
        const curveHorizon = isTimeDependent ? this.simulationState.piHorizon : PolicyEvaluationState.CURVE_HORIZON;
        const valueCurve = this.policyEvaluationState.evaluateCurve(
            this.graph, this.simulationState, startNode.id, inputData.gamma, curveHorizon
        );

        const name = PolicyEvaluationState.sanitizeName(inputData.name);
        const entry = this.policyEvaluationState.addEntry({
            valueAtStart,
            mcEstimate,
            valuesByState: result.valuesByState,
            valueCurve,
            policySnapshot,
            policyWeightsSnapshot,
            timeDependentPolicySnapshot,
            horizon: isTimeDependent ? this.simulationState.piHorizon : undefined,
            label: this._buildLabel(name),
            name,
            gamma: inputData.gamma,
            maxSteps
        });

        this.outputBoundary.presentEvaluated(entry);
    }

    // Undefined when no name was given (namePolicyModal.js cancelled, or a future caller skips
    // it) - PolicyEvaluationState.addEntry() falls back to its own auto \pi_{n} label in that
    // case, unchanged from before this method existed. No \pi^{*} star here (unlike
    // LogOptimalPolicyInteractor's identical-shaped helper) - Evaluate π evaluates whatever
    // policy is currently configured, not necessarily the optimal one. Takes the ALREADY
    // sanitized name (execute() needs the sanitized plain form for entry.name too) rather than
    // re-sanitizing here.
    _buildLabel(safeName) {
        return safeName ? `\\pi_{\\text{${safeName}}}` : undefined;
    }
}
