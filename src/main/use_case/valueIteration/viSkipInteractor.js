// Interactor for VI Skip — in the known:full quadrant, snaps whichever state is currently
// animating (or paused) to its resolved look and immediately starts playing the NEXT state's
// animation, never crossing into a new sweep (see ViStatesView.skipCurrentState()). In the other
// 3 quadrants, falls through to the old "instant Step" behavior: advances exactly one sweep with
// zero-duration tween, preserving Skip's historical 1:1 relationship to Step (Step with zero
// timing).
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
        if (this.animator.skipCurrentState()) return;
        this.animator.stepOneSweep(0);
    }
}
