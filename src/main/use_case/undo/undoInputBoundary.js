/**
 * Input boundary interface for Undo use case
 * Defines the contract for executing undo operations
 */
class UndoInputBoundary {
    /**
     * Execute the undo operation
     * @param {UndoInputData} inputData - The input data for undo
     * @returns {void}
     */
    execute(inputData) {
        throw new Error("execute() must be implemented by subclass");
    }
}
