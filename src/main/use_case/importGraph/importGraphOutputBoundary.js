/**
 * Output boundary interface for ImportGraph use case
 * Defines the contract for presenting import graph results
 */
class ImportGraphOutputBoundary {
    /**
     * Present the import graph results
     * @param {Object} responseModel - The response model containing results
     * @param {boolean} responseModel.success - Whether the operation succeeded
     * @param {string|null} responseModel.error - Error message if failed
     * @param {Graph|null} responseModel.graph - The imported graph
     * @param {number} responseModel.nodeCount - Number of nodes imported
     * @param {number} responseModel.edgeCount - Number of edges imported
     * @param {number} responseModel.textLabelCount - Number of text labels imported
     * @returns {void}
     */
    present(responseModel) {
        throw new Error("present() must be implemented by subclass");
    }
}
