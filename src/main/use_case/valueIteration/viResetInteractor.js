// Interactor for VI Reset — clears all state and returns to initial
class VIResetInteractor extends VIResetInputBoundary {
    constructor(viState, viViewModel, outputBoundary) {
        super();
        this.viState = viState;
        this.viViewModel = viViewModel;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        this.viState.pause();
        this.viState.reset();
        this.viViewModel.reset();
        this.outputBoundary.presentReset();
    }
}
