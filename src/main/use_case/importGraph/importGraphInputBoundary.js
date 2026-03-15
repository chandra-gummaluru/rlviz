/**
 * Input boundary interface for ImportGraph use case
 * Defines the contract for executing graph import operations
 */
class ImportGraphInputBoundary {
    /**
     * Execute the import graph operation
     * @param {ImportGraphInputData} inputData - The input data for import
     * @returns {void}
     */
    execute(inputData) {
        throw new Error("execute() must be implemented by subclass");
    }
}
