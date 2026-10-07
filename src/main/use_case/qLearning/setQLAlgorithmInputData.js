// Input data for switching the Q-learning algorithm. `param` is the algorithm's single
// hyperparameter (epsilon / ucbC / softmaxTau / optimisticQ0); undefined leaves the current value.
// `maxDepth` (the "Max steps" episode cap) may be passed on its own with algorithm === null to
// change only the horizon - see SetQLAlgorithmInputData.forMaxDepth().
class SetQLAlgorithmInputData {
    constructor(algorithm, param, maxDepth) {
        this.algorithm = algorithm;
        this.param = param;
        this.maxDepth = maxDepth;
    }

    static forMaxDepth(maxDepth) {
        return new SetQLAlgorithmInputData(null, undefined, maxDepth);
    }
}
