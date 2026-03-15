// Viewport state management (zoom and pan)
class ViewportViewModel {
    constructor() {
        this.zoom = 1.0;
        this.minZoom = 0.1;
        this.maxZoom = 5.0;
        this.panX = 0;
        this.panY = 0;

        // Panning state
        this.isPanning = false;
        this.panStartX = 0;
        this.panStartY = 0;
        this.panStartOffsetX = 0;
        this.panStartOffsetY = 0;
    }

    setZoom(newZoom, centerX, centerY) {
        const oldZoom = this.zoom;
        this.zoom = Math.max(this.minZoom, Math.min(newZoom, this.maxZoom));

        if (centerX !== undefined && centerY !== undefined) {
            this.panX -= (centerX - this.panX) * (this.zoom / oldZoom - 1);
            this.panY -= (centerY - this.panY) * (this.zoom / oldZoom - 1);
        }

        return this.zoom;
    }

    setPan(x, y) {
        this.panX = x;
        this.panY = y;
    }

    reset() {
        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
    }

    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.panX) / this.zoom,
            y: (screenY - this.panY) / this.zoom
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.zoom + this.panX,
            y: worldY * this.zoom + this.panY
        };
    }
}
