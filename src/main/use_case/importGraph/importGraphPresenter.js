
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
            
            // The graph has already been updated by the interactor
            // Just notify success
            console.log('Graph imported successfully:',
                responseModel.nodeCount, 'nodes,',
                responseModel.edgeCount, 'edges,',
                responseModel.textLabelCount, 'text labels');
                
            // Could trigger a UI notification here if needed
            // this.viewModel.setNotification("Graph imported successfully");
        } else {
            // Handle error case
            console.error('Import graph failed:', responseModel.error);
            alert('Failed to import graph: ' + responseModel.error);
        }
    }
}
