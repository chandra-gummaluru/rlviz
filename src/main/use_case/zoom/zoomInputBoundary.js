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
