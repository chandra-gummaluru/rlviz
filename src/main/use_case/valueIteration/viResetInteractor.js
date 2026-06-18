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
