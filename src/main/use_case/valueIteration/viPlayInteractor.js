// Interactor for VI Play — continuous sweep playback (auto-stops at convergence or the T cap)
class VIPlayInteractor extends VIPlayInputBoundary {
    constructor(viState, outputBoundary, graph, simulationState, options = {}) {
        super();
        this.viState = viState;
        this.outputBoundary = outputBoundary;
        this.animator = new VIAnimator(viState, outputBoundary, graph, simulationState, options);
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
        // If a loop is still alive (including suspended mid-pause, inside animateOneSweep()'s
        // awaitReveal()), this Play click is really "resume a paused reveal" - flipping isPlaying
        // back on above is enough to let that SAME suspended call continue once the (now resumed,
        // see main.js's onVIPlay) reveal finishes. Starting a second continuousPlay() here would
        // independently compute another sweep out from under the one still paused mid-reveal.
        if (!this.animator.isLoopRunning()) {
            this.animator.continuousPlay();
        }
    }
}
