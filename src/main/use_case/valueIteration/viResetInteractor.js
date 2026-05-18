// Interactor for VI Reset — clears all state and returns to initial
class VIResetInteractor extends VIResetInputBoundary {
    constructor(viState, outputBoundary) {
        super();
        this.viState = viState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        this.viState.pause();
        this.viState.reset();
        this.outputBoundary.presentReset();
    }
}
