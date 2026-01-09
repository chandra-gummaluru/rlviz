
/**
 * Presenter for Undo use case
 * Formats and presents undo results to the ViewModel
 */
class UndoPresenter extends UndoOutputBoundary {
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
     * Present the undo results by updating the ViewModel
     * @param {Object} responseModel - The response model from the interactor
     * @returns {void}
     */
    present(responseModel) {
        if (responseModel.success) {
            // Clear any active selections after undo
            this.viewModel.clearSelection();
            
            // Update undo/redo button states
            this.viewModel.updateUndoRedoState(
                responseModel.canUndo,
                responseModel.canRedo
            );
        } else {
            // Handle error case
            console.warn('Undo failed:', responseModel.error);
        }
    }
}
