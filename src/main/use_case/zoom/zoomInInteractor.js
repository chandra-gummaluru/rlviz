
/**
 * Interactor for ZoomIn use case
 * Contains the business logic for zooming in (increasing zoom level)
 */
class ZoomInInteractor extends ZoomInputBoundary {
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
        this.zoomFactor = 1.2; // 20% increase
    }

    /**
     * Execute the zoom in operation
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
        let newZoom = inputData.currentZoom * this.zoomFactor;
        
        // Clamp to maximum
        if (newZoom > this.maxZoom) {
            newZoom = this.maxZoom;
        }

        // Calculate new pan offsets to zoom towards center point
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
