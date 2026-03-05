// Interactor for Pause simulation action
class PauseInteractor extends PauseInputBoundary {
    constructor(simulationState, outputBoundary) {
        super();
        this.simulationState = simulationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        // Check if simulation is initialized
        if (!this.simulationState.replayInitialized) {
            this.outputBoundary.presentError('Simulation not started yet');
            return;
        }

        // Pause the simulation
        if (this.simulationState.isPlaying) {
            this.simulationState.pause();
            console.log('Simulation paused');
            this.outputBoundary.presentPaused();
        } else {
            console.log('Simulation already paused');
        }
    }
}
