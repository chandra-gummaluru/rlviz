// Interactor for Reset simulation action
class ResetInteractor extends ResetInputBoundary {
    constructor(simulationState, outputBoundary) {
        super();
        this.simulationState = simulationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        // Reset simulation to initial state
        this.simulationState.reset();
        this.outputBoundary.presentPhaseChange('reset', 0);
        console.log('Simulation reset');
    }
}
