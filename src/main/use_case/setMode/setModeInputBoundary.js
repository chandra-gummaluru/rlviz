/**
 * Input boundary interface for SetMode use case
 * Defines the contract for executing mode switch operations
 */
class SetModeInputBoundary {
    /**
     * Execute the set mode operation
     * @param {SetModeInputData} inputData - The input data for setting mode
     * @returns {void}
     */
    execute(inputData) {
        throw new Error("execute() must be implemented by subclass");
    }
}
