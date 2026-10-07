
/**
 * Presenter for ImportGraph use case
 * Formats and presents import graph results to the ViewModel
 */
class ImportGraphPresenter extends ImportGraphOutputBoundary {
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
     * Present the import graph results by updating the ViewModel
     * @param {Object} responseModel - The response model from the interactor
     * @returns {void}
     */
    present(responseModel) {
        if (responseModel.success) {
            // Clear any active selections
            this.viewModel.clearSelection();
            this.viewModel.interaction.clearEditorFocus();

            // Restore start node from the saved startStateId, if any
            if (responseModel.startStateId !== null && responseModel.startStateId !== undefined) {
                const startNode = this.viewModel.graph.getNodeById(responseModel.startStateId);
                if (startNode) this.viewModel.startNode = startNode;
            }
            
            // The graph has already been updated by the interactor
            // Could trigger a UI notification here if needed
            // this.viewModel.setNotification("Graph imported successfully");
        } else {
            // Handle error case
            console.error('Import graph failed:', responseModel.error);
            this.viewModel.lastOperationError = 'Failed to import graph: ' + responseModel.error;
        }
    }
}
