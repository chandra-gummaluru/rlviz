// Interactor for VI Step — in the known:full quadrant (real Value Iteration, the only one with a
// per-state reveal), reveals exactly ONE state's animation within the current live sweep and
// never crosses into a new sweep (see ViStatesView.revealNextState()) - Reset/"Find Optimal" own
// crossing sweep boundaries. In the other 3 quadrants (no per-state reveal to step through),
// falls through to the old sweep-level advance (not blocked by convergence, only the T cap).
class VIStepInteractor extends VIStepInputBoundary {
    constructor(viState, outputBoundary, graph, options = {}) {
        super();
        this.viState = viState;
        this.outputBoundary = outputBoundary;
        this.animator = new VIAnimator(viState, outputBoundary, graph, options);
    }

    execute(inputData) {
        if (!this.viState.initialized) {
            this.outputBoundary.presentError('Value iteration not initialized.');
            return;
        }
        if (this.viState.isPlaying) {
            this.viState.pause();
        }
        if (this.animator.revealNextState()) return;
        this.animator.stepOneSweep();
    }
}
