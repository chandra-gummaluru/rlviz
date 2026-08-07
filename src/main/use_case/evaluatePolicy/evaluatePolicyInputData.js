// Input data for Evaluate Policy use case. name is optional - the user-chosen name from
// namePolicyModal.js; when omitted the logged entry keeps the original auto \pi_k label (see
// EvaluatePolicyInteractor._buildLabel()).
class EvaluatePolicyInputData {
    constructor(gamma, name) {
        this.gamma = gamma;
        this.name = name;
    }
}
