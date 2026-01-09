/**
 * Input data for ImportGraph use case
 * Plain data object containing request parameters
 */
class ImportGraphInputData {
    /**
     * Create import graph input data
     * @param {string} jsonData - The JSON string containing the graph data
     */
    constructor(jsonData) {
        this.jsonData = jsonData;
    }
}
