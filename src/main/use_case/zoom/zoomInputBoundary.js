/**
 * Input boundary interface for Zoom use cases
 * Defines the contract for executing zoom operations
 */
class ZoomInputBoundary {
    /**
     * Execute the zoom operation
     * @param {ZoomInputData} inputData - The input data for zoom
     * @returns {void}
     */
    execute(inputData) {
        throw new Error("execute() must be implemented by subclass");
    }
}
