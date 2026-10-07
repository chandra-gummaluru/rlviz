// DEPRECATED — partial observability is IN DEVELOPMENT. This file is kept but is no longer
// reachable from the UI (inDevelopmentCard.js is shown instead; main.js's VI handlers no-op while
// observability === 'partial'). See CLAUDE.md "Partial observability (in development)".
// Input data for switching the POMDP algorithm. `param` is the algorithm's single hyperparameter
// (epsilon / ucbC / softmaxTau / optimisticQ0); undefined leaves the current value unchanged.
class SetPomdpAlgorithmInputData {
    constructor(algorithm, param) {
        this.algorithm = algorithm;
        this.param = param;
    }
}
