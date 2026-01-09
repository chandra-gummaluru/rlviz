/**
 * Output boundary interface for Redo use case
 * Defines the contract for presenting redo results
 */
class RedoOutputBoundary {
    /**
     * Present the redo results
     * @param {Object} responseModel - The response model containing results
     * @param {boolean} responseModel.success - Whether the operation succeeded
     * @param {string|null} responseModel.error - Error message if failed
     * @param {boolean} responseModel.canUndo - Whether undo operations are available
     * @param {boolean} responseModel.canRedo - Whether more redo operations are available
     * @returns {void}
     */
    present(responseModel) {
        throw new Error("present() must be implemented by subclass");
    }
}
