// Interactor for VI Pause — freezes animation mid-sequence
class VIPauseInteractor extends VIPauseInputBoundary {
    constructor(viState, outputBoundary) {
        super();
        this.viState = viState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        this.viState.pause();
        this.outputBoundary.presentPaused();
    }
}
