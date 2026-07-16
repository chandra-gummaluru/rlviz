// Input data for Evaluate Policy use case. epsilon's default (0.01) matches RunVIInputData's own
// default exactly - there is no epsilon slider in this app yet (a later phase adds one to VI;
// this reuses the same fixed default rather than anticipating that slider).
class EvaluatePolicyInputData {
    constructor(gamma, epsilon = 0.01) {
        this.gamma = gamma;
        this.epsilon = epsilon;
    }
}
