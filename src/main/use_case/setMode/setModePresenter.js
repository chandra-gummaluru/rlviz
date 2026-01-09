
/**
 * Presenter for SetMode use case
 * Formats and presents set mode results to the ViewModel
 */
class SetModePresenter extends SetModeOutputBoundary {
    /**
     * @param {CanvasViewModel} viewModel - The view model to update
     */
    constructor(viewModel) {
        super();
        if (!viewModel) {
            throw new Error("ViewModel is required");
        }
        this.viewModel = viewModel;
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
        } else {
            // Handle error case
            console.error('Set mode failed:', responseModel.error);
        }
    }
}
