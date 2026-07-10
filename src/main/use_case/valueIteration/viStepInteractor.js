// Interactor for VI Step — advances exactly one sweep. Not blocked by convergence (only the T cap).
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
        this.animator.stepOneSweep();
    }
}
