
/**
 * Presenter for SetMode use case
 * Formats and presents set mode results to the ViewModel
 */
class SetModePresenter extends SetModeOutputBoundary {
    /**
     * @param {CanvasViewModel} viewModel - The view model to update
     * @param {RightPanel} rightPanel - The right panel to update (optional, set after construction)
     */
    constructor(viewModel, rightPanel = null) {
        super();
        if (!viewModel) {
            throw new Error("ViewModel is required");
        }
        this.viewModel = viewModel;
        this.rightPanel = rightPanel;
    }

    /**
     * Set the right panel reference (called after rightPanel is created in setup())
     */
    setRightPanel(rightPanel) {
        this.rightPanel = rightPanel;
    }

    /**
     * Present the set mode results by updating the ViewModel
     * @param {Object} responseModel - The response model from the interactor
     * @returns {void}
     */
    present(responseModel) {
        if (responseModel.success) {
            // Update the mode in the view model
            this.viewModel.mode = responseModel.mode;

            // Update the right panel to show appropriate content
            if (this.rightPanel) {
                this.rightPanel.updateContent();
            }
        } else {
            // Handle error case
            console.error('Set mode failed:', responseModel.error);
        }
    }
}
