class MainView {
    constructor(canvasViewModel, sideBar) {
        this.viewModel = canvasViewModel;
        this.sideBar = sideBar;

        this.sidebarCollapsed = false;
        this.SIDEBAR_WIDTH = 260;
        this.COLLAPSED_WIDTH = 0;

        this.canvas = null;

        // Touch handling for pinch zoom
        this.touches = [];
        this.lastPinchDistance = 0;
    }

    setup() {
        const sidebarWidth = this.sidebarCollapsed ?
            this.COLLAPSED_WIDTH : this.SIDEBAR_WIDTH;
        const canvasWidth = windowWidth - sidebarWidth;

        this.canvas = createCanvas(canvasWidth, windowHeight);
        this.canvas.position(sidebarWidth, 0);

        this.sideBar.setup();

        noLoop();
        redraw();
    }

    draw() {
        console.log('Draw called');
        console.log('Nodes:', this.viewModel.getNodes().length);
        console.log('PlacingMode:', this.viewModel.placingMode);
        console.log('HeldNode:', this.viewModel.heldNode);

        background(240);

        // Apply zoom and pan transformations
        push();
        translate(this.viewModel.panX, this.viewModel.panY);
        scale(this.viewModel.zoom);

        this.drawEdges();
        this.drawNodes();
        this.drawTextLabels();

        pop();

        // Draw zoom level indicator
        this.drawZoomIndicator();

        if (this.viewModel.heldNode && this.viewModel.placingMode) {
            this.updateHeldNodePosition();
        }
        if (this.viewModel.heldTextLabel && this.viewModel.placingMode === 'textbox') {
            this.updateHeldNodePosition();
        }
    }

    redrawSimulation() {
        // Called by presenter to trigger canvas redraw during simulation
        redraw();
    }

    drawZoomIndicator() {
        push();
        fill(0, 0, 0, 150);
        noStroke();
        textAlign(RIGHT, BOTTOM);
        textSize(12);
        text(`Zoom: ${(this.viewModel.zoom * 100).toFixed(0)}%`, width - 10, height - 10);
        pop();
    }

    drawNodes() {
        const nodes = this.viewModel.getNodes();

        nodes.forEach(node => {
            // In simulate mode with active simulation, check visibility
            if (this.viewModel.mode === 'simulate' &&
                this.viewModel.simulationState &&
                this.viewModel.simulationState.replayInitialized) {
                if (!this.viewModel.simulationState.isNodeVisible(node.id)) {
                    return; // Skip invisible nodes
                }
            }

            const color = this.viewModel.getNodeColor(node);

            fill(color);
            stroke(0);
            strokeWeight(2);
            circle(node.x, node.y, node.size * 2);

            fill(255);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(14);
            text(node.name, node.x, node.y);
        });
    }

    drawEdges() {
        const edges = this.viewModel.getEdges();

        edges.forEach(edge => {
            const from = edge.getFromNode();
            const to = edge.getToNode();

            // In simulate mode with active simulation, check visibility
            if (this.viewModel.mode === 'simulate' &&
                this.viewModel.simulationState &&
                this.viewModel.simulationState.replayInitialized) {
                if (!this.viewModel.simulationState.isEdgeVisible(from.id, to.id)) {
                    return; // Skip invisible edges
                }
            }

            // Check if there's a reverse edge (bidirectional)
            const reverseEdge = this.findReverseEdge(edges, from, to);
            const isBidirectional = reverseEdge !== null;

            // Calculate arrow size
            // State → Action edges: uniform weight (probability not meaningful)
            // Action → State edges: weight based on probability
            let weight;
            if (from.type === 'state' && to.type === 'action') {
                weight = 2; // Consistent weight for State → Action edges
            } else {
                weight = 1 + 8 * edge.getProbability(); // Probability-based for Action → State
            }

            const edgeColor = this.viewModel.getEdgeColor(edge);

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

        const arrowSize = 8 + weight * 0.5;

        // Calculate the point on the circumference of the 'to' node
        const toRadius = to.size;
        const arrowTipX = to.x - normalizedDx * toRadius;
        const arrowTipY = to.y - normalizedDy * toRadius;

        // End the line before the arrowhead to avoid covering it
        const lineEndX = arrowTipX - normalizedDx * arrowSize;
        const lineEndY = arrowTipY - normalizedDy * arrowSize;

        // Draw the edge line (stops before the arrowhead)
        strokeWeight(weight);
        stroke(edgeColor);
        line(from.x, from.y, lineEndX, lineEndY);

        // Draw arrowhead at the circumference
        this.drawArrowhead(arrowTipX, arrowTipY, normalizedDx, normalizedDy, edgeColor, weight);

        // Only show probability and reward labels for Action → State edges
        if (from.type === 'action' && to.type === 'state') {
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2;

            noStroke();
            fill(0);
            textSize(10);
            textAlign(CENTER);
            text(`p=${edge.getProbability().toFixed(2)}`, midX, midY - 8);
            text(`r=${edge.getReward().toFixed(1)}`, midX, midY + 8);
        }
    }

    drawCurvedEdge(from, to, weight, edgeColor, edge) {
        // Calculate perpendicular offset for the curve
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

        // Draw the curved line using quadratic bezier
        strokeWeight(weight);
        stroke(edgeColor);
        noFill();
        beginShape();
        vertex(from.x, from.y);
        quadraticVertex(controlX, controlY, to.x, to.y);
        endShape();

        // Calculate the tangent at the end of the curve for arrowhead
        const t = 0.95; // Sample point near the end

        // Tangent direction at t (derivative of quadratic bezier)
        const tangentDx = 2 * (1 - t) * (controlX - from.x) + 2 * t * (to.x - controlX);
        const tangentDy = 2 * (1 - t) * (controlY - from.y) + 2 * t * (to.y - controlY);
        const tangentDist = Math.sqrt(tangentDx * tangentDx + tangentDy * tangentDy);
        const normalizedTangentDx = tangentDx / tangentDist;
        const normalizedTangentDy = tangentDy / tangentDist;

        // Calculate arrowhead position on node circumference
        const toRadius = to.size;
        const arrowTipX = to.x - normalizedTangentDx * toRadius;
        const arrowTipY = to.y - normalizedTangentDy * toRadius;

        // Draw arrowhead
        this.drawArrowhead(arrowTipX, arrowTipY, normalizedTangentDx, normalizedTangentDy, edgeColor, weight);

        // Only show probability and reward labels for Action → State edges
        if (from.type === 'action' && to.type === 'state') {
            // Position label on the curve (at t=0.5)
            const labelT = 0.5;
            const labelX = (1 - labelT) * (1 - labelT) * from.x + 2 * (1 - labelT) * labelT * controlX + labelT * labelT * to.x;
            const labelY = (1 - labelT) * (1 - labelT) * from.y + 2 * (1 - labelT) * labelT * controlY + labelT * labelT * to.y;

            noStroke();
            fill(0);
            textSize(10);
            textAlign(CENTER);
            text(`p=${edge.getProbability().toFixed(2)}`, labelX, labelY - 8);
            text(`r=${edge.getReward().toFixed(1)}`, labelX, labelY + 8);
        }
    }

    drawArrowhead(x, y, dirX, dirY, color, lineWeight) {
        // Arrow size proportional to line weight
        const arrowSize = 8 + lineWeight * 0.5;
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

    drawTextLabels() {
        const labels = this.viewModel.getTextLabels();

        labels.forEach(label => {
            const color = this.viewModel.getTextLabelColor(label);
            fill(color);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(label.fontSize);
            text(label.text, label.x, label.y);
        });
    }

    updateHeldNodePosition() {
        // Transform screen coordinates to world coordinates
        const worldCoords = this.viewModel.screenToWorld(mouseX, mouseY);
        this.viewModel.updateNodePlacement(worldCoords.x, worldCoords.y);
        redraw();
    }

    mousePressed() {
        // In p5.js, mouseX and mouseY are canvas-relative (0 to width, 0 to height)
        // Only handle clicks within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // Note: Sidebar buttons are positioned absolutely to the left of the canvas
        // and handle their own click events (returning false to prevent propagation).
        // No need to check for button area overlap here.

        // Transform screen coordinates to world coordinates
        const worldCoords = this.viewModel.screenToWorld(mouseX, mouseY);
        const result = this.viewModel.handleMousePress(worldCoords.x, worldCoords.y);

        // Handle camera centering and selection on double-click (simulate mode)
        if (result.mode === 'center_and_select' && result.node) {
            this.viewModel.centerOnNode(result.node, width, height);
            this.sideBar.updateStartNodeStatus();
            redraw();
            return;
        }

        // Start panning if clicked on empty canvas
        if (result.mode === 'deselect') {
            this.viewModel.startPan(mouseX, mouseY);
            cursor('grab');
            redraw();
            return;
        }

        // Store drag start positions for undo/redo
        if (result.mode === 'drag_start' && result.node) {
            this.viewModel.storeDragStartPosition(result.node);
        } else if (result.mode === 'drag_text' && result.label) {
            this.viewModel.storeTextLabelDragStartPosition(result.label);
        } else if (result.mode === 'resize_start' && result.node) {
            cursor('nwse-resize');
        }

        if (result.mode === 'prompt_edge') {
            this.promptForEdge(result.fromNode, result.toNode);
        }

        redraw();
    }

    mouseDragged() {
        // Only handle drags within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // Handle panning
        if (this.viewModel.isPanning) {
            this.viewModel.updatePan(mouseX, mouseY);
            cursor('grabbing');
            redraw();
            return;
        }

        // Transform screen coordinates to world coordinates
        const worldCoords = this.viewModel.screenToWorld(mouseX, mouseY);
        this.viewModel.handleMouseDrag(worldCoords.x, worldCoords.y);
        redraw();
    }

    mouseReleased() {
        // Only handle releases within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // End panning
        if (this.viewModel.isPanning) {
            this.viewModel.endPan();
            cursor(ARROW);
            redraw();
            return;
        }

        // Transform screen coordinates to world coordinates
        const worldCoords = this.viewModel.screenToWorld(mouseX, mouseY);
        const result = this.viewModel.handleMouseRelease(worldCoords.x, worldCoords.y);

        // Create move command for undo/redo if node was dragged
        if (result.mode === 'drag_end' && this.viewModel.heldNode) {
            const node = this.viewModel.heldNode;
            this.viewModel.createMoveCommand(node);
        } else if (result.mode === 'drag_text_end' && this.viewModel.heldTextLabel) {
            const label = this.viewModel.heldTextLabel;
            this.viewModel.createMoveTextLabelCommand(label);
        } else if (result.mode === 'resize_end') {
            cursor(ARROW);
        }

        if (result.mode === 'prompt_edge') {
            this.promptForEdge(result.fromNode, result.toNode);
        } else if (result.mode === 'invalid_edge') {
            alert(result.message);
        }

        // Update button states
        this.sideBar.updateUndoRedoButtons();

        redraw();
    }

    mouseMoved() {
        if (this.viewModel.placingMode) {
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

        const result = this.viewModel.createEdge(
            fromNode.id, toNode.id, prob, reward
        );

        if (!result.success) {
            alert(result.message);
        }

        redraw();
    }

    mouseWheel(event) {
        // Only handle scroll on canvas
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // Zoom towards mouse position
        const zoomFactor = -event.delta * 0.001;
        const newZoom = this.viewModel.zoom * (1 + zoomFactor);

        this.viewModel.setZoom(newZoom, mouseX, mouseY);
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
        // Undo with Ctrl+Z (or Cmd+Z on Mac)
        if ((keyCode === 90) && (keyIsDown(CONTROL) || keyIsDown(91))) { // Z key with Ctrl/Cmd
            if (keyIsDown(SHIFT)) {
                // Redo with Ctrl+Shift+Z
                if (this.viewModel.redo()) {
                    console.log('Redo');
                    this.sideBar.updateUndoRedoButtons();
                    redraw();
                }
            } else {
                // Undo with Ctrl+Z
                if (this.viewModel.undo()) {
                    console.log('Undo');
                    this.sideBar.updateUndoRedoButtons();
                    redraw();
                }
            }
            return false;
        }

        if (key === 's' || key === 'S') {
            const json = this.viewModel.serializeGraph();
            console.log('Graph serialization:');
            console.log(json);
        }

        // Handle Delete/Backspace key in editor mode
        if (this.viewModel.mode === 'editor' && (keyCode === DELETE || keyCode === BACKSPACE)) {
            const result = this.viewModel.deleteSelected();
            if (result.deleted !== 'none') {
                console.log('Deleted:', result.deleted);
                this.sideBar.updateUndoRedoButtons();
                redraw();
            }
        }

        // Reset zoom with 'R' key
        if (key === 'r' || key === 'R') {
            this.viewModel.resetZoom();
            redraw();
        }
    }

    keyReleased() {
        // Reserved for future key release handling
    }

    windowResized() {
        const sidebarWidth = this.sidebarCollapsed ?
            this.COLLAPSED_WIDTH : this.SIDEBAR_WIDTH;
        resizeCanvas(windowWidth - sidebarWidth, windowHeight);
        this.canvas.position(sidebarWidth, 0);
        // Update simulation control button positions (top right)
        this.sideBar.updateSimulationButtonPositions();
        redraw();
    }

    toggleSidebar() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        this.sideBar.setCollapsed(this.sidebarCollapsed);
        this.windowResized();
    }
}
