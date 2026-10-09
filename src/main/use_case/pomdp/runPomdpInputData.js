// DEPRECATED — partial observability is IN DEVELOPMENT. This file is kept but is no longer
// reachable from the UI (inDevelopmentCard.js is shown instead; main.js's VI handlers no-op while
// observability === 'partial'). See CLAUDE.md "Partial observability (in development)".
// Input data for Run POMDP. episodeCount is supplied by the controller (10 for "Run",
// 1 for "Step") — Step reuses this same interactor rather than a second class.
class RunPomdpInputData {
    constructor(startStateId, gamma, episodeCount) {
        this.startStateId = startStateId;
        this.gamma = gamma;
        this.episodeCount = episodeCount;
    }
}
