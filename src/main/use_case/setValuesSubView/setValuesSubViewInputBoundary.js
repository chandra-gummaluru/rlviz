/**
 * Input boundary interface for SetValuesSubView use case
 * Defines the contract for executing Values-mode sub-view switch operations
 */
class SetValuesSubViewInputBoundary {
    /**
     * Execute the set values sub-view operation
     * @param {SetValuesSubViewInputData} inputData - The input data for setting the sub-view
     * @returns {void}
     */
    execute(inputData) {
        throw new Error("execute() must be implemented by subclass");
    }
}
