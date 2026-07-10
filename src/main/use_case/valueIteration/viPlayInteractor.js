// Interactor for VI Play — continuous sweep playback (auto-stops at convergence or the T cap)
class VIPlayInteractor extends VIPlayInputBoundary {
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

        if (!this.viState.canAdvance() || this.viState.converged) {
            this.outputBoundary.presentComplete();
            return;
        }

        this.viState.play();
        this.animator.continuousPlay();
    }
}
