// Interactor for VI Step — advances one state backup
class VIStepInteractor extends VIStepInputBoundary {
    constructor(viState, viViewModel, outputBoundary) {
        super();
        this.viState = viState;
        this.viViewModel = viViewModel;
        this.outputBoundary = outputBoundary;
        this.animator = new VIAnimator(viState, viViewModel, outputBoundary);
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

        // Pause continuous playback if running
        if (this.viState.isPlaying) {
            this.viState.pause();
        }

        // Use stepping flag so animator knows to complete one step
        this.viState.phase = 'stepping';
        this.animator.animateOneState();
    }
}
