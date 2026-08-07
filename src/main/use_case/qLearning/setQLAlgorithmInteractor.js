// Interactor for switching the Q-learning exploration algorithm and its hyperparameter.
// Deliberately does NOT reset Q/N — switching algorithm only changes the default for
// not-yet-visited pairs (optimistic Q0) and the selection rule going forward; existing learned
// values stay, so a student can A/B exploration strategies mid-run without losing progress.
class SetQLAlgorithmInteractor extends SetQLAlgorithmInputBoundary {
    constructor(qLearningState, outputBoundary) {
        super();
        this.qLearningState = qLearningState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        const validAlgorithms = ['epsilonGreedy', 'ucb', 'optimistic'];
        if (!inputData || !validAlgorithms.includes(inputData.algorithm)) {
            this.outputBoundary.presentError(`Unknown algorithm: ${inputData && inputData.algorithm}`);
            return;
        }

        this.qLearningState.algorithm = inputData.algorithm;

        const p = inputData.param;
        if (p !== undefined && p !== null && isFinite(p)) {
            if (inputData.algorithm === 'epsilonGreedy') {
                this.qLearningState.epsilon = Math.max(0, Math.min(1, p));
            } else if (inputData.algorithm === 'ucb') {
                this.qLearningState.ucbC = Math.max(0, p);
            } else if (inputData.algorithm === 'optimistic') {
                this.qLearningState.optimisticQ0 = p;
            }
        }

        this.outputBoundary.presentComplete({ algorithm: inputData.algorithm });
    }
}
