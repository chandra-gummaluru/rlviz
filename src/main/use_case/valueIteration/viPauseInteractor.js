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
