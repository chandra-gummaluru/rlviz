/**
 * Input data for Zoom use cases
 * Plain data object containing request parameters
 */
class ZoomInputData {
    /**
     * Create zoom input data
     * @param {number} centerX - The X coordinate of the zoom center
     * @param {number} centerY - The Y coordinate of the zoom center
     * @param {number} currentZoom - The current zoom level
     * @param {number} currentPanX - The current pan X offset
     * @param {number} currentPanY - The current pan Y offset
     */
    constructor(centerX, centerY, currentZoom, currentPanX, currentPanY) {
        this.centerX = centerX;
        this.centerY = centerY;
        this.currentZoom = currentZoom;
        this.currentPanX = currentPanX;
        this.currentPanY = currentPanY;
    }
}
