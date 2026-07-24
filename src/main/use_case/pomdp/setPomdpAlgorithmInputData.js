// Input data for switching the POMDP algorithm. `param` is the algorithm's single hyperparameter
// (epsilon / ucbC / softmaxTau / optimisticQ0); undefined leaves the current value unchanged.
class SetPomdpAlgorithmInputData {
    constructor(algorithm, param) {
        this.algorithm = algorithm;
        this.param = param;
    }
}
