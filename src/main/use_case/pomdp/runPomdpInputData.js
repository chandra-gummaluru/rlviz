// Input data for Run POMDP. episodeCount is supplied by the controller (10 for "Run",
// 1 for "Step") — Step reuses this same interactor rather than a second class.
class RunPomdpInputData {
    constructor(startStateId, gamma, episodeCount) {
        this.startStateId = startStateId;
        this.gamma = gamma;
        this.episodeCount = episodeCount;
    }
}
