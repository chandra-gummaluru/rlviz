// Handles simulation-specific canvas rendering decisions.
// Reads from viewModel (simulationState, graph, interaction mode); never writes.
// Depends on: EasingUtils, GeometricHelper, ColorUtils (loaded before this file),
//             and p5 globals: noStroke, fill, circle, stroke, strokeWeight, noFill, lerp.
class SimulationRenderer {

    constructor(viewModel) {
        this._vm = viewModel;

        this._ALPHA_FULL  = 255;
        this._ALPHA_DIM   = 80;
        this._ALPHA_FADED = 40;

        this._BALL_RADIUS    = 7;
        this._BALL_FILL_ALPHA = 230;
        this._BALL_RING_ALPHA = 120;
    }

    // Returns { dashed, alpha, colorOverride } for an edge during sim phases.
    getEdgeRenderInfo(from, to) {
        const full  = { dashed: false, alpha: this._ALPHA_FULL,  colorOverride: null };
        const faded = { dashed: false, alpha: this._ALPHA_FADED, colorOverride: null };

        if (this._vm.interaction.mode !== 'simulate') return full;
        if (!this._vm.simulationState) return full;
        const simState = this._vm.simulationState;
        const cur = simState.currentNode;
        if (!cur) return full;

        if (simState.phase === 'spinning_arrow' && cur.type === 'action') {
            if (from.id === cur.id && from.type === 'action' && to.type === 'state') {
                const hi = simState.getHighlightedEdgeByArrow();
                const an = this._vm.graph.getNodeById(cur.id);
                if (!an || !an.sas) return { dashed: true, alpha: this._ALPHA_DIM, colorOverride: null };
                const ht = an.sas[hi];
                if (ht && to.id === ht.nextState) return full;
                return { dashed: true, alpha: this._ALPHA_DIM, colorOverride: null };
            }
            if (to.id === cur.id) return full;
            return faded;
        }

        if (simState.phase === 'state_spinning_arrow' && cur.type === 'state') {
            if (from.id === cur.id && from.type === 'state' && to.type === 'action') {
                const hi = simState.getHighlightedEdgeByArrow();
                const highlightedEdge = simState.spinningArrowEdges[hi];
                if (highlightedEdge && to.id === highlightedEdge.targetId) return full;
                return { dashed: true, alpha: this._ALPHA_DIM, colorOverride: null };
            }
            if (to.id === cur.id) return full;
            return faded;
        }

        if (simState.phase === 'reveal' && cur.type === 'state') {
            const sn = this._vm.graph.getNodeById(cur.id);
            if (!sn || !sn.actions) return faded;
            if (from.id === cur.id && from.type === 'state' && to.type === 'action') {
                if (sn.actions.includes(to.id)) return full;
            }
            return faded;
        }

        return full;
    }

    // Returns trace-based alpha info for a node: null if not in trace, { alpha, forceOpaque }.
    // forceOpaque=true for current node and (outside spinning phases) the next trace node.
    // forceOpaque=false for prior visited nodes with decayed alpha.
    _getTraceAlphaInfo(nodeId) {
        const simState = this._vm.simulationState;
        if (!simState || !simState.replayInitialized || simState.currentIndex < 0) return null;
        const visited = simState.visited;
        if (!visited || visited.length === 0) return null;

        const ci = simState.currentIndex;

        if (visited[ci] && nodeId === visited[ci].id) {
            return { alpha: this._ALPHA_FULL, forceOpaque: true };
        }

        const isSpinningPhase = simState.phase === 'spinning_arrow' || simState.phase === 'state_spinning_arrow';
        if (!isSpinningPhase && ci + 1 < visited.length && visited[ci + 1] && nodeId === visited[ci + 1].id) {
            return { alpha: this._ALPHA_FULL, forceOpaque: true };
        }

        for (let i = ci - 1; i >= 0; i--) {
            if (visited[i] && visited[i].id === nodeId) {
                const age = ci - i;
                const alpha = Math.round(lerp(255, 40, Math.min(age, 5) / 5));
                return { alpha, forceOpaque: false };
            }
        }

        return null;
    }

    // Returns alpha (0-255) for a node during sim phases.
    getNodeAlpha(node) {
        if (this._vm.interaction.mode !== 'simulate') return this._ALPHA_FULL;
        if (!this._vm.simulationState) return this._ALPHA_FULL;
        const simState = this._vm.simulationState;
        const cur = simState.currentNode;
        if (!cur) return this._ALPHA_FULL;

        let phaseAlpha = this._ALPHA_FULL;

        if (simState.phase === 'spinning_arrow' && cur.type === 'action') {
            if (node.id === cur.id) {
                phaseAlpha = this._ALPHA_FULL;
            } else if (simState.currentIndex > 0) {
                const prev = simState.visited[simState.currentIndex - 1];
                if (prev && node.id === prev.id && node.type === 'state') {
                    phaseAlpha = this._ALPHA_FULL;
                } else {
                    const an = this._vm.graph.getNodeById(cur.id);
                    if (!an || !an.sas || !an.sas.some(t => t.nextState === node.id)) {
                        phaseAlpha = this._ALPHA_FADED;
                    } else {
                        const hi = simState.getHighlightedEdgeByArrow();
                        const ht = an.sas[hi];
                        phaseAlpha = (ht && node.id === ht.nextState) ? this._ALPHA_FULL : this._ALPHA_DIM;
                    }
                }
            } else {
                const an = this._vm.graph.getNodeById(cur.id);
                if (!an || !an.sas || !an.sas.some(t => t.nextState === node.id)) {
                    phaseAlpha = this._ALPHA_FADED;
                } else {
                    const hi = simState.getHighlightedEdgeByArrow();
                    const ht = an.sas[hi];
                    phaseAlpha = (ht && node.id === ht.nextState) ? this._ALPHA_FULL : this._ALPHA_DIM;
                }
            }
        } else if (simState.phase === 'state_spinning_arrow' && cur.type === 'state') {
            if (node.id === cur.id) {
                phaseAlpha = this._ALPHA_FULL;
            } else {
                const hi = simState.getHighlightedEdgeByArrow();
                const highlightedEdge = simState.spinningArrowEdges[hi];
                const sn = this._vm.graph.getNodeById(cur.id);
                if (!sn || !sn.actions || !sn.actions.includes(node.id)) {
                    phaseAlpha = this._ALPHA_FADED;
                } else {
                    phaseAlpha = (highlightedEdge && node.id === highlightedEdge.targetId) ? this._ALPHA_FULL : this._ALPHA_DIM;
                }
            }
        } else if (simState.phase === 'reveal' && cur.type === 'state') {
            if (node.id === cur.id) {
                phaseAlpha = this._ALPHA_FULL;
            } else {
                const sn = this._vm.graph.getNodeById(cur.id);
                phaseAlpha = (sn && sn.actions && sn.actions.includes(node.id)) ? this._ALPHA_FULL : this._ALPHA_FADED;
            }
        }

        const traceAlpha = this._getTraceAlphaInfo(node.id);
        if (traceAlpha === null) return phaseAlpha;
        if (traceAlpha.forceOpaque) return this._ALPHA_FULL;
        return Math.min(phaseAlpha, traceAlpha.alpha);
    }

    // Draws the gold travel ball along the highlighted edge during the 'highlight' phase.
    drawTravelBall() {
        const simState = this._vm.simulationState;
        if (!simState || simState.phase !== 'highlight' || !simState.highlightedEdge) return;

        const { fromId, toId } = simState.highlightedEdge;
        const from = this._vm.graph.getNodeById(fromId);
        const to   = this._vm.graph.getNodeById(toId);
        if (!from || !to) return;

        const elapsed = Date.now() - simState.phaseStartTime;
        const t = EasingUtils.easeInOut(Math.min(1, elapsed / simState.phaseDuration));

        const dx = to.x - from.x, dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const nx = dx / dist, ny = dy / dist;

        const hasReverse = this._vm.graph.edges.some(
            e => e.getFromNode().id === toId && e.getToNode().id === fromId
        );

        let ballX, ballY;
        if (hasReverse) {
            const edgeObj = this._vm.graph.edges.find(
                e => e.getFromNode().id === fromId && e.getToNode().id === toId
            );
            let edgeWeight = 2;
            if (edgeObj && from.type === 'action' && to.type === 'state') {
                edgeWeight = 1 + 4 * edgeObj.getProbability();
            }
            const geom = GeometricHelper.buildCurvedEdgeGeometry(from, to, edgeWeight);
            if (!geom) return;
            const pt = GeometricHelper.getQuadraticBezierPoint(
                geom.startPoint, geom.visibleControl, geom.arrowBaseCenter, t
            );
            ballX = pt.x;
            ballY = pt.y;
        } else {
            ballX = lerp(from.x + nx * from.size, to.x - nx * to.size, t);
            ballY = lerp(from.y + ny * from.size, to.y - ny * to.size, t);
        }

        const r = this._BALL_RADIUS;
        noStroke();
        fill(ColorUtils.applyAlpha(AppPalette.simulation.travelBall, this._BALL_FILL_ALPHA));
        circle(ballX, ballY, r * 2);
        noFill();
        stroke(ColorUtils.applyAlpha(AppPalette.simulation.travelBall, Math.round(this._BALL_RING_ALPHA * (1 - t))));
        strokeWeight(2);
        circle(ballX, ballY, r * 3);
        // ensure solid dash state after drawing
        if (typeof drawingContext !== 'undefined') drawingContext.setLineDash([]);
    }
}
