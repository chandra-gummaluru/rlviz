
/**
 * Presenter for Zoom use cases
 * Formats and presents zoom results to the ViewModel
 */
class ZoomPresenter extends ZoomOutputBoundary {
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
     * Present the zoom results by updating the ViewModel
     * @param {Object} responseModel - The response model from the interactor
     * @returns {void}
     */
    present(responseModel) {
        if (responseModel.success) {
            // Update zoom and pan state in the view model
            this.viewModel.zoom = responseModel.zoom;
            this.viewModel.panX = responseModel.panX;
            this.viewModel.panY = responseModel.panY;
        } else {
            // Handle error case
            console.error('Zoom operation failed:', responseModel.error);
        }
    }
}
