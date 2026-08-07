// Input data for switching the Q-learning algorithm. `param` is the algorithm's single
// hyperparameter (epsilon / ucbC / optimisticQ0); undefined leaves the current value.
class SetQLAlgorithmInputData {
    constructor(algorithm, param) {
        this.algorithm = algorithm;
        this.param = param;
    }
}
