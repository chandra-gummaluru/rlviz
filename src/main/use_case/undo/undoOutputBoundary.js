/**
 * Output boundary interface for Undo use case
 * Defines the contract for presenting undo results
 */
class UndoOutputBoundary {
    /**
     * Present the undo results
     * @param {Object} responseModel - The response model containing results
     * @param {boolean} responseModel.success - Whether the operation succeeded
     * @param {string|null} responseModel.error - Error message if failed
     * @param {boolean} responseModel.canUndo - Whether more undo operations are available
     * @param {boolean} responseModel.canRedo - Whether redo operations are available
     * @returns {void}
     */
    present(responseModel) {
        throw new Error("present() must be implemented by subclass");
    }
}
