class MainView {
    constructor(canvasViewModel, canvasController, menuBar, toolBar, rightPanel) {
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

        // Reward particle system
        this.rewardParticleSystem = new RewardParticleSystem();

        // Value Iteration view (set after construction)
        this.valueIterationView = null;
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
        background(240);

        // Value Iteration mode: delegate to VI view
        if (this.viewModel.interaction.mode === 'value_iteration' && this.valueIterationView) {
            push();
            translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
            scale(this.viewModel.viewport.zoom);
            this.valueIterationView.draw();
            pop();
            this.drawZoomIndicator();
            return;
        }

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
            this.drawSpinningArrow();
        }

        // Draw travel ball during edge_highlight phase
        this.drawHighlightedEdgeTravelBall();

        pop();

        // Continuous redraw during animated simulation phases
        const _simS = this.viewModel.simulationState;
        if (_simS && _simS.replayInitialized && !_simS.isPhaseComplete() &&
            (_simS.phase === 'reveal' || _simS.phase === 'highlight')) {
            requestAnimationFrame(() => { if (typeof redraw === 'function') redraw(); });
        }

        // Update hover animation
        const interaction = this.viewModel.interaction;
        if (interaction.hoverAnimating) {
            const elapsed = Date.now() - interaction.hoverStartTime;
            const duration = 300; // 300ms
            const t = Math.min(elapsed / duration, 1.0);
            const eased = t * (2 - t); // ease-out quadratic

            if (interaction.hoverDirection === 1) {
                interaction.hoverProgress = eased;
            } else {
                interaction.hoverProgress = 1.0 - eased;
            }

            if (t >= 1.0) {
                interaction.hoverAnimating = false;
                if (interaction.hoverDirection === -1) {
                    interaction.hoveredEdge = null;
                    interaction.hoverProgress = 0;
                }
            }

            if (interaction.hoverAnimating) {
                setTimeout(() => redraw(), 16); // ~60fps continuous redraw
            }
        }

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

    launchRewardParticles(reward, actionNodeId) {
        if (reward === 0) {
            this.viewModel.simulationState.commitReward();
            if (this.rightPanel) this.rightPanel.updateContent();
            return;
        }
        const node = this.viewModel.graph.getNodeById(actionNodeId);
        if (!node) {
            this.viewModel.simulationState.commitReward();
            if (this.rightPanel) this.rightPanel.updateContent();
            return;
        }
        const screenPos = this.viewModel.viewport.worldToScreen(node.x, node.y);
        const pageX = screenPos.x;
        const pageY = screenPos.y + this.TOP_BARS_HEIGHT;
        const targetEl = document.querySelector('.reward-bar-container');
        if (!targetEl) {
            this.viewModel.simulationState.commitReward();
            if (this.rightPanel) this.rightPanel.updateContent();
            return;
        }
        this.rewardParticleSystem.launch(reward, pageX, pageY, targetEl, () => {
            this.viewModel.simulationState.commitReward();
            if (this.rightPanel) this.rightPanel.updateContent();
        });
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

            // Reveal phase: scale-in newly revealed nodes
            let revealScale = 1;
            const simRevealNode = this.viewModel.simulationState;
            if (simRevealNode && simRevealNode.replayInitialized && simRevealNode.phase === 'reveal') {
                const cur = simRevealNode.currentNode;
                if (cur && node.id !== cur.id) {
                    const srcNode = this.viewModel.graph.getNodeById(cur.id);
                    let idx = -1;
                    if (cur.type === 'state' && node.type === 'action') {
                        idx = srcNode && srcNode.actions ? srcNode.actions.indexOf(node.id) : -1;
                    } else if (cur.type === 'action' && node.type === 'state') {
                        idx = srcNode && srcNode.sas ? srcNode.sas.findIndex(t => t.nextState === node.id) : -1;
                    }
                    if (idx >= 0) {
                        const staggerMs = idx * 60;
                        const elapsed = Date.now() - simRevealNode.phaseStartTime;
                        const tRaw = Math.max(0, Math.min(1, (elapsed - staggerMs) / 200));
                        revealScale = VI_EASINGS.easeOutBack(tRaw);
                        if (revealScale <= 0) return;
                    }
                }
            }

            const nodeVM = this.viewModel.createNodeViewModel(node);
            const color = nodeVM.color;

            // Get spinning arrow alpha for this node
            const nodeAlpha = this.getNodeSpinningArrowAlpha(node);
            const isNodeFaded = nodeAlpha < 255;

            const scaleActive = revealScale !== 1;
            if (scaleActive) { push(); translate(node.x, node.y); scale(revealScale); translate(-node.x, -node.y); }

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

            if (scaleActive) { pop(); }
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

            // Reveal phase: animate edges drawing themselves outward from the source node
            const simReveal = this.viewModel.simulationState;
            if (simReveal && simReveal.replayInitialized && simReveal.phase === 'reveal' && !isBidirectional) {
                const cur = simReveal.currentNode;
                if (cur) {
                    const isRevealEdge =
                        (cur.type === 'state' && from.id === cur.id && to.type === 'action') ||
                        (cur.type === 'action' && from.id === cur.id && to.type === 'state');
                    if (isRevealEdge) {
                        const srcNode = this.viewModel.graph.getNodeById(cur.id);
                        const idx = cur.type === 'state'
                            ? (srcNode && srcNode.actions ? srcNode.actions.indexOf(to.id) : 0)
                            : (srcNode && srcNode.sas ? srcNode.sas.findIndex(t => t.nextState === to.id) : 0);
                        const staggerMs = Math.max(0, idx) * 60;
                        const elapsed = Date.now() - simReveal.phaseStartTime;
                        const tRaw = Math.max(0, Math.min(1, (elapsed - staggerMs) / 250));
                        const lineP = VI_EASINGS.easeOut(tRaw);
                        const headP = Math.max(0, Math.min(1, (lineP - 0.7) / 0.3));
                        this._drawPartialStraightEdge(from, to, weight, edgeColor, lineP, headP);
                        return;
                    }
                }
            }

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

        // Perpendicular vector
        const perpX = -normalizedDy;
        const perpY = normalizedDx;

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

        // Check if this edge is hovered (action→state only, not during spinning arrow)
        const spinningArrow = this.viewModel.simulationState &&
            this.viewModel.simulationState.phase === 'spinning_arrow';
        const hoverInteraction = this.viewModel.interaction;
        const isHovered = !spinningArrow && (hoverInteraction.hoveredEdge === edge);
        const progress = isHovered ? hoverInteraction.hoverProgress : 0;

        // Calculate midpoint
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        // Draw the edge line
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
            if (progress > 0) {
                const labelColor = renderInfo.colorOverride || edge.getLabelColor();
                const probAlpha = Math.floor(progress * 255);

                // Probability text offset to opposite side from squiggly
                noStroke();
                fill(this.applyAlphaToColor(labelColor, Math.min(renderInfo.alpha, probAlpha)));
                textSize(edge.labelSize);
                textAlign(CENTER, CENTER);
                const probOffsetDist = 22;
                const probX = midX - perpX * probOffsetDist + edge.labelOffset.x;
                const probY = midY - perpY * probOffsetDist + edge.labelOffset.y;
                text(`P: ${edge.getProbability().toFixed(2)}`, probX, probY);

                // Squiggly reward line
                this.drawSquigglyRewardLine(midX, midY, perpX, perpY, normalizedDx, normalizedDy, progress, edge.getReward(), labelColor, weight);
            }
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

        // Check if this edge is hovered (action→state only, not during spinning arrow)
        const spinningArrow = this.viewModel.simulationState &&
            this.viewModel.simulationState.phase === 'spinning_arrow';
        const hoverInteraction = this.viewModel.interaction;
        const isHovered = !spinningArrow && (hoverInteraction.hoveredEdge === edge);
        const progress = isHovered ? hoverInteraction.hoverProgress : 0;

        // Calculate midpoint on curve (t=0.5)
        const tMid = 0.5;
        const curveMidX = (1 - tMid) * (1 - tMid) * from.x + 2 * (1 - tMid) * tMid * controlX + tMid * tMid * to.x;
        const curveMidY = (1 - tMid) * (1 - tMid) * from.y + 2 * (1 - tMid) * tMid * controlY + tMid * tMid * to.y;

        // Calculate tangent at midpoint for flap/squiggly direction
        const midTangentDx = 2 * (1 - tMid) * (controlX - from.x) + 2 * tMid * (to.x - controlX);
        const midTangentDy = 2 * (1 - tMid) * (controlY - from.y) + 2 * tMid * (to.y - controlY);
        const midTangentDist = Math.sqrt(midTangentDx * midTangentDx + midTangentDy * midTangentDy);
        const midDirX = midTangentDx / midTangentDist;
        const midDirY = midTangentDy / midTangentDist;
        const midPerpX = -midDirY;
        const midPerpY = midDirX;

        // Draw the curved line from tStart (edge of from node) to tLineEnd (arrowhead base)
        strokeWeight(weight);
        stroke(alphaEdgeColor);
        noFill();

        if (renderInfo.dashed) {
            drawingContext.setLineDash([8, 4]);
        }

        // Sample points along the curve from tStart to tLineEnd
        beginShape();
        const startX = (1 - tStart) * (1 - tStart) * from.x + 2 * (1 - tStart) * tStart * controlX + tStart * tStart * to.x;
        const startY = (1 - tStart) * (1 - tStart) * from.y + 2 * (1 - tStart) * tStart * controlY + tStart * tStart * to.y;
        vertex(startX, startY);

        const step = 0.02;
        for (let t = tStart + step; t < tLineEnd; t += step) {
            const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * controlX + t * t * to.x;
            const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * controlY + t * t * to.y;
            vertex(x, y);
        }

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
            if (progress > 0) {
                const labelColor = renderInfo.colorOverride || edge.getLabelColor();
                const probAlpha = Math.floor(progress * 255);

                // Probability text offset to opposite side from squiggly
                noStroke();
                fill(this.applyAlphaToColor(labelColor, Math.min(renderInfo.alpha, probAlpha)));
                textSize(edge.labelSize);
                textAlign(CENTER, CENTER);
                const probOffsetDist = 22;
                const probX = curveMidX - midPerpX * probOffsetDist + edge.labelOffset.x;
                const probY = curveMidY - midPerpY * probOffsetDist + edge.labelOffset.y;
                text(`P: ${edge.getProbability().toFixed(2)}`, probX, probY);

                // Squiggly reward line
                this.drawSquigglyRewardLine(curveMidX, curveMidY, midPerpX, midPerpY, midDirX, midDirY, progress, edge.getReward(), labelColor, weight);
            }
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

    _drawPartialStraightEdge(from, to, weight, color, lineP, headP) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const nx = dx / dist, ny = dy / dist;

        const arrowSize = 8 + weight * 1.5;
        const startX = from.x + nx * from.size;
        const startY = from.y + ny * from.size;
        const fullEndX = to.x - nx * to.size;
        const fullEndY = to.y - ny * to.size;

        const curEndX = lerp(startX, fullEndX, lineP);
        const curEndY = lerp(startY, fullEndY, lineP);

        const lineStopX = curEndX - nx * arrowSize * headP;
        const lineStopY = curEndY - ny * arrowSize * headP;

        stroke(color);
        strokeWeight(weight);
        noFill();
        line(startX, startY, lineStopX, lineStopY);

        if (headP > 0) {
            const alphaHead = this.applyAlphaToColor(color, Math.round(headP * 255));
            this.drawArrowhead(curEndX, curEndY, nx, ny, alphaHead, weight);
        }
    }

    drawSquigglyRewardLine(midX, midY, perpX, perpY, dirX, dirY, progress, reward, rewardColor, weight) {
        const maxLength = 80;
        const length = progress * maxLength;
        if (length < 1) return;

        const amplitude = 5;
        const waves = 5;
        const samples = 60;
        const arrowSize = 7;

        // Direction: extend along perpendicular (left side of edge direction)
        const extDirX = perpX;
        const extDirY = perpY;

        // Stop squiggly before arrowhead
        const squigglyLength = Math.max(0, length - arrowSize);

        strokeWeight(Math.max(1, weight * 0.6));
        const alphaColor = this.applyAlphaToColor(rewardColor, Math.floor(progress * 255));
        stroke(alphaColor);
        noFill();

        let lastPx, lastPy;
        beginShape();
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const dist = t * squigglyLength;
            // Position along perpendicular
            const baseX = midX + extDirX * dist;
            const baseY = midY + extDirY * dist;
            // Sinusoidal offset along edge direction
            const wave = Math.sin(t * waves * 2 * Math.PI) * amplitude * progress;
            const px = baseX + dirX * wave;
            const py = baseY + dirY * wave;
            // Catmull-Rom splines need duplicate first/last control points
            if (i === 0) curveVertex(px, py);
            curveVertex(px, py);
            if (i === samples) curveVertex(px, py);
            lastPx = px;
            lastPy = py;
        }
        endShape();

        // Straight connector from last wave point to arrowhead base
        const tipX = midX + extDirX * length;
        const tipY = midY + extDirY * length;
        const arrowBaseX = tipX - extDirX * arrowSize;
        const arrowBaseY = tipY - extDirY * arrowSize;
        line(lastPx, lastPy, arrowBaseX, arrowBaseY);
        const arrowAngle = Math.PI / 6;

        const cos1 = Math.cos(Math.PI - arrowAngle);
        const sin1 = Math.sin(Math.PI - arrowAngle);
        const cos2 = Math.cos(Math.PI + arrowAngle);
        const sin2 = Math.sin(Math.PI + arrowAngle);

        const ax1 = tipX + (extDirX * cos1 - extDirY * sin1) * arrowSize;
        const ay1 = tipY + (extDirX * sin1 + extDirY * cos1) * arrowSize;
        const ax2 = tipX + (extDirX * cos2 - extDirY * sin2) * arrowSize;
        const ay2 = tipY + (extDirX * sin2 + extDirY * cos2) * arrowSize;

        fill(alphaColor);
        noStroke();
        triangle(tipX, tipY, ax1, ay1, ax2, ay2);

        // Reward text past arrowhead
        const textX = tipX + extDirX * 16;
        const textY = tipY + extDirY * 16;
        textSize(13);
        textAlign(CENTER, CENTER);
        text(`R: ${reward.toFixed(1)}`, textX, textY);
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
        const fadedInfo = { dashed: false, alpha: 40, colorOverride: null };

        if (this.viewModel.interaction.mode !== 'simulate') return defaultInfo;
        if (!this.viewModel.simulationState) return defaultInfo;

        const simState = this.viewModel.simulationState;
        const currentNode = simState.currentNode;
        if (!currentNode) return defaultInfo;

        // === SPINNING ARROW phase: action node selecting next state ===
        if (simState.phase === 'spinning_arrow' && currentNode.type === 'action') {
            // Edges FROM the current action node to state nodes → highlighted/faded logic
            if (from.id === currentNode.id && from.type === 'action' && to.type === 'state') {
                const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
                const actionNode = this.viewModel.graph.getNodeById(currentNode.id);
                if (!actionNode || !actionNode.sas) return { dashed: true, alpha: 80, colorOverride: null };

                const highlightedTransition = actionNode.sas[highlightedEdgeIndex];
                if (highlightedTransition && to.id === highlightedTransition.nextState) {
                    return { dashed: false, alpha: 255, colorOverride: null };
                }
                return { dashed: true, alpha: 80, colorOverride: null };
            }

            // Edge incoming to the current action node → keep visible
            if (to.id === currentNode.id) return defaultInfo;

            // All other edges → very faded
            return fadedInfo;
        }

        // === REVEAL phase: state node selecting action ===
        if (simState.phase === 'reveal' && currentNode.type === 'state') {
            const stateNode = this.viewModel.graph.getNodeById(currentNode.id);
            if (!stateNode || !stateNode.actions) return fadedInfo;

            // Edges FROM the current state to its action nodes → full opacity
            if (from.id === currentNode.id && from.type === 'state' && to.type === 'action') {
                if (stateNode.actions.includes(to.id)) return defaultInfo;
            }

            // All other edges → very faded
            return fadedInfo;
        }

        return defaultInfo;
    }

    // Get alpha for a node during decision phases (spinning arrow or reveal)
    getNodeSpinningArrowAlpha(node) {
        if (this.viewModel.interaction.mode !== 'simulate') return 255;
        if (!this.viewModel.simulationState) return 255;

        const simState = this.viewModel.simulationState;
        const currentNode = simState.currentNode;
        if (!currentNode) return 255;

        // === SPINNING ARROW phase: action node selecting next state ===
        if (simState.phase === 'spinning_arrow' && currentNode.type === 'action') {
            // The action node itself stays fully visible
            if (node.id === currentNode.id) return 255;

            // The parent state node (that led to this action) stays visible
            if (simState.currentIndex > 0) {
                const prevEntry = simState.visited[simState.currentIndex - 1];
                if (prevEntry && node.id === prevEntry.id && node.type === 'state') return 255;
            }

            const actionNode = this.viewModel.graph.getNodeById(currentNode.id);
            if (!actionNode || !actionNode.sas) return 40;

            // Check if this node is a destination of the current action node
            const isDestination = actionNode.sas.some(t => t.nextState === node.id);
            if (!isDestination) return 40;

            // Check if this node is the highlighted destination
            const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
            const highlightedTransition = actionNode.sas[highlightedEdgeIndex];
            if (highlightedTransition && node.id === highlightedTransition.nextState) {
                return 255;
            }
            return 80;
        }

        // === REVEAL phase: state node selecting action ===
        if (simState.phase === 'reveal' && currentNode.type === 'state') {
            // The state node itself stays fully visible
            if (node.id === currentNode.id) return 255;

            const stateNode = this.viewModel.graph.getNodeById(currentNode.id);
            if (!stateNode || !stateNode.actions) return 40;

            // Action nodes connected to the current state → full opacity
            if (stateNode.actions.includes(node.id)) return 255;

            // Everything else → very faded
            return 40;
        }

        return 255;
    }

    drawHighlightedEdgeTravelBall() {
        const simState = this.viewModel.simulationState;
        if (!simState || simState.phase !== 'highlight') return;
        if (!simState.highlightedEdge) return;

        const { fromId, toId } = simState.highlightedEdge;
        const from = this.viewModel.graph.getNodeById(fromId);
        const to = this.viewModel.graph.getNodeById(toId);
        if (!from || !to) return;

        const elapsed = Date.now() - simState.phaseStartTime;
        const t = VI_EASINGS.easeInOut(Math.min(1, elapsed / simState.phaseDuration));

        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;
        const nx = dx / dist, ny = dy / dist;

        // Check if bidirectional (curved edge)
        const hasReverse = this.viewModel.graph.edges.some(e =>
            e.getFromNode().id === toId && e.getToNode().id === fromId
        );

        let ballX, ballY;
        if (hasReverse) {
            // Quadratic Bezier path (same control point as drawCurvedEdge)
            const perpX = -dy / dist;
            const perpY = dx / dist;
            const curveOffset = dist * 0.15;
            const cx = (from.x + to.x) / 2 + perpX * curveOffset;
            const cy = (from.y + to.y) / 2 + perpY * curveOffset;

            // Find tStart (curve exits from-node circumference)
            let tStartMin = 0.0, tStartMax = 0.5;
            for (let i = 0; i < 10; i++) {
                const tm = (tStartMin + tStartMax) / 2;
                const bx = (1-tm)*(1-tm)*from.x + 2*(1-tm)*tm*cx + tm*tm*to.x;
                const by = (1-tm)*(1-tm)*from.y + 2*(1-tm)*tm*cy + tm*tm*to.y;
                const d = Math.sqrt((bx-from.x)**2 + (by-from.y)**2);
                if (d < from.size) tStartMin = tm; else tStartMax = tm;
            }
            const tStart = (tStartMin + tStartMax) / 2;

            // Find tEnd (curve enters to-node circumference)
            let tEndMin = 0.5, tEndMax = 1.0;
            for (let i = 0; i < 10; i++) {
                const tm = (tEndMin + tEndMax) / 2;
                const bx = (1-tm)*(1-tm)*from.x + 2*(1-tm)*tm*cx + tm*tm*to.x;
                const by = (1-tm)*(1-tm)*from.y + 2*(1-tm)*tm*cy + tm*tm*to.y;
                const d = Math.sqrt((bx-to.x)**2 + (by-to.y)**2);
                if (d > to.size) tEndMin = tm; else tEndMax = tm;
            }
            const tEnd = (tEndMin + tEndMax) / 2;

            const tb = lerp(tStart, tEnd, t);
            ballX = (1-tb)*(1-tb)*from.x + 2*(1-tb)*tb*cx + tb*tb*to.x;
            ballY = (1-tb)*(1-tb)*from.y + 2*(1-tb)*tb*cy + tb*tb*to.y;
        } else {
            // Straight edge
            const startX = from.x + nx * from.size;
            const startY = from.y + ny * from.size;
            const endX = to.x - nx * to.size;
            const endY = to.y - ny * to.size;
            ballX = lerp(startX, endX, t);
            ballY = lerp(startY, endY, t);
        }

        const r = 7;
        noStroke();
        fill(255, 215, 0, 230);
        circle(ballX, ballY, r * 2);

        noFill();
        stroke(255, 215, 0, Math.round(120 * (1 - t)));
        strokeWeight(2);
        circle(ballX, ballY, r * 3);

        drawingContext.setLineDash([]);
    }

    // Draw spinning arrow animation at action node during selection phase
    drawSpinningArrow() {
        const simState = this.viewModel.simulationState;

        // Only draw if in spinning arrow phase
        if (!simState || simState.phase !== 'spinning_arrow') return;

        const currentNode = simState.currentNode;
        if (!currentNode || currentNode.type !== 'action') return;

        // Get the actual action node from the graph
        const actionNode = this.viewModel.graph.getNodeById(currentNode.id);
        if (!actionNode || !actionNode.sas || actionNode.sas.length === 0) return;

        // Get which edge the arrow is currently pointing at (discrete tick)
        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        // Compute arrow direction from action node toward the highlighted target state
        let arrowAngle = 0;
        const highlightedTransition = actionNode.sas[highlightedEdgeIndex];
        if (highlightedTransition) {
            const targetNode = this.viewModel.graph.getNodeById(highlightedTransition.nextState);
            if (targetNode) {
                // atan2 gives angle where right=0; triangle points "up" (negative Y), so add PI/2
                arrowAngle = atan2(targetNode.y - actionNode.y, targetNode.x - actionNode.x) + PI / 2;
            }
        }

        // Draw the arrow at the center of the action node
        push();
        translate(actionNode.x, actionNode.y);
        rotate(arrowAngle);

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

            const midX = (actionNode.x + targetNode.x) / 2;
            const midY = (actionNode.y + targetNode.y) / 2;

            const isHighlighted = (index === highlightedEdgeIndex);
            const probText = `p=${transition.probability.toFixed(2)}`;

            push();
            noStroke();

            if (isHighlighted) {
                fill(255, 235, 59, 220);  // Bright yellow
                rect(midX - 30, midY - 12, 60, 24, 4);
                fill(0);
                textSize(14);
                textStyle(BOLD);
            } else {
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
            requestAnimationFrame(() => redraw());
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
        this.controller.handleMouseMove(mouseX, mouseY);
        if (this.viewModel.interaction.placingMode ||
            this.viewModel.interaction.hoverAnimating ||
            this.viewModel.interaction.hoveredEdge) {
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

            prob = parseFloat(probStr);
            if (isNaN(prob) || prob < 0 || prob > 1) {
                alert('Invalid probability. Must be a number between 0 and 1.');
                return;
            }

            const rewardStr = prompt('Enter reward:', '0');
            if (rewardStr === null) return;

            reward = parseFloat(rewardStr);
            if (isNaN(reward)) {
                alert('Invalid reward. Must be a number.');
                return;
            }
        }

        this.controller.createEdge(fromNode.id, toNode.id, prob, reward);
        this.controller.clearSelection();

        redraw();
    }

    promptForTextLabel() {
        const text = prompt('Enter text label:');
        if (text && text.trim()) {
            this.controller.createTextLabel(text.trim());
        }
        this.viewModel.interaction.textLabelRequested = false;
        redraw();
    }

    promptForRename(node) {
        const newName = prompt(`Rename "${node.name}":`, node.name);
        if (newName && newName.trim() && newName !== node.name) {
            this.controller.renameNode(node.id, node.name, newName.trim());
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

                this.viewModel.viewport.setZoom(this.viewModel.viewport.zoom * zoomChange, centerX, centerY);
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
