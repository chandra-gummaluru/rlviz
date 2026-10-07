// DEPRECATED — partial observability is IN DEVELOPMENT. This file is kept but is no longer
// reachable from the UI (inDevelopmentCard.js is shown instead; main.js's VI handlers no-op while
// observability === 'partial'). See CLAUDE.md "Partial observability (in development)".
// Interactor for POMDP Reset — clears all learned Q/N/belief data back to initial state.
class PomdpResetInteractor extends PomdpResetInputBoundary {
    constructor(pomdpState, outputBoundary) {
        super();
        this.pomdpState = pomdpState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        this.pomdpState.reset();
        this.outputBoundary.presentComplete({ episodeCount: 0, ranEpisodes: 0, reset: true });
    }
}
