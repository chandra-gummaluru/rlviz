class VIStepInteractor extends VIStepInputBoundary {
    constructor(viState, outputBoundary, viViewModel) {
        super();
        this.viState = viState;
        this.outputBoundary = outputBoundary;
        this.animator = new VIAnimator(viState, outputBoundary, viViewModel);
    }

    execute(inputData) {
        if (!this.viState.initialized) {
            this.outputBoundary.presentError('Value iteration not initialized.');
            return;
        }

        if (!this.viState.canAdvance()) {
            this.outputBoundary.presentComplete();
            return;
        }

        if (this.viState.isPlaying) {
            this.viState.pause();
        }

        this.viState.phase = 'stepping';
        this.animator.animateOneSubPhase();
    }
}
