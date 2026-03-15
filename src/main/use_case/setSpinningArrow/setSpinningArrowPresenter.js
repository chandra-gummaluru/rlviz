// Presenter for setting spinning arrow animation
class SetSpinningArrowPresenter extends SetSpinningArrowOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentSuccess(enabled, duration) {
        // Update ViewModel (if needed for display purposes)
        // Note: The actual state is in SimulationState, not ViewModel
        console.log(`Spinning arrow animation ${enabled ? 'enabled' : 'disabled'} with duration ${duration}ms`);

        // Optionally set an info message
        if (this.viewModel.infoMessage !== undefined) {
            this.viewModel.infoMessage = `Spinning arrow ${enabled ? 'enabled' : 'disabled'}`;
        }

        // Trigger redraw to update UI
        if (typeof redraw === 'function') {
            redraw();
        }
    }

    presentError(message) {
        console.error('Error setting spinning arrow:', message);

        // Set error message in ViewModel if available
        if (this.viewModel.errorMessage !== undefined) {
            this.viewModel.errorMessage = message;
        }

        // Trigger redraw to show error
        if (typeof redraw === 'function') {
            redraw();
        }
    }
}
