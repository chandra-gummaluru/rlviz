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
                        revealScale = EasingUtils.easeOutBack(tRaw);
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
                        const lineP = EasingUtils.easeOut(tRaw);
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
    }

    drawCurvedEdge(from, to, weight, edgeColor, edge) {
        const geom = GeometricHelper.buildCurvedEdgeGeometry(from, to, weight);
        if (!geom) return;

        const renderInfo = this.getSpinningArrowRenderInfo(from, to);
        const baseColor = renderInfo.colorOverride || edgeColor;
        const alphaEdgeColor = this.applyAlphaToColor(baseColor, renderInfo.alpha);

        strokeWeight(weight);
        stroke(alphaEdgeColor);
        noFill();

        if (renderInfo.dashed) {
            drawingContext.setLineDash([8, 4]);
        }

        // Visible quadratic Bezier: startPoint → arrowBaseCenter, shaped to match guide curve
        beginShape();
        vertex(geom.startPoint.x, geom.startPoint.y);
        quadraticVertex(geom.visibleControl.x, geom.visibleControl.y, geom.arrowBaseCenter.x, geom.arrowBaseCenter.y);
        endShape();

        if (renderInfo.dashed) {
            drawingContext.setLineDash([]);
        }

        this.drawArrowhead(geom.arrowTip.x, geom.arrowTip.y, geom.arrowDir.x, geom.arrowDir.y, alphaEdgeColor, weight);
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

    // Apply alpha to a color (supports p5 color objects, rgb(), hex strings)
    applyAlphaToColor(c, alpha) {
        return ColorUtils.applyAlpha(c, alpha);
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
        const t = EasingUtils.easeInOut(Math.min(1, elapsed / simState.phaseDuration));

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
            // Use the same visible curve geometry as drawCurvedEdge
            const edgeObj = this.viewModel.graph.edges.find(e =>
                e.getFromNode().id === fromId && e.getToNode().id === toId
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

    // Draw a shaft+head arrow polygon in local (already-translated/rotated) coordinates.
    // tipY = -length (up), head spans [-shaftLength..-length], shaft spans [tailY..-shaftLength].
    _drawArrowPolygon(length, shaftLength, shaftWidth, headWidth, opts = {}) {
        const { fillColor, strokeColor, strokeWt, scaleFactor, tailY = 0 } = opts;
        const tipY    = -length;
        const headY   = -shaftLength; // where shaft meets head
        const halfS   = shaftWidth / 2;
        const halfH   = headWidth  / 2;

        push();
        if (scaleFactor && scaleFactor !== 1) scale(scaleFactor);
        if (fillColor)   fill(fillColor);   else noFill();
        if (strokeColor) { stroke(strokeColor); strokeWeight(strokeWt || 1.5); } else noStroke();

        beginShape();
        vertex(0,      tipY);   // tip
        vertex( halfH, headY);  // right head corner
        vertex( halfS, headY);  // right shaft top
        vertex( halfS, tailY);  // right shaft bottom
        vertex(-halfS, tailY);  // left shaft bottom
        vertex(-halfS, headY);  // left shaft top
        vertex(-halfH, headY);  // left head corner
        endShape(CLOSE);
        pop();
    }

    // Full spinning-arrow glyph scaled to nodeSize so tip lands at the node circumference.
    // Call inside push/translate/rotate … pop with origin at the node center.
    drawSpinningArrowGlyph(nodeSize) {
        const s          = nodeSize / 32;
        const length     = nodeSize;
        const shaftLen   = Math.max(4, Math.round(18 * s));
        const shaftWidth = Math.max(3, Math.round(5  * s));
        const headWidth  = Math.max(9, Math.round(17 * s));

        this._drawArrowPolygon(length, shaftLen, shaftWidth, headWidth, {
            fillColor: color(0, 0, 0, 120),
            strokeColor: null,
            scaleFactor: 1.12,
            tailY: 0
        });

        this._drawArrowPolygon(length, shaftLen, shaftWidth, headWidth, {
            fillColor: color(255, 87, 34),
            strokeColor: color(20, 20, 20, 220),
            strokeWt: 1.5,
            scaleFactor: 1,
            tailY: 0
        });

        fill(255, 255, 255, 230);
        stroke(20, 20, 20, 180);
        strokeWeight(1);
        circle(0, 0, 6);
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
        this.drawSpinningArrowGlyph(actionNode.size);
        pop();

        // Draw probability labels on each outgoing edge
        actionNode.sas.forEach((transition, index) => {
            const targetNode = this.viewModel.graph.getNodeById(transition.nextState);
            if (!targetNode) return;

            const midX = (actionNode.x + targetNode.x) / 2;
            const midY = (actionNode.y + targetNode.y) / 2;

            const isHighlighted = (index === highlightedEdgeIndex);
            const probLatex = `p = ${transition.probability.toFixed(2)}`;

            push();
            noStroke();
            if (isHighlighted) {
                fill(255, 235, 59, 220);
                rect(midX - 30, midY - 12, 60, 24, 4);
            } else {
                fill(255, 255, 255, 60);
                rect(midX - 30, midY - 12, 60, 24, 4);
            }
            pop();

            mathRenderer.draw(drawingContext, probLatex, midX, midY, {
                color: isHighlighted ? '#000000' : '#505050',
                em: isHighlighted ? 14 : 12,
                alpha: isHighlighted ? 255 : 80
            });
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
        const hoverChanged = this.controller.handleMouseMove(mouseX, mouseY);
        if (hoverChanged && this.rightPanel) {
            this.rightPanel.updateContent();
        }
        if (hoverChanged || this.viewModel.interaction.placingMode) {
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
