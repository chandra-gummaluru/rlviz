
/**
 * Presenter for SetValuesSubView use case
 * Formats and presents set values sub-view results to the ViewModel
 */
class SetValuesSubViewPresenter extends SetValuesSubViewOutputBoundary {
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
     * Present the set values sub-view results by updating the ViewModel
     * @param {Object} responseModel - The response model from the interactor
     * @returns {void}
     */
    present(responseModel) {
        if (responseModel.success) {
            this.viewModel.valuesSubView = responseModel.subView;

            if (this.rightPanel) {
                this.rightPanel.updateContent();
            }
        } else {
            console.error('Set values sub-view failed:', responseModel.error);
        }
    }
}
