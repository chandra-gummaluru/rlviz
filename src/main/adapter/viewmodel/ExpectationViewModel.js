class ExpectationViewModel {
    constructor() {
        this.panelLayout = null;
        this.layoutStale = true;
        this.isPlaying = false;
        // Which mini-panel/rollout is pinned as "selected" - highlights its path on the shared
        // right-pane graph panel (expectationView.js's _drawGraphPanel). Renamed from the old
        // focusedRunIndex: selecting a run no longer triggers a full-canvas takeover (that
        // "focused mode" concept was removed - see the MC screen split plan), it just drives
        // which run's path the always-visible right pane highlights.
        this.selectedRunIndex = null;
        // 'grid' (default) or 'chart' - which view the LEFT 52% pane currently shows. Presentation
        // only, mirrors buildCanvasView/valuesSubView's own presentation-state convention.
        this.leftView = 'grid';
        this.lastResponse = null;
        this.lastError = null;
        // Index (within the displayed slice) of the currently hovered mini-panel / chart-dock
        // element; drives live-linking highlights across the grid and (in a later phase) charts.
        this.hoveredRun = null;
    }

    // topOffset (default 0): pixels to push every panel down by, e.g. to clear a floating pill
    // overlapping the top of the canvas. Baked directly into each panel's stored y so drawing
    // and mouse hit-testing (handleClick/handleMouseMove in expectationView.js, which compare
    // raw mouse coordinates against panel.x/panel.y) stay consistent with a single source of
    // truth, rather than applying a separate draw-time transform hit-testing would need to
    // duplicate.
    computeLayout(canvasW, canvasH, displayRuns, graph, topOffset = 0) {
        const GRID = { 16: [4,4], 32: [8,4], 64: [8,8] };
        const [cols, rows] = GRID[displayRuns] || [4, 4];
        const panelW = Math.floor(canvasW / cols);
        const panelH = Math.floor(canvasH / rows);

        const panels = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                panels.push({ x: c * panelW, y: topOffset + r * panelH, w: panelW, h: panelH });
            }
        }

        const fitTransform = this._computeFitTransform(graph, panelW, panelH);
        this.panelLayout = { cols, rows, panels, fitTransform };
        this.layoutStale = false;
    }

    // Fixed 52%/48% left/right split of whatever full canvas width ExpectationView already
    // receives (mainView.js's _valuesPaneWidths() keeps handing MC the FULL usable width - this
    // is where the actual split happens, internally, per the Phase 3a design). Not user-resizable
    // in this phase - no drag handle.
    splitWidths(canvasW) {
        const leftW = Math.floor(canvasW * 0.52);
        return { leftW, rightW: canvasW - leftW };
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

    // Combined getter: pinned run wins over hovered, for chart-dock highlighting.
    // When a run is pinned (selectedRunIndex !== null), that takes precedence;
    // otherwise use the hovered run for live-linking highlights.
    get highlightedRun() {
        return this.selectedRunIndex !== null ? this.selectedRunIndex : this.hoveredRun;
    }
}
