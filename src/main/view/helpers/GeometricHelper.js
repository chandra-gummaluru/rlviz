// Geometric calculations for rendering and hit detection
class GeometricHelper {
    /**
     * Find which entity (node, edge, textLabel) is at a given position
     */
    static findEntityAtPosition(graph, x, y) {
        // Check edge labels first (top layer)
        const edgeLabel = this.findEdgeLabelAtPosition(graph, x, y);
        if (edgeLabel) {
            return { type: 'edgeLabel', entity: edgeLabel };
        }

        // Check text labels
        const textLabel = graph.textLabels.find(label => label.contains(x, y));
        if (textLabel) {
            return { type: 'textLabel', entity: textLabel };
        }

        // Check nodes (higher priority than edges — visually on top)
        for (let i = graph.nodes.length - 1; i >= 0; i--) {
            const node = graph.nodes[i];
            if (node.contains(x, y)) {
                return { type: 'node', entity: node };
            }
        }

        // Check edges
        const edge = this.findEdgeAtPosition(graph, x, y);
        if (edge) {
            return { type: 'edge', entity: edge };
        }

        return { type: 'none', entity: null };
    }

    /**
     * Find edge at position, considering bidirectional edges
     */
    static findEdgeAtPosition(graph, x, y, threshold = 10) {
        return graph.edges.find(edge => {
            const from = edge.getFromNode();
            const to = edge.getToNode();

            // Check if this edge is part of a bidirectional pair
            const reverseEdge = graph.edges.find(e =>
                e.getFromNode().id === to.id && e.getToNode().id === from.id
            );
            const isBidirectional = reverseEdge !== undefined && reverseEdge !== null;

            if (isBidirectional) {
                return this.isPointNearCurvedEdge(from, to, x, y, threshold);
            } else {
                return this.isPointNearStraightEdge(from, to, x, y, threshold);
            }
        });
    }

    /**
     * Check if point is near a straight line edge (visible portion only)
     */
    static isPointNearStraightEdge(from, to, x, y, threshold = 10) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return false;

        const normalizedDx = dx / distance;
        const normalizedDy = dy / distance;

        // Calculate arrow size (must match mainView.js)
        let weight;
        if (from.type === 'state' && to.type === 'action') {
            weight = 2;
        } else {
            // For action->state, use default weight
            weight = 5;
        }
        const arrowSize = 8 + weight * 0.5;

        // Calculate where the line actually ends (just before arrowhead)
        const toRadius = to.size;
        const arrowTipX = to.x - normalizedDx * toRadius;
        const arrowTipY = to.y - normalizedDy * toRadius;
        const lineEndX = arrowTipX - normalizedDx * arrowSize;
        const lineEndY = arrowTipY - normalizedDy * arrowSize;

        // The line is drawn from center to center in mainView.js
        const startX = from.x;
        const startY = from.y;
        const endX = lineEndX;
        const endY = lineEndY;

        // Calculate the parametric line
        const lineVecX = endX - startX;
        const lineVecY = endY - startY;
        const lineLength = Math.sqrt(lineVecX * lineVecX + lineVecY * lineVecY);

        if (lineLength === 0) return false;

        // Find closest point on the line to (x, y)
        const dot = ((x - startX) * lineVecX + (y - startY) * lineVecY) / (lineLength * lineLength);

        // Clamp to line segment
        if (dot < 0 || dot > 1) return false;

        const projX = startX + dot * lineVecX;
        const projY = startY + dot * lineVecY;

        // Check if the click point itself is inside a node (prioritize node selection)
        const distClickFromStart = Math.sqrt((x - from.x) ** 2 + (y - from.y) ** 2);
        const distClickFromEnd = Math.sqrt((x - to.x) ** 2 + (y - to.y) ** 2);

        if (distClickFromStart <= from.size || distClickFromEnd <= to.size) {
            return false; // Click is inside a node, don't select edge
        }

        // Check distance from click to projected point on line
        const distanceToLine = Math.sqrt((x - projX) ** 2 + (y - projY) ** 2);

        return distanceToLine <= threshold;
    }

    /**
     * Check if point is near a curved (bidirectional) edge
     */
    static isPointNearCurvedEdge(from, to, x, y, threshold = 10) {
        const controlPoint = this.calculateCurveControlPoint(from, to);

        // Sample points along the curve and find minimum distance
        let minDistance = Infinity;
        const samples = 20;

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;

            // Quadratic Bezier formula
            const curveX = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlPoint.x + t * t * to.x;
            const curveY = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlPoint.y + t * t * to.y;

            // Check if this point on the curve is outside both node circles (visible)
            const distFromStart = Math.sqrt((curveX - from.x) ** 2 + (curveY - from.y) ** 2);
            const distFromEnd = Math.sqrt((curveX - to.x) ** 2 + (curveY - to.y) ** 2);

            // Only check distance if this curve point is visible
            if (distFromStart > from.size && distFromEnd > to.size) {
                const dist = Math.sqrt((x - curveX) ** 2 + (y - curveY) ** 2);
                minDistance = Math.min(minDistance, dist);
            }
        }

        // If no visible points were found (nodes overlap), return false
        if (minDistance === Infinity) return false;

        return minDistance <= threshold;
    }

    /**
     * Calculate Bezier curve control point for bidirectional edges
     */
    static calculateCurveControlPoint(from, to, curveOffset = 0.15) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular vector (rotate 90 degrees)
        const perpX = -dy / distance;
        const perpY = dx / distance;

        // Control point offset
        const offset = distance * curveOffset;
        return {
            x: (from.x + to.x) / 2 + perpX * offset,
            y: (from.y + to.y) / 2 + perpY * offset
        };
    }

    /**
     * Check if click is on the edge (circumference) of a node
     */
    static isClickOnNodeEdge(node, x, y, edgeThreshold = 8) {
        const distance = node.distanceTo(x, y);
        if (distance > node.size) return false;

        const distanceFromEdge = Math.abs(distance - node.size);
        return distanceFromEdge <= edgeThreshold;
    }

    /**
     * Check if a click should be interpreted as double-click
     */
    static isDoubleClick(lastClickTime, lastClickedEntity, currentEntity, doubleClickThreshold = 500) {
        const currentTime = Date.now();
        return lastClickedEntity === currentEntity &&
               currentTime - lastClickTime < doubleClickThreshold;
    }

    /**
     * Find edge label at position
     * Returns edge if click is near the label
     */
    static findEdgeLabelAtPosition(graph, x, y) {
        for (const edge of graph.edges) {
            const from = edge.getFromNode();
            const to = edge.getToNode();

            // Only Action → State edges have labels
            if (from.type !== 'action' || to.type !== 'state') continue;

            // Calculate label position
            const isBidirectional = graph.edges.some(e =>
                e.getFromNode() === to && e.getToNode() === from
            );

            let labelX, labelY;

            if (isBidirectional) {
                // Curved edge - label on curve at t=0.5
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const perpX = -dy / distance;
                const perpY = dx / distance;
                const curveOffset = distance * 0.15;
                const controlX = (from.x + to.x) / 2 + perpX * curveOffset;
                const controlY = (from.y + to.y) / 2 + perpY * curveOffset;

                const t = 0.5;
                labelX = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlX + t * t * to.x + edge.labelOffset.x;
                labelY = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlY + t * t * to.y + edge.labelOffset.y;
            } else {
                // Straight edge - label at midpoint
                labelX = (from.x + to.x) / 2 + edge.labelOffset.x;
                labelY = (from.y + to.y) / 2 + edge.labelOffset.y;
            }

            // Check if click is within label bounds (approximate)
            const labelWidth = edge.labelSize * 5; // Rough estimate
            const labelHeight = edge.labelSize * 1.5;

            if (Math.abs(x - labelX) < labelWidth &&
                Math.abs(y - labelY) < labelHeight) {
                return edge;
            }
        }

        return null;
    }
}
