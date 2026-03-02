
/**
 * Presenter for Redo use case
 * Formats and presents redo results to the ViewModel
 */
class RedoPresenter extends RedoOutputBoundary {
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
     * Present the redo results by updating the ViewModel
     * @param {Object} responseModel - The response model from the interactor
     * @returns {void}
     */
    present(responseModel) {
        if (responseModel.success) {
            // Clear any active selections after redo
            this.viewModel.clearSelection();

            // Update undo/redo button states
            this.viewModel.updateUndoRedoState(
                responseModel.canUndo,
                responseModel.canRedo
            );

            // Trigger visual update
            redraw();
        } else {
            // Handle error case
            console.warn('Redo failed:', responseModel.error);
        }
    }
}
