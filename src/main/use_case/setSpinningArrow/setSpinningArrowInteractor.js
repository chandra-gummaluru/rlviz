// Interactor for setting spinning arrow animation settings
class SetSpinningArrowInteractor extends SetSpinningArrowInputBoundary {
    constructor(simulationState, outputBoundary) {
        super();
        this.simulationState = simulationState;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        // Validate input data
        if (inputData.enabled === undefined || inputData.enabled === null) {
            this.outputBoundary.presentError('Enabled flag must be provided');
            return;
        }

        if (typeof inputData.enabled !== 'boolean') {
            this.outputBoundary.presentError('Enabled flag must be a boolean');
            return;
        }

        // Set enabled state
        this.simulationState.setSpinningArrowEnabled(inputData.enabled);

        // Set duration if provided
        if (inputData.duration !== undefined && inputData.duration !== null) {
            if (typeof inputData.duration !== 'number') {
                this.outputBoundary.presentError('Duration must be a number');
                return;
            }

            if (inputData.duration < 800 || inputData.duration > 3000) {
                this.outputBoundary.presentError('Duration must be between 800ms and 3000ms');
                return;
            }

            this.simulationState.setSpinningArrowDuration(inputData.duration);
        }

        // Present success
        this.outputBoundary.presentSuccess(inputData.enabled, this.simulationState.spinningArrowDuration);
    }
}
