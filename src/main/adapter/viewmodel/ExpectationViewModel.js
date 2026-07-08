class ExpectationViewModel {
    constructor() {
        this.panelLayout = null;
        this.layoutStale = true;
        this.isPlaying = false;
        this.focusedRunIndex = null;
        this.lastResponse = null;
        this.lastError = null;
        // Index (within the displayed slice) of the currently hovered mini-panel / chart-dock
        // element; drives live-linking highlights across the grid and (in a later phase) charts.
        this.hoveredRun = null;
    }

    computeLayout(canvasW, canvasH, displayRuns, graph) {
        const GRID = { 4: [2,2], 8: [4,2], 16: [4,4], 32: [8,4], 64: [8,8] };
        const [cols, rows] = GRID[displayRuns] || [4, 4];
        const panelW = Math.floor(canvasW / cols);
        const panelH = Math.floor(canvasH / rows);

        const panels = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                panels.push({ x: c * panelW, y: r * panelH, w: panelW, h: panelH });
            }
        }

        const fitTransform = this._computeFitTransform(graph, panelW, panelH);
        this.panelLayout = { cols, rows, panels, fitTransform };
        this.layoutStale = false;
    }

    _computeFitTransform(graph, panelW, panelH) {
        const PADDING = 12;
        const LABEL_H = 18;

        if (!graph || !graph.nodes || graph.nodes.length === 0) {
            return null;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const node of graph.nodes) {
            const r = node.size || 20;
            minX = Math.min(minX, node.x - r);
            minY = Math.min(minY, node.y - r);
            maxX = Math.max(maxX, node.x + r);
            maxY = Math.max(maxY, node.y + r);
        }

        const minDim = 2 * ((graph.nodes[0] && graph.nodes[0].size) || 20);
        let bbW = Math.max(maxX - minX, minDim);
        let bbH = Math.max(maxY - minY, minDim);

        const usableW = panelW - 2 * PADDING;
        const usableH = panelH - LABEL_H - 2 * PADDING;
        const fitScale = Math.max(0.01, Math.min(usableW / bbW, usableH / bbH));

        const offsetX = (panelW - bbW * fitScale) / 2 - minX * fitScale;

        // Center within the FULL panel height (not just the region below the label),
        // so content isn't visually skewed toward the bottom of the card. Clamp so the
        // bounding box never rides up under the label row.
        const minTop = LABEL_H + PADDING;
        const centeredTop = (panelH - bbH * fitScale) / 2;
        const top = Math.max(centeredTop, minTop);
        const offsetY = top - minY * fitScale;

        return { offsetX, offsetY, fitScale };
    }

    invalidateLayout() {
        this.layoutStale = true;
    }
}
