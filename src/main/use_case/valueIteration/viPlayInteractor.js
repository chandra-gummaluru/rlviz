// Interactor for VI Play — starts or resumes continuous playback
class VIPlayInteractor extends VIPlayInputBoundary {
    constructor(viState, viViewModel, outputBoundary) {
        super();
        this.viState = viState;
        this.viViewModel = viViewModel;
        this.outputBoundary = outputBoundary;
        this.animator = new VIAnimator(viState, viViewModel, outputBoundary);
    }

    execute(inputData) {
        if (!this.viState.initialized) {
            this.outputBoundary.presentError('Value iteration not initialized. Click Play after setting T.');
            return;
        }

        if (!this.viState.canAdvance()) {
            this.outputBoundary.presentComplete();
            return;
        }

        this.viState.play();
        this.animator.continuousPlay();
    }
}
