/**
 * Output boundary interface for Zoom use cases
 * Defines the contract for presenting zoom results
 */
class ZoomOutputBoundary {
    /**
     * Present the zoom results
     * @param {Object} responseModel - The response model containing results
     * @param {boolean} responseModel.success - Whether the operation succeeded
     * @param {string|null} responseModel.error - Error message if failed
     * @param {number|null} responseModel.zoom - The new zoom level
     * @param {number|null} responseModel.panX - The new pan X offset
     * @param {number|null} responseModel.panY - The new pan Y offset
     * @returns {void}
     */
    present(responseModel) {
        throw new Error("present() must be implemented by subclass");
    }
}
