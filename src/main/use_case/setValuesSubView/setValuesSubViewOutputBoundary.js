/**
 * Output boundary interface for SetValuesSubView use case
 * Defines the contract for presenting set values sub-view results
 */
class SetValuesSubViewOutputBoundary {
    /**
     * Present the set values sub-view results
     * @param {Object} responseModel - The response model containing results
     * @param {boolean} responseModel.success - Whether the operation succeeded
     * @param {string|null} responseModel.error - Error message if failed
     * @param {string|null} responseModel.subView - The sub-view that was set
     * @returns {void}
     */
    present(responseModel) {
        throw new Error("present() must be implemented by subclass");
    }
}
