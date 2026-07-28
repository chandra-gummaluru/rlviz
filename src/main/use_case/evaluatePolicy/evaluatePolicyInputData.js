// Input data for Evaluate Policy use case. epsilon's default (0.01) matches RunVIInputData's own
// default exactly - there is no epsilon slider in this app yet (a later phase adds one to VI;
// this reuses the same fixed default rather than anticipating that slider). name is optional -
// the user-chosen name from namePolicyModal.js; when omitted the logged entry keeps the original
// auto \pi_k label (see EvaluatePolicyInteractor._buildLabel()).
class EvaluatePolicyInputData {
    constructor(gamma, epsilon = 0.01, name) {
        this.gamma = gamma;
        this.epsilon = epsilon;
        this.name = name;
    }
}
