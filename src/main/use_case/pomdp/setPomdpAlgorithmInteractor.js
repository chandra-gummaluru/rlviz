// Interactor for switching the POMDP exploration algorithm and its hyperparameter.
// Does NOT reset Q/N/belief — switching algorithm only changes selection behavior going forward,
// preserving learned Q values across algorithm switches (same rationale as SetQLAlgorithmInteractor).
class SetPomdpAlgorithmInteractor extends SetPomdpAlgorithmInputBoundary {
    constructor(pomdpState, outputBoundary) {
        super();
        this.pomdpState = pomdpState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        const validAlgorithms = ['epsilonGreedy', 'ucb', 'softmax', 'optimistic'];
        if (!inputData || !validAlgorithms.includes(inputData.algorithm)) {
            this.outputBoundary.presentError(`Unknown algorithm: ${inputData && inputData.algorithm}`);
            return;
        }

        this.pomdpState.algorithm = inputData.algorithm;

        const p = inputData.param;
        if (p !== undefined && p !== null && isFinite(p)) {
            if (inputData.algorithm === 'epsilonGreedy') {
                this.pomdpState.epsilon = Math.max(0, Math.min(1, p));
            } else if (inputData.algorithm === 'ucb') {
                this.pomdpState.ucbC = Math.max(0, p);
            } else if (inputData.algorithm === 'softmax') {
                this.pomdpState.softmaxTau = Math.max(0.01, p);
            } else if (inputData.algorithm === 'optimistic') {
                this.pomdpState.optimisticQ0 = p;
            }
        }

        this.outputBoundary.presentComplete({ algorithm: inputData.algorithm });
    }
}
