/**
 * Input boundary interface for Redo use case
 * Defines the contract for executing redo operations
 */
class RedoInputBoundary {
    /**
     * Execute the redo operation
     * @param {RedoInputData} inputData - The input data for redo
     * @returns {void}
     */
    execute(inputData) {
        throw new Error("execute() must be implemented by subclass");
    }
}
