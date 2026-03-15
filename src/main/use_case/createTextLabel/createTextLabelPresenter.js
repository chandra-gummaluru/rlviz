// Presenter for CreateTextLabel use case
class CreateTextLabelPresenter extends CreateTextLabelOutputBoundary {
    constructor(interactionViewModel) {
        super();
        this.interactionViewModel = interactionViewModel;
    }

    presentTextRequested() {
        // Signal to View that text input is needed
        this.interactionViewModel.textLabelRequested = true;
    }

    presentTextLabelCreated(label) {
        // Set the held text label for placement
        this.interactionViewModel.heldTextLabel = label;
        this.interactionViewModel.placingMode = 'textbox';
        this.interactionViewModel.textLabelRequested = false;
    }

    presentError(message) {
        this.interactionViewModel.textLabelRequested = false;
        console.error('Create text label error:', message);
    }
}
