
/**
 * Interactor for ZoomOut use case
 * Contains the business logic for zooming out (decreasing zoom level)
 */
class ZoomOutInteractor extends ZoomInputBoundary {
    /**
     * @param {ZoomOutputBoundary} outputBoundary - The output boundary for presenting results
     */
    constructor(outputBoundary) {
        super();
        if (!outputBoundary) {
            throw new Error("OutputBoundary is required");
        }
        this.outputBoundary = outputBoundary;
        this.minZoom = 0.1;
        this.maxZoom = 5.0;
        this.zoomFactor = 1.2; // 20% decrease (divide by 1.2)
    }

    /**
     * Execute the zoom out operation
     * @param {ZoomInputData} inputData - The input data containing zoom parameters
     * @returns {void}
     */
    execute(inputData) {
        // Validate input data
        if (!inputData) {
            const responseModel = {
                success: false,
                error: "Input data is required",
                zoom: null,
                panX: null,
                panY: null
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        // Validate numeric values
        if (typeof inputData.currentZoom !== 'number' || 
            typeof inputData.centerX !== 'number' || 
            typeof inputData.centerY !== 'number') {
            const responseModel = {
                success: false,
                error: "Invalid zoom parameters",
                zoom: null,
                panX: null,
                panY: null
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        // Calculate new zoom level
        let newZoom = inputData.currentZoom / this.zoomFactor;
        
        // Clamp to minimum
        if (newZoom < this.minZoom) {
            newZoom = this.minZoom;
        }

        // Calculate new pan offsets to zoom away from center point
        const zoomChange = newZoom / inputData.currentZoom;
        const newPanX = inputData.centerX - (inputData.centerX - inputData.currentPanX) * zoomChange;
        const newPanY = inputData.centerY - (inputData.centerY - inputData.currentPanY) * zoomChange;

        // Prepare success response
        const responseModel = {
            success: true,
            error: null,
            zoom: newZoom,
            panX: newPanX,
            panY: newPanY
        };

        // Present the results
        this.outputBoundary.present(responseModel);
    }
}
