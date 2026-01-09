/**
 * Domain entity representing viewport state (zoom and pan).
 * Pure business logic with no UI dependencies.
 */
export class ViewportState {
    /**
     * Create viewport state.
     * @param {number} zoom - Current zoom level (1.0 = 100%)
     * @param {number} panX - Pan offset X
     * @param {number} panY - Pan offset Y
     * @param {number} minZoom - Minimum allowed zoom (default: 0.1)
     * @param {number} maxZoom - Maximum allowed zoom (default: 5.0)
     */
    constructor(zoom = 1.0, panX = 0, panY = 0, minZoom = 0.1, maxZoom = 5.0) {
        this.zoom = this.clampZoom(zoom, minZoom, maxZoom);
        this.panX = panX;
        this.panY = panY;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
    }

    /**
     * Clamp zoom value to valid range.
     * @param {number} zoom - Zoom value to clamp
     * @param {number} min - Minimum zoom
     * @param {number} max - Maximum zoom
     * @returns {number} Clamped zoom value
     */
    clampZoom(zoom, min, max) {
        return Math.max(min, Math.min(max, zoom));
    }

    /**
     * Calculate new zoom level with 20% increase.
     * @returns {number} New zoom level
     */
    calculateZoomIn() {
        const newZoom = this.zoom * 1.2;
        return this.clampZoom(newZoom, this.minZoom, this.maxZoom);
    }

    /**
     * Calculate new zoom level with 20% decrease.
     * @returns {number} New zoom level
     */
    calculateZoomOut() {
        const newZoom = this.zoom / 1.2;
        return this.clampZoom(newZoom, this.minZoom, this.maxZoom);
    }

    /**
     * Calculate new pan offsets to zoom towards a specific point.
     * @param {number} newZoom - Target zoom level
     * @param {number} centerX - X coordinate of zoom center (screen space)
     * @param {number} centerY - Y coordinate of zoom center (screen space)
     * @returns {{panX: number, panY: number}} New pan offsets
     */
    calculatePanForZoom(newZoom, centerX, centerY) {
        if (newZoom === this.zoom) {
            return { panX: this.panX, panY: this.panY };
        }

        // Calculate the world position of the center point before zoom
        const worldX = (centerX - this.panX) / this.zoom;
        const worldY = (centerY - this.panY) / this.zoom;

        // Calculate new pan to keep the world position under the center point
        const newPanX = centerX - worldX * newZoom;
        const newPanY = centerY - worldY * newZoom;

        return { panX: newPanX, panY: newPanY };
    }

    /**
     * Create a new ViewportState with updated zoom.
     * @param {number} newZoom - New zoom level
     * @param {number} centerX - Zoom center X
     * @param {number} centerY - Zoom center Y
     * @returns {ViewportState} New viewport state
     */
    withZoom(newZoom, centerX, centerY) {
        const clampedZoom = this.clampZoom(newZoom, this.minZoom, this.maxZoom);
        const newPan = this.calculatePanForZoom(clampedZoom, centerX, centerY);
        return new ViewportState(
            clampedZoom,
            newPan.panX,
            newPan.panY,
            this.minZoom,
            this.maxZoom
        );
    }

    /**
     * Check if zoom in is possible.
     * @returns {boolean} True if can zoom in
     */
    canZoomIn() {
        return this.zoom < this.maxZoom;
    }

    /**
     * Check if zoom out is possible.
     * @returns {boolean} True if can zoom out
     */
    canZoomOut() {
        return this.zoom > this.minZoom;
    }

    /**
     * Get zoom as percentage string.
     * @returns {string} Zoom percentage (e.g., "150%")
     */
    getZoomPercentage() {
        return Math.round(this.zoom * 100) + "%";
    }
}
