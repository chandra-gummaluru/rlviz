// Input data for Run Value Iteration use case. runMode: 'optimal' (Bellman optimality, max_a -
// true Value Iteration, only ever forced by the Find Optimal π flow) or 'expectation' (the
// default - Bellman expectation against whatever Policy π is currently configured).
class RunVIInputData {
    constructor(T, gamma, epsilon = 0.01, runMode = 'expectation') {
        this.T = T;
        this.gamma = gamma;
        this.epsilon = epsilon;
        this.runMode = runMode;
    }
}
