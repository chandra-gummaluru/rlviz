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

        const nodeNameLabel = this.findNodeNameLabelAtPosition(graph, x, y);
        if (nodeNameLabel) {
            return { type: 'nodeNameLabel', entity: nodeNameLabel };
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

    static findNodeNameLabelAtPosition(graph, x, y, fontSize = 16) {
        for (let i = graph.nodes.length - 1; i >= 0; i--) {
            const node = graph.nodes[i];
            if (!node.image || !node.getNameLabelPosition) continue;
            const pos = node.getNameLabelPosition();
            const textWidth = String(node.name).length * fontSize * 0.6;
            const textHeight = fontSize;
            if (x >= pos.x - textWidth / 2 &&
                x <= pos.x + textWidth / 2 &&
                y >= pos.y - textHeight / 2 &&
                y <= pos.y + textHeight / 2) {
                return node;
            }
        }
        return null;
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

            const weight = (from.type === 'state' && to.type === 'action')
                ? 2
                : 1 + 4 * edge.getProbability();

            if (isBidirectional) {
                return this.isPointNearCurvedEdge(from, to, x, y, weight, threshold);
            } else {
                return this.isPointNearStraightEdge(from, to, x, y, weight, threshold);
            }
        });
    }

    /**
     * Check if point is near a straight line edge (visible portion only)
     */
    static isPointNearStraightEdge(from, to, x, y, weight, threshold = 10) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance === 0) return false;

        const normalizedDx = dx / distance;
        const normalizedDy = dy / distance;

        const arrowSize = 8 + weight * 1.5;

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
     * Check if point is near a curved (bidirectional) edge.
     * Samples the visible curve (startPoint → arrowBaseCenter) built by buildCurvedEdgeGeometry.
     */
    static isPointNearCurvedEdge(from, to, x, y, weight, threshold = 10) {
        const geom = this.buildCurvedEdgeGeometry(from, to, weight);
        if (!geom) return false;

        let minDistance = Infinity;
        const samples = 20;
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const pt = this.getQuadraticBezierPoint(geom.startPoint, geom.visibleControl, geom.arrowBaseCenter, t);
            const dist = Math.sqrt((x - pt.x) ** 2 + (y - pt.y) ** 2);
            minDistance = Math.min(minDistance, dist);
        }

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

    /** Point on a quadratic Bezier at parameter t */
    static getQuadraticBezierPoint(p0, p1, p2, t) {
        const mt = 1 - t;
        return {
            x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
            y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y
        };
    }

    /** Normalized tangent on a quadratic Bezier at parameter t */
    static getQuadraticBezierTangent(p0, p1, p2, t) {
        const tx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
        const ty = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
        const len = Math.sqrt(tx * tx + ty * ty);
        return len > 0 ? { x: tx / len, y: ty / len } : { x: 1, y: 0 };
    }

    /**
     * Build all geometry needed to draw and interact with a curved (bidirectional) edge.
     * Returns null if nodes are too close to render.
     *
     * Returns:
     *   startPoint      — source node circumference point (visible curve start)
     *   arrowTip        — target node circumference point (arrowhead tip)
     *   arrowDir        — normalized tangent at arrowTip
     *   arrowSize       — arrowhead size in px (clamped for short edges)
     *   arrowBaseCenter — where the visible curve terminates (slightly inside arrowhead)
     *   visibleControl  — control point for the visible quadratic Bezier
     *   midpoint        — midpoint of the visible curve (for labels)
     *   guideControl    — original center-to-center control point
     *   tStart, arrowT  — parameter values on the guide curve
     */
    static buildCurvedEdgeGeometry(from, to, weight, curveOffset = 0.15) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 1) return null;

        const p0 = { x: from.x, y: from.y };
        const p2 = { x: to.x, y: to.y };

        // Guide curve control point (perpendicular offset from midpoint)
        const perpX = -dy / distance;
        const perpY = dx / distance;
        const p1 = {
            x: (from.x + to.x) / 2 + perpX * distance * curveOffset,
            y: (from.y + to.y) / 2 + perpY * distance * curveOffset
        };

        // Binary-search tStart: where guide curve exits the from-node circumference
        let tStartMin = 0.0, tStartMax = 0.5;
        for (let i = 0; i < 10; i++) {
            const t = (tStartMin + tStartMax) / 2;
            const pt = this.getQuadraticBezierPoint(p0, p1, p2, t);
            const d = Math.sqrt((pt.x - from.x) ** 2 + (pt.y - from.y) ** 2);
            if (d < from.size) tStartMin = t; else tStartMax = t;
        }
        const tStart = (tStartMin + tStartMax) / 2;
        const startPoint = this.getQuadraticBezierPoint(p0, p1, p2, tStart);

        // Binary-search arrowT: where guide curve enters the to-node circumference
        let tMin = 0.5, tMax = 1.0;
        for (let i = 0; i < 10; i++) {
            const t = (tMin + tMax) / 2;
            const pt = this.getQuadraticBezierPoint(p0, p1, p2, t);
            const d = Math.sqrt((pt.x - to.x) ** 2 + (pt.y - to.y) ** 2);
            if (d > to.size) tMin = t; else tMax = t;
        }
        const arrowT = (tMin + tMax) / 2;
        const arrowTip = this.getQuadraticBezierPoint(p0, p1, p2, arrowT);
        const arrowDir = this.getQuadraticBezierTangent(p0, p1, p2, arrowT);

        // Clamp arrowhead size on very short edges
        const arrowSize = Math.min(8 + weight * 1.5, distance * 0.25);

        // Terminate the visible curve slightly inside the arrowhead to prevent subpixel gaps
        const overlap = weight * 0.5;
        const arrowBaseCenter = {
            x: arrowTip.x - arrowDir.x * Math.max(0, arrowSize - overlap),
            y: arrowTip.y - arrowDir.y * Math.max(0, arrowSize - overlap)
        };

        // Fit visibleControl so the visible Bezier passes through the guide-curve midpoint.
        // For quadratic: B(0.5) = 0.25*P0 + 0.5*P1 + 0.25*P2  =>  P1 = 2*B - 0.5*P0 - 0.5*P2
        const guideMid = this.getQuadraticBezierPoint(p0, p1, p2, 0.5);
        const visibleControl = {
            x: 2 * guideMid.x - 0.5 * startPoint.x - 0.5 * arrowBaseCenter.x,
            y: 2 * guideMid.y - 0.5 * startPoint.y - 0.5 * arrowBaseCenter.y
        };

        // Midpoint of the actual visible curve (for labels)
        const midpoint = this.getQuadraticBezierPoint(startPoint, visibleControl, arrowBaseCenter, 0.5);

        return {
            guideControl: p1,
            tStart,
            arrowT,
            startPoint,
            arrowTip,
            arrowDir,
            arrowSize,
            arrowBaseCenter,
            visibleControl,
            midpoint
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
                // Curved edge - label at midpoint of visible curve
                const geom = this.buildCurvedEdgeGeometry(from, to, 5);
                if (!geom) continue;
                labelX = geom.midpoint.x + edge.labelOffset.x;
                labelY = geom.midpoint.y + edge.labelOffset.y;
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
