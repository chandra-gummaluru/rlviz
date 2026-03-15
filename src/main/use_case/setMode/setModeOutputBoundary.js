/**
 * Output boundary interface for SetMode use case
 * Defines the contract for presenting set mode results
 */
class SetModeOutputBoundary {
    /**
     * Present the set mode results
     * @param {Object} responseModel - The response model containing results
     * @param {boolean} responseModel.success - Whether the operation succeeded
     * @param {string|null} responseModel.error - Error message if failed
     * @param {string|null} responseModel.mode - The mode that was set
     * @returns {void}
     */
    present(responseModel) {
        throw new Error("present() must be implemented by subclass");
    }
}
