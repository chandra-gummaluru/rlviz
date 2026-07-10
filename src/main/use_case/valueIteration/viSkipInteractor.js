// Interactor for VI Skip — "instant Step": advances exactly one sweep with zero-duration tween,
// preserving Skip's historical 1:1 relationship to Step (Step with zero timing).
class VISkipInteractor extends VISkipInputBoundary {
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
        this.animator.stepOneSweep(0);
    }
}
