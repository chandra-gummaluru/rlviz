class MainView {
    constructor(canvasViewModel, canvasController, sideBar, menuBar, toolBar, rightPanel) {
        this.viewModel = canvasViewModel;
        this.controller = canvasController;
        this.sideBar = sideBar;
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

            fill(color);
            stroke(0);
            strokeWeight(2);
            circle(node.x, node.y, node.size * 2);

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
                fill(255);
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
                weight = 1 + 8 * edge.getProbability(); // Probability-based for Action → State
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
            const midX = (from.x + to.x) / 2 + edge.labelOffset.x;
            const midY = (from.y + to.y) / 2 + edge.labelOffset.y;

            const prob = edge.getProbability().toFixed(2);
            const reward = edge.getReward().toFixed(1);
            const labelText = `(${prob}, ${reward})`;

            noStroke();
            fill(edge.getLabelColor());
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
        const arrowSize = 8 + weight * 0.5;

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

        // Draw the curved line from tStart (edge of from node) to tLineEnd (arrowhead base)
        strokeWeight(weight);
        stroke(edgeColor);
        noFill();

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

        // Draw arrowhead at the intersection point
        this.drawArrowhead(arrowX, arrowY, normalizedTangentDx, normalizedTangentDy, edgeColor, weight);

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
            fill(edge.getLabelColor());
            textSize(edge.labelSize);
            textAlign(CENTER, CENTER);
            text(labelText, labelX, labelY);
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
            this.sideBar.updateStartNodeStatus();
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

        // Update button states
        this.sideBar.updateUndoRedoButtons();

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

        // Update button states if undo/redo happened
        this.sideBar.updateUndoRedoButtons();
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
