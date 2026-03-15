class MainView {
    constructor(canvasViewModel, canvasController, _unused, menuBar, toolBar, rightPanel) {
        this.viewModel = canvasViewModel;
        this.controller = canvasController;
        this.menuBar = menuBar;
        this.toolBar = toolBar;
        this.rightPanel = rightPanel;

        this.MENU_BAR_HEIGHT = menuBar ? menuBar.getHeight() : 0;
        this.TOOL_BAR_HEIGHT = toolBar ? toolBar.getHeight() : 0;
        this.TOP_BARS_HEIGHT = this.MENU_BAR_HEIGHT + this.TOOL_BAR_HEIGHT;
        this.RIGHT_PANEL_WIDTH = rightPanel ? rightPanel.getWidth() : 0;

        this.canvas = null;

        // Track previous selection to detect changes
        this.previousSelectedNode = null;
        this.previousSimulationIndex = -1; // Track simulation position for right panel updates

        // Touch handling for pinch zoom
        this.touches = [];
        this.lastPinchDistance = 0;
    }

    setup() {
        const canvasWidth = windowWidth - this.RIGHT_PANEL_WIDTH;
        const canvasHeight = windowHeight - this.TOP_BARS_HEIGHT;

        this.canvas = createCanvas(canvasWidth, canvasHeight);
        this.canvas.position(0, this.TOP_BARS_HEIGHT);

        // Set global text font to Calibri
        textFont('Calibri, "Segoe UI", Tahoma, sans-serif');

        noLoop();
        redraw();
    }

    draw() {
        console.log('Draw called');
        console.log('Nodes:', this.viewModel.graph.nodes.length);
        console.log('PlacingMode:', this.viewModel.interaction.placingMode);
        console.log('HeldNode:', this.viewModel.interaction.heldNode);

        background(240);

        // Apply zoom and pan transformations
        push();
        translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
        scale(this.viewModel.viewport.zoom);

        this.drawEdges();
        this.drawNodes();
        this.drawTextLabels();

        // Draw spinning arrow if in spinning arrow phase
        if (this.viewModel.simulationState &&
            this.viewModel.simulationState.phase === 'spinning_arrow') {
            console.log('[draw] Calling drawSpinningArrow()');
            this.drawSpinningArrow();
        }

        pop();

        // Draw zoom level indicator
        this.drawZoomIndicator();

        // Draw info/error messages
        this.drawMessages();

        // Update right panel if selection changed or simulation state changed
        if (this.rightPanel) {
            const currentSelection = this.viewModel.selection.selectedNode;
            const isSimulating = this.viewModel.simulationState && this.viewModel.simulationState.replayInitialized;
            const simulationIndex = isSimulating ? this.viewModel.simulationState.currentIndex : -1;

            // Update if selection changed OR if simulating and position changed
            if (currentSelection !== this.previousSelectedNode ||
                (isSimulating && simulationIndex !== this.previousSimulationIndex)) {
                this.rightPanel.updateContent();
                this.previousSelectedNode = currentSelection;
                this.previousSimulationIndex = simulationIndex;
            }
        }

        if (this.viewModel.interaction.heldNode && this.viewModel.interaction.placingMode) {
            this.updateHeldNodePosition();
        }
        if (this.viewModel.interaction.heldTextLabel && this.viewModel.interaction.placingMode === 'textbox') {
            this.updateHeldNodePosition();
        }
    }

    drawMessages() {
        // Display info message if set
        if (this.viewModel.infoMessage) {
            push();
            fill(0, 150, 0, 200);
            noStroke();
            rect(10, height - 50, 400, 40, 5);
            fill(255);
            textAlign(LEFT, CENTER);
            textSize(14);
            text(this.viewModel.infoMessage, 20, height - 30);
            pop();

            // Clear message after 3 seconds
            setTimeout(() => {
                this.viewModel.infoMessage = null;
                redraw();
            }, 3000);
        }

        // Display error message if set
        if (this.viewModel.errorMessage) {
            push();
            fill(200, 0, 0, 200);
            noStroke();
            rect(10, height - 50, 400, 40, 5);
            fill(255);
            textAlign(LEFT, CENTER);
            textSize(14);
            text(this.viewModel.errorMessage, 20, height - 30);
            pop();

            // Clear message after 3 seconds
            setTimeout(() => {
                this.viewModel.errorMessage = null;
                redraw();
            }, 3000);
        }
    }

    redrawSimulation() {
        // Called by presenter to trigger canvas redraw during simulation
        redraw();

        // Update right panel to show current simulation state
        if (this.rightPanel) {
            this.rightPanel.updateContent();
        }
    }

    drawZoomIndicator() {
        push();
        fill(0, 0, 0, 150);
        noStroke();
        textAlign(RIGHT, BOTTOM);
        textSize(12);
        text(`Zoom: ${(this.viewModel.viewport.zoom * 100).toFixed(0)}%`, width - 10, height - 10);
        pop();
    }

    drawNodes() {
        const nodes = this.viewModel.graph.nodes;

        nodes.forEach(node => {
            // In simulate mode with active simulation, check visibility
            if (this.viewModel.interaction.mode === 'simulate' &&
                this.viewModel.simulationState &&
                this.viewModel.simulationState.replayInitialized) {
                if (!this.viewModel.simulationState.isNodeVisible(node.id)) {
                    return; // Skip invisible nodes
                }
            }

            const nodeVM = this.viewModel.createNodeViewModel(node);
            const color = nodeVM.color;

            // Get spinning arrow alpha for this node
            const nodeAlpha = this.getNodeSpinningArrowAlpha(node);
            const isNodeFaded = nodeAlpha < 255;

            // Apply alpha to node fill color
            const nodeColor = this.applyAlphaToColor(color, nodeAlpha);
            fill(nodeColor);
            stroke(this.applyAlphaToColor('rgb(0,0,0)', nodeAlpha));
            strokeWeight(2);

            // Apply dashed stroke for faded destination nodes
            if (isNodeFaded) {
                drawingContext.setLineDash([6, 3]);
            }

            circle(node.x, node.y, node.size * 2);

            if (isNodeFaded) {
                drawingContext.setLineDash([]);
            }

            // Draw image inside node if available
            if (node.image) {
                push();
                // Clip to circular shape
                imageMode(CENTER);

                // Load image if not already loaded
                if (!node._imageObj) {
                    node._imageObj = loadImage(node.image);
                }

                if (node._imageObj && node._imageObj.width > 0) {
                    // Create circular mask using clip
                    drawingContext.save();
                    drawingContext.beginPath();
                    drawingContext.arc(node.x, node.y, node.size * 0.8, 0, TWO_PI);
                    drawingContext.clip();

                    // Draw image to fit inside circle
                    const imgSize = node.size * 1.6; // Diameter * 0.8
                    image(node._imageObj, node.x, node.y, imgSize, imgSize);

                    drawingContext.restore();
                }
                pop();
            } else {
                // Only draw text if no image
                fill(255, 255, 255, nodeAlpha);
                noStroke();
                textAlign(CENTER, CENTER);
                textSize(14);
                text(node.name, node.x, node.y);
            }
        });
    }

    drawEdges() {
        const edges = this.viewModel.graph.edges;

        edges.forEach(edge => {
            const from = edge.getFromNode();
            const to = edge.getToNode();

            // In simulate mode with active simulation, check visibility
            if (this.viewModel.interaction.mode === 'simulate' &&
                this.viewModel.simulationState &&
                this.viewModel.simulationState.replayInitialized) {
                if (!this.viewModel.simulationState.isEdgeVisible(from.id, to.id)) {
                    return; // Skip invisible edges
                }
            }

            // Use EdgeViewModel for presentation logic
            const edgeVM = this.viewModel.createEdgeViewModel(edge);
            const isBidirectional = edgeVM.isBidirectional;

            // Calculate arrow size
            // State → Action edges: uniform weight (probability not meaningful)
            // Action → State edges: weight based on probability
            let weight;
            if (from.type === 'state' && to.type === 'action') {
                weight = 2; // Consistent weight for State → Action edges
            } else {
                weight = 1 + 4 * edge.getProbability(); // Probability-based for Action → State
            }

            const edgeColor = edgeVM.color;

            if (isBidirectional) {
                // Draw curved edge
                this.drawCurvedEdge(from, to, weight, edgeColor, edge);
            } else {
                // Draw straight edge (original behavior)
                this.drawStraightEdge(from, to, weight, edgeColor, edge);
            }
        });
    }

    findReverseEdge(edges, from, to) {
        return edges.find(e =>
            e.getFromNode().id === to.id && e.getToNode().id === from.id
        ) || null;
    }

    drawStraightEdge(from, to, weight, edgeColor, edge) {
        // Calculate direction vector from 'from' to 'to'
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Normalize the direction
        const normalizedDx = dx / distance;
        const normalizedDy = dy / distance;

        const arrowSize = 8 + weight * 1.5;

        // Calculate the point on the circumference of the 'to' node
        const toRadius = to.size;
        const arrowTipX = to.x - normalizedDx * toRadius;
        const arrowTipY = to.y - normalizedDy * toRadius;

        // End the line before the arrowhead to avoid covering it
        const lineEndX = arrowTipX - normalizedDx * arrowSize;
        const lineEndY = arrowTipY - normalizedDy * arrowSize;

        // Get spinning arrow render info (dashed + alpha + optional color override)
        const renderInfo = this.getSpinningArrowRenderInfo(from, to);

        // Use color override (blue tint from ring) if available, otherwise default edge color
        const baseColor = renderInfo.colorOverride || edgeColor;
        const alphaEdgeColor = this.applyAlphaToColor(baseColor, renderInfo.alpha);

        // Draw the edge line (stops before the arrowhead)
        strokeWeight(weight);
        stroke(alphaEdgeColor);

        if (renderInfo.dashed) {
            drawingContext.setLineDash([8, 4]);
        }

        line(from.x, from.y, lineEndX, lineEndY);

        if (renderInfo.dashed) {
            drawingContext.setLineDash([]);  // Reset to solid
        }

        // Draw arrowhead at the circumference
        this.drawArrowhead(arrowTipX, arrowTipY, normalizedDx, normalizedDy, alphaEdgeColor, weight);

        // Only show probability and reward labels for Action → State edges
        if (from.type === 'action' && to.type === 'state') {
            const midX = (from.x + to.x) / 2 + edge.labelOffset.x;
            const midY = (from.y + to.y) / 2 + edge.labelOffset.y;

            const prob = edge.getProbability().toFixed(2);
            const reward = edge.getReward().toFixed(1);
            const labelText = `(${prob}, ${reward})`;

            noStroke();
            const labelColor = renderInfo.colorOverride || edge.getLabelColor();
            fill(this.applyAlphaToColor(labelColor, renderInfo.alpha));
            textSize(edge.labelSize);
            textAlign(CENTER, CENTER);
            text(labelText, midX, midY);
        }
    }

    drawCurvedEdge(from, to, weight, edgeColor, edge) {
        // Calculate perpendicular offset for the curve
        // Curve is based on center-to-center to maintain proper shape
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Perpendicular vector (rotate 90 degrees)
        const perpX = -dy / distance;
        const perpY = dx / distance;

        // Control point offset (adjust this value to change curve intensity)
        const curveOffset = distance * 0.15;
        const controlX = (from.x + to.x) / 2 + perpX * curveOffset;
        const controlY = (from.y + to.y) / 2 + perpY * curveOffset;

        // Find where the center-to-center curve intersects the 'from' node's circumference (curve start)
        const fromRadius = from.size;
        let tStartMin = 0.0;
        let tStartMax = 0.5;
        for (let i = 0; i < 10; i++) {
            const t = (tStartMin + tStartMax) / 2;
            const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlX + t * t * to.x;
            const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlY + t * t * to.y;
            const distToFromCenter = Math.sqrt((x - from.x) * (x - from.x) + (y - from.y) * (y - from.y));

            if (distToFromCenter < fromRadius) {
                tStartMin = t;
            } else {
                tStartMax = t;
            }
        }
        const tStart = (tStartMin + tStartMax) / 2;

        // Find where the center-to-center curve intersects the 'to' node's circumference
        const toRadius = to.size;
        const arrowSize = 8 + weight * 1.5;

        // Binary search for intersection point at node circumference
        let tMin = 0.5;
        let tMax = 1.0;
        for (let i = 0; i < 10; i++) {
            const t = (tMin + tMax) / 2;
            const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlX + t * t * to.x;
            const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlY + t * t * to.y;
            const distToCenter = Math.sqrt((x - to.x) * (x - to.x) + (y - to.y) * (y - to.y));

            if (distToCenter > toRadius) {
                tMin = t;
            } else {
                tMax = t;
            }
        }
        const arrowT = (tMin + tMax) / 2;
        const arrowX = (1 - arrowT) * (1 - arrowT) * from.x + 2 * (1 - arrowT) * arrowT * controlX + arrowT * arrowT * to.x;
        const arrowY = (1 - arrowT) * (1 - arrowT) * from.y + 2 * (1 - arrowT) * arrowT * controlY + arrowT * arrowT * to.y;

        // Calculate tangent at the intersection point for arrowhead direction
        const tangentDx = 2 * (1 - arrowT) * (controlX - from.x) + 2 * arrowT * (to.x - controlX);
        const tangentDy = 2 * (1 - arrowT) * (controlY - from.y) + 2 * arrowT * (to.y - controlY);
        const tangentDist = Math.sqrt(tangentDx * tangentDx + tangentDy * tangentDy);
        const normalizedTangentDx = tangentDx / tangentDist;
        const normalizedTangentDy = tangentDy / tangentDist;

        // Calculate where to stop the line (arrowSize pixels before the arrow tip)
        const lineEndX = arrowX - normalizedTangentDx * arrowSize;
        const lineEndY = arrowY - normalizedTangentDy * arrowSize;

        // Draw the curved line from edge of from node to arrowhead base
        // We need to find the t value where the curve reaches lineEnd (arrowhead base)
        // Use binary search to find the exact t value
        let tLineMin = tStart;
        let tLineMax = arrowT;
        for (let i = 0; i < 10; i++) {
            const t = (tLineMin + tLineMax) / 2;
            const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlX + t * t * to.x;
            const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlY + t * t * to.y;
            const distToLineEnd = Math.sqrt((x - lineEndX) * (x - lineEndX) + (y - lineEndY) * (y - lineEndY));

            if (distToLineEnd > 0.5) {
                tLineMin = t;
            } else {
                tLineMax = t;
            }
        }
        const tLineEnd = (tLineMin + tLineMax) / 2;

        // Get spinning arrow render info (dashed + alpha + optional color override)
        const renderInfo = this.getSpinningArrowRenderInfo(from, to);
        const baseColor = renderInfo.colorOverride || edgeColor;
        const alphaEdgeColor = this.applyAlphaToColor(baseColor, renderInfo.alpha);

        // Draw the curved line from tStart (edge of from node) to tLineEnd (arrowhead base)
        strokeWeight(weight);
        stroke(alphaEdgeColor);
        noFill();

        if (renderInfo.dashed) {
            drawingContext.setLineDash([8, 4]);
        }

        // Sample points along the curve from tStart to tLineEnd
        beginShape();
        // Always add the start point first
        const startX = (1 - tStart) * (1 - tStart) * from.x + 2 * (1 - tStart) * tStart * controlX + tStart * tStart * to.x;
        const startY = (1 - tStart) * (1 - tStart) * from.y + 2 * (1 - tStart) * tStart * controlY + tStart * tStart * to.y;
        vertex(startX, startY);

        // Sample intermediate points
        const step = 0.02;
        for (let t = tStart + step; t < tLineEnd; t += step) {
            const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlX + t * t * to.x;
            const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlY + t * t * to.y;
            vertex(x, y);
        }

        // Add the final point
        const finalX = (1 - tLineEnd) * (1 - tLineEnd) * from.x + 2 * (1 - tLineEnd) * tLineEnd * controlX + tLineEnd * tLineEnd * to.x;
        const finalY = (1 - tLineEnd) * (1 - tLineEnd) * from.y + 2 * (1 - tLineEnd) * tLineEnd * controlY + tLineEnd * tLineEnd * to.y;
        vertex(finalX, finalY);
        endShape();

        if (renderInfo.dashed) {
            drawingContext.setLineDash([]);  // Reset to solid
        }

        // Draw arrowhead at the intersection point
        this.drawArrowhead(arrowX, arrowY, normalizedTangentDx, normalizedTangentDy, alphaEdgeColor, weight);

        // Only show probability and reward labels for Action → State edges
        if (from.type === 'action' && to.type === 'state') {
            // Position label on the curve (at t=0.5)
            const labelT = 0.5;
            const labelX = (1 - labelT) * (1 - labelT) * from.x + 2 * (1 - labelT) * labelT * controlX + labelT * labelT * to.x + edge.labelOffset.x;
            const labelY = (1 - labelT) * (1 - labelT) * from.y + 2 * (1 - labelT) * labelT * controlY + labelT * labelT * to.y + edge.labelOffset.y;

            const prob = edge.getProbability().toFixed(2);
            const reward = edge.getReward().toFixed(1);
            const labelText = `(${prob}, ${reward})`;

            noStroke();
            const labelColor = renderInfo.colorOverride || edge.getLabelColor();
            fill(this.applyAlphaToColor(labelColor, renderInfo.alpha));
            textSize(edge.labelSize);
            textAlign(CENTER, CENTER);
            text(labelText, labelX, labelY);
        }
    }

    drawArrowhead(x, y, dirX, dirY, color, lineWeight) {
        // Arrow size proportional to line weight
        const arrowSize = 8 + lineWeight * 1.5;
        const arrowAngle = Math.PI / 6; // 30 degrees

        // Calculate the two points of the arrowhead
        // Rotate the direction vector by +/- arrowAngle
        const cos1 = Math.cos(Math.PI - arrowAngle);
        const sin1 = Math.sin(Math.PI - arrowAngle);
        const cos2 = Math.cos(Math.PI + arrowAngle);
        const sin2 = Math.sin(Math.PI + arrowAngle);

        const x1 = x + (dirX * cos1 - dirY * sin1) * arrowSize;
        const y1 = y + (dirX * sin1 + dirY * cos1) * arrowSize;
        const x2 = x + (dirX * cos2 - dirY * sin2) * arrowSize;
        const y2 = y + (dirX * sin2 + dirY * cos2) * arrowSize;

        // Draw filled triangle for the arrowhead
        fill(color);
        noStroke();
        triangle(x, y, x1, y1, x2, y2);
    }

    // Apply alpha to a color (supports p5 color objects, rgb(), hex strings)
    applyAlphaToColor(c, alpha) {
        if (alpha >= 255) return c;

        // Handle p5.js color objects (from color() function)
        if (typeof c === 'object' && c !== null && typeof c.levels !== 'undefined') {
            const r = red(c);
            const g = green(c);
            const b = blue(c);
            return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${(alpha / 255).toFixed(2)})`;
        }

        if (typeof c !== 'string') return c;

        // Handle rgb(r,g,b) format
        const rgbMatch = c.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
        if (rgbMatch) {
            return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${(alpha / 255).toFixed(2)})`;
        }

        // Handle rgba format (update alpha)
        const rgbaMatch = c.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)$/);
        if (rgbaMatch) {
            return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${(alpha / 255).toFixed(2)})`;
        }

        // Handle hex colors (#RRGGBB or #RGB)
        const hexMatch = c.match(/^#([0-9a-fA-F]{3,6})$/);
        if (hexMatch) {
            let hex = hexMatch[1];
            if (hex.length === 3) {
                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${(alpha / 255).toFixed(2)})`;
        }

        // Fallback: return as-is
        return c;
    }

    // Get rendering info for an edge during spinning arrow phase
    // Returns { dashed: bool, alpha: number, colorOverride: string|null }
    getSpinningArrowRenderInfo(from, to) {
        const defaultInfo = { dashed: false, alpha: 255, colorOverride: null };

        // Only during spinning arrow phase in simulate mode
        if (this.viewModel.interaction.mode !== 'simulate') return defaultInfo;
        if (!this.viewModel.simulationState) return defaultInfo;
        if (this.viewModel.simulationState.phase !== 'spinning_arrow') return defaultInfo;

        const simState = this.viewModel.simulationState;
        const currentNode = simState.currentNode;
        if (!currentNode || currentNode.type !== 'action') return defaultInfo;

        // Only affect edges outgoing from the current action node to state nodes
        if (from.id !== currentNode.id || from.type !== 'action' || to.type !== 'state') return defaultInfo;

        // Check if this edge is the one the arrow is currently pointing at
        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        const actionNode = this.viewModel.graph.getNodeById(currentNode.id);
        if (!actionNode || !actionNode.sas) return { dashed: true, alpha: 80, colorOverride: null };

        // Compute blue color matching the ring segment for this edge's transition
        const segments = simState.spinningArrowEdges;
        let blueColor = null;
        if (segments && segments.length > 0) {
            const probs = segments.map(s => s.probability);
            const minProb = Math.min(...probs);
            const maxProb = Math.max(...probs);
            // Find the segment matching this edge's target
            const matchingSegment = segments.find(s => s.targetId === to.id);
            if (matchingSegment) {
                blueColor = this.getRingSegmentColor(matchingSegment.probability, minProb, maxProb);
            }
        }

        // Find if this edge's target matches the highlighted transition's target
        const highlightedTransition = actionNode.sas[highlightedEdgeIndex];
        if (highlightedTransition && to.id === highlightedTransition.nextState) {
            return { dashed: false, alpha: 255, colorOverride: blueColor }; // Highlighted: solid, bright
        }

        return { dashed: true, alpha: 80, colorOverride: blueColor }; // Non-highlighted: dashed, faded
    }

    // Get alpha for a node during spinning arrow phase
    getNodeSpinningArrowAlpha(node) {
        if (this.viewModel.interaction.mode !== 'simulate') return 255;
        if (!this.viewModel.simulationState) return 255;
        if (this.viewModel.simulationState.phase !== 'spinning_arrow') return 255;

        const simState = this.viewModel.simulationState;
        const currentNode = simState.currentNode;
        if (!currentNode || currentNode.type !== 'action') return 255;

        const actionNode = this.viewModel.graph.getNodeById(currentNode.id);
        if (!actionNode || !actionNode.sas) return 255;

        // Check if this node is a destination of the current action node
        const isDestination = actionNode.sas.some(t => t.nextState === node.id);
        if (!isDestination) return 255;

        // Check if this node is the highlighted destination
        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        const highlightedTransition = actionNode.sas[highlightedEdgeIndex];
        if (highlightedTransition && node.id === highlightedTransition.nextState) {
            return 255; // Highlighted destination: full brightness
        }

        return 80; // Non-highlighted destination: faded
    }

    // Convert HSB (h: 0-360, s: 0-100, b: 0-100) to rgb() string
    hsbToRgb(h, s, b) {
        s /= 100;
        b /= 100;
        const c = b * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = b - c;
        let r, g, bl;
        if (h < 60) { r = c; g = x; bl = 0; }
        else if (h < 120) { r = x; g = c; bl = 0; }
        else if (h < 180) { r = 0; g = c; bl = x; }
        else if (h < 240) { r = 0; g = x; bl = c; }
        else if (h < 300) { r = x; g = 0; bl = c; }
        else { r = c; g = 0; bl = x; }
        return `rgb(${Math.round((r + m) * 255)}, ${Math.round((g + m) * 255)}, ${Math.round((bl + m) * 255)})`;
    }

    // Get the blue color for a ring segment based on probability
    getRingSegmentColor(probability, minProb, maxProb) {
        // Brightness: highest probability → 35 (dark), lowest → 85 (light)
        let brightness;
        if (maxProb === minProb) {
            brightness = 60; // Equal probabilities → uniform medium blue
        } else {
            const t = (probability - minProb) / (maxProb - minProb);
            brightness = 85 - t * 50; // 85 (low prob) to 35 (high prob)
        }
        return this.hsbToRgb(220, 80, brightness);
    }

    // Draw probability ring around action node during spinning arrow phase
    drawProbabilityRing(actionNode, simState) {
        const segments = simState.spinningArrowEdges;
        if (!segments || segments.length === 0) return;

        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        const innerRadius = actionNode.size;
        const baseOuterRadius = actionNode.size + 10;
        const highlightOuterRadius = actionNode.size + 13;
        const angleOffset = -Math.PI / 2; // Align with arrow (points UP at angle 0)
        const gap = 0.02; // 0.02 rad gap on each side

        // Find min/max probability for color mapping
        const probs = segments.map(s => s.probability);
        const minProb = Math.min(...probs);
        const maxProb = Math.max(...probs);

        const ctx = drawingContext;

        segments.forEach((segment, index) => {
            const isHighlighted = (index === highlightedEdgeIndex);
            const outerRadius = isHighlighted ? highlightOuterRadius : baseOuterRadius;

            // Inset arc by gap for visual separation
            let startAngle = segment.startAngle + gap + angleOffset;
            let endAngle = segment.endAngle - gap + angleOffset;
            if (endAngle <= startAngle) return; // Skip if gap eats the segment

            // Color based on probability
            let brightness;
            if (maxProb === minProb) {
                brightness = 60;
            } else {
                const t = (segment.probability - minProb) / (maxProb - minProb);
                brightness = 85 - t * 50;
            }
            if (isHighlighted) {
                brightness = Math.min(brightness, 30); // Slightly brighter for highlighted
            }
            const fillColor = this.hsbToRgb(220, 80, brightness);

            // Draw annular arc using Canvas 2D API
            ctx.beginPath();
            ctx.arc(actionNode.x, actionNode.y, outerRadius, startAngle, endAngle);
            ctx.arc(actionNode.x, actionNode.y, innerRadius, endAngle, startAngle, true);
            ctx.closePath();

            ctx.fillStyle = fillColor;
            ctx.fill();

            if (isHighlighted) {
                ctx.strokeStyle = 'rgba(255,255,255,1)';
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
            }
            ctx.stroke();
        });
    }

    // Draw spinning arrow animation at action node during selection phase
    drawSpinningArrow() {
        const simState = this.viewModel.simulationState;

        console.log('[drawSpinningArrow] Called, phase:', simState ? simState.phase : 'no simState');

        // Only draw if in spinning arrow phase
        if (!simState || simState.phase !== 'spinning_arrow') {
            console.log('[drawSpinningArrow] Exiting - wrong phase');
            return;
        }

        const currentNode = simState.currentNode;
        console.log('[drawSpinningArrow] currentNode:', currentNode);
        if (!currentNode || currentNode.type !== 'action') {
            console.log('[drawSpinningArrow] Exiting - no current node or not action');
            return;
        }

        // Get the actual action node from the graph
        const actionNode = this.viewModel.graph.getNodeById(currentNode.id);
        console.log('[drawSpinningArrow] actionNode:', actionNode);
        if (!actionNode || !actionNode.sas || actionNode.sas.length === 0) {
            console.log('[drawSpinningArrow] Exiting - no action node or no transitions');
            return;
        }

        console.log('[drawSpinningArrow] Drawing arrow! Transitions:', actionNode.sas.length);

        // Calculate current arrow angle with deceleration
        const currentAngle = simState.calculateArrowAngle();
        console.log('[drawSpinningArrow] Current angle:', currentAngle);

        // Get which edge the arrow is currently pointing at
        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();

        // Draw probability ring behind the arrow
        this.drawProbabilityRing(actionNode, simState);

        // Draw the arrow at the center of the action node
        push();

        // Position at action node center
        translate(actionNode.x, actionNode.y);

        // Rotate based on calculated angle
        rotate(currentAngle);

        // Draw arrow pointing upward (will be rotated)
        const arrowLength = 25;
        const arrowWidth = 12;

        // Arrow body
        fill(255, 87, 34);  // Orange/red color #FF5722
        noStroke();
        triangle(0, -arrowLength, -arrowWidth / 2, 0, arrowWidth / 2, 0);

        // Arrow outline for better visibility
        stroke(0);
        strokeWeight(1.5);
        noFill();
        triangle(0, -arrowLength, -arrowWidth / 2, 0, arrowWidth / 2, 0);

        pop();

        // Draw probability labels on each outgoing edge
        actionNode.sas.forEach((transition, index) => {
            const targetNode = this.viewModel.graph.getNodeById(transition.nextState);
            if (!targetNode) return;

            // Calculate midpoint of edge for label
            const midX = (actionNode.x + targetNode.x) / 2;
            const midY = (actionNode.y + targetNode.y) / 2;

            // Highlight currently pointed edge
            const isHighlighted = (index === highlightedEdgeIndex);

            // Display probability as percentage
            const probText = `p=${transition.probability.toFixed(2)}`;

            push();
            noStroke();

            if (isHighlighted) {
                // Highlighted: bright yellow background with larger text
                fill(255, 235, 59, 220);  // Bright yellow
                rect(midX - 30, midY - 12, 60, 24, 4);
                fill(0);
                textSize(14);
                textStyle(BOLD);
            } else {
                // Non-highlighted: faded to match dashed/transparent edges
                fill(255, 255, 255, 60);  // Very faded white background
                rect(midX - 30, midY - 12, 60, 24, 4);
                fill(80, 80, 80, 80);  // Faded text
                textSize(12);
                textStyle(NORMAL);
            }

            textAlign(CENTER, CENTER);
            text(probText, midX, midY);
            pop();
        });

        // Keep redrawing for smooth animation
        if (!simState.isPhaseComplete()) {
            setTimeout(() => redraw(), 16);  // ~60 FPS
        }
    }

    drawTextLabels() {
        const labels = this.viewModel.graph.textLabels;

        labels.forEach(label => {
            // Simple color logic: yellow if selected
            const color = this.viewModel.selection.selectedTextLabel === label ? '#FFC107' : '#000000';
            fill(color);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(label.fontSize);
            text(label.text, label.x, label.y);
        });
    }

    updateHeldNodePosition() {
        // This is called during draw() when a node is being placed
        // The controller already updates positions during drag, nothing to do here
        redraw();
    }

    mousePressed() {
        // In p5.js, mouseX and mouseY are canvas-relative (0 to width, 0 to height)
        // Only handle clicks within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // Close menu dropdowns when clicking on canvas
        if (this.menuBar) {
            this.menuBar.closeAllDropdowns();
        }

        // Note: Sidebar buttons are positioned absolutely to the left of the canvas
        // and handle their own click events (returning false to prevent propagation).
        // No need to check for button area overlap here.

        // Check if clicking on empty canvas for panning (must check BEFORE delegating to controller)
        const world = this.viewModel.viewport.screenToWorld(mouseX, mouseY);
        const target = GeometricHelper.findEntityAtPosition(this.viewModel.graph, world.x, world.y);

        // If clicking on empty canvas and not placing a node, start panning
        if (target.type === 'none' && !this.viewModel.interaction.placingMode) {
            this.viewModel.viewport.isPanning = true;
            this.viewModel.viewport.panStartX = mouseX;
            this.viewModel.viewport.panStartY = mouseY;
            this.viewModel.viewport.panStartOffsetX = this.viewModel.viewport.panX;
            this.viewModel.viewport.panStartOffsetY = this.viewModel.viewport.panY;
            cursor('grab');

            // Still delegate to controller to clear selection
            this.controller.handleMousePress(mouseX, mouseY);
            redraw();
            return;
        }

        // Delegate to controller for entity interactions
        this.controller.handleMousePress(mouseX, mouseY);

        // Check if we should update after simulate mode double-click
        if (this.viewModel.interaction.shouldCenterOnNode && this.viewModel.interaction.nodeToCenterOn) {
            // Skip camera centering - just update UI elements
            this.viewModel.interaction.shouldCenterOnNode = false;
            this.viewModel.interaction.nodeToCenterOn = null;
            this.rightPanel.updateContent(); // Update right panel to show new initial state
        }

        // Check if edge creation was requested
        if (this.viewModel.interaction.edgeCreationRequested) {
            this.promptForEdge(
                this.viewModel.interaction.pendingEdgeFrom,
                this.viewModel.interaction.pendingEdgeTo
            );
            this.viewModel.interaction.edgeCreationRequested = false;
            this.viewModel.interaction.pendingEdgeFrom = null;
            this.viewModel.interaction.pendingEdgeTo = null;
        }

        // Check if text label input was requested
        if (this.viewModel.interaction.textLabelRequested) {
            this.promptForTextLabel();
        }

        // Check if rename was requested
        if (this.viewModel.interaction.renameRequested && this.viewModel.interaction.renameTargetNode) {
            this.promptForRename(this.viewModel.interaction.renameTargetNode);
        }

        // Set cursor for resize
        if (this.viewModel.interaction.resizingNode) {
            cursor('nwse-resize');
        }

        redraw();
    }

    mouseDragged() {
        // Only handle drags within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        console.log('mouseDragged - isPanning:', this.viewModel.viewport.isPanning,
                    'draggingNode:', this.viewModel.interaction.draggingNode,
                    'resizingNode:', this.viewModel.interaction.resizingNode);

        // Handle panning
        if (this.viewModel.viewport.isPanning) {
            const dx = mouseX - this.viewModel.viewport.panStartX;
            const dy = mouseY - this.viewModel.viewport.panStartY;
            this.viewModel.viewport.panX = this.viewModel.viewport.panStartOffsetX + dx;
            this.viewModel.viewport.panY = this.viewModel.viewport.panStartOffsetY + dy;
            cursor('grabbing');
            redraw();
            return;
        }

        // Delegate to controller
        this.controller.handleMouseDrag(mouseX, mouseY);
        redraw();
    }

    mouseReleased() {
        // Only handle releases within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // End panning
        if (this.viewModel.viewport.isPanning) {
            this.viewModel.viewport.isPanning = false;
            cursor(ARROW);
            redraw();
            return;
        }

        // Delegate to controller
        this.controller.handleMouseRelease(mouseX, mouseY);

        // Check if edge creation was requested (can happen on release too)
        if (this.viewModel.interaction.edgeCreationRequested) {
            this.promptForEdge(
                this.viewModel.interaction.pendingEdgeFrom,
                this.viewModel.interaction.pendingEdgeTo
            );
            this.viewModel.interaction.edgeCreationRequested = false;
            this.viewModel.interaction.pendingEdgeFrom = null;
            this.viewModel.interaction.pendingEdgeTo = null;
        }

        // Reset cursor after resize
        if (this.viewModel.interaction.resizingNode) {
            cursor(ARROW);
        }

        redraw();
    }

    mouseMoved() {
        if (this.viewModel.interaction.placingMode) {
            redraw();
        }
    }

    promptForEdge(fromNode, toNode) {
        // State → Action edges don't need probability (just availability)
        // Action → State edges need probability and reward (transition probability)
        let prob, reward;

        if (fromNode.type === 'state' && toNode.type === 'action') {
            // State → Action: No probability needed
            prob = 1.0; // Dummy value, won't be used
            reward = 0; // No reward for state → action
        } else if (fromNode.type === 'action' && toNode.type === 'state') {
            // Action → State: Prompt for transition probability and reward
            const probStr = prompt('Enter transition probability [0-1]:', '0.5');
            if (probStr === null) return;

            const rewardStr = prompt('Enter reward:', '0');
            if (rewardStr === null) return;

            prob = parseFloat(probStr);
            reward = parseFloat(rewardStr);
        }

        this.controller.createEdge(fromNode.id, toNode.id, prob, reward);

        // Clear selection after creating edge
        if (this.controller.interactors && this.controller.interactors.selectNode) {
            const inputData = SelectNodeInputData.forClear();
            this.controller.interactors.selectNode.clearSelection(inputData);
        }

        redraw();
    }

    promptForTextLabel() {
        const text = prompt('Enter text label:');
        if (text && text.trim()) {
            // Create the text label - access interactor directly since controller doesn't have a method for this
            if (this.controller.interactors && this.controller.interactors.createTextLabel) {
                const inputData = CreateTextLabelInputData.forExecution(text, 0, 0, 16);
                this.controller.interactors.createTextLabel.execute(inputData);
            }
        }
        this.viewModel.interaction.textLabelRequested = false;
        redraw();
    }

    promptForRename(node) {
        const newName = prompt(`Rename "${node.name}":`, node.name);
        if (newName && newName.trim() && newName !== node.name) {
            // Access interactor directly since controller doesn't have a public method for this
            if (this.controller.interactors && this.controller.interactors.renameNode) {
                const inputData = RenameNodeInputData.forExecution(node.id, node.name, newName);
                this.controller.interactors.renameNode.executeRename(inputData);
            }
        }
        this.viewModel.interaction.renameRequested = false;
        this.viewModel.interaction.renameTargetNode = null;
        redraw();
    }

    centerOnNode(node, canvasWidth, canvasHeight) {
        // Center the viewport on the given node
        this.viewModel.viewport.panX = canvasWidth / 2 - node.x * this.viewModel.viewport.zoom;
        this.viewModel.viewport.panY = canvasHeight / 2 - node.y * this.viewModel.viewport.zoom;
    }

    mouseWheel(event) {
        // Only handle scroll on canvas
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // Zoom towards mouse position
        const zoomFactor = -event.delta * 0.001;
        const newZoom = this.viewModel.viewport.zoom * (1 + zoomFactor);

        this.viewModel.viewport.setZoom(newZoom, mouseX, mouseY);
        redraw();

        // Prevent page scroll
        return false;
    }

    touchStarted() {
        // Store touch points for pinch detection
        this.touches = [...touches];
        if (this.touches.length === 2) {
            const dx = this.touches[0].x - this.touches[1].x;
            const dy = this.touches[0].y - this.touches[1].y;
            this.lastPinchDistance = Math.sqrt(dx * dx + dy * dy);
        }
        // Prevent default to avoid page scrolling
        return false;
    }

    touchMoved() {
        // Handle pinch zoom
        if (touches.length === 2) {
            this.touches = [...touches];
            const dx = this.touches[0].x - this.touches[1].x;
            const dy = this.touches[0].y - this.touches[1].y;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);

            if (this.lastPinchDistance > 0) {
                const zoomChange = currentDistance / this.lastPinchDistance;
                const centerX = (this.touches[0].x + this.touches[1].x) / 2;
                const centerY = (this.touches[0].y + this.touches[1].y) / 2;

                this.viewModel.setZoom(this.viewModel.zoom * zoomChange, centerX, centerY);
                redraw();
            }

            this.lastPinchDistance = currentDistance;
            // Prevent default to avoid page scrolling
            return false;
        }
    }

    keyPressed() {
        // Delegate to controller
        const shouldPreventDefault = this.controller.handleKeyPress(key);

        redraw();

        return shouldPreventDefault;
    }

    keyReleased() {
        // Reserved for future key release handling
        return true;
    }

    windowResized() {
        const canvasWidth = windowWidth - this.RIGHT_PANEL_WIDTH;
        const canvasHeight = windowHeight - this.TOP_BARS_HEIGHT;

        resizeCanvas(canvasWidth, canvasHeight);
        this.canvas.position(0, this.TOP_BARS_HEIGHT);

        // Update menu bar width
        if (this.menuBar) {
            this.menuBar.updateWidth(windowWidth);
        }

        // Update toolbar width
        if (this.toolBar) {
            this.toolBar.updateWidth(windowWidth);
        }

        // Update right panel position and height
        if (this.rightPanel) {
            this.rightPanel.updateWidth(windowWidth);
            this.rightPanel.updateHeight(windowHeight, this.TOP_BARS_HEIGHT);
        }

        redraw();
    }
}
