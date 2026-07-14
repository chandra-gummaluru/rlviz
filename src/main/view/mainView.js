// --- File-local rendering constants ---
const MV_MSG_TIMEOUT_MS      = 3000;
const MV_MSG_X               = 10;
const MV_MSG_Y_OFFSET        = 50;
const MV_MSG_WIDTH           = 400;
const MV_MSG_HEIGHT          = 40;
const MV_MSG_RADIUS          = 5;
const MV_MSG_TEXT_SIZE       = 14;

const MV_REVEAL_NODE_STAGGER = 60;   // ms stagger per node index during reveal
const MV_REVEAL_NODE_DUR     = 200;  // ms total node scale-in duration
const MV_REVEAL_EDGE_STAGGER = 60;   // ms stagger per edge index
const MV_REVEAL_EDGE_DUR     = 250;  // ms total edge draw duration
const MV_REVEAL_HEAD_THRESH  = 0.7;  // lineP at which arrowhead starts appearing

const MV_DASH_LINE           = 8;
const MV_DASH_GAP            = 4;
const MV_DASH_NODE_LINE      = 6;    // shorter dash for faded node outlines
const MV_DASH_NODE_GAP       = 3;

const MV_ARROW_BASE          = 8;    // px base size of arrowhead
const MV_ARROW_WEIGHT_MULT   = 1.5;  // arrowhead size scales with line weight
const MV_ARROW_ANGLE         = Math.PI / 6;  // 30 degrees

const MV_EDITOR_FOCUS_ALPHA_FULL  = 255;
const MV_EDITOR_FOCUS_ALPHA_FADED = 45;

// Reserved space at the top of Values mode's canvas so the VI graph doesn't render behind the
// floating estimator pill overlapping the top of the canvas (matches expectationView.js's
// EXPECTATION_TOP_CLEARANCE, used for the same reason on the Monte Carlo pane).
const MV_VALUES_PILL_CLEARANCE = 90;

// --- End constants ---

class MainView {
    constructor(canvasViewModel, canvasController, topBar, rightPanel) {
        this.viewModel = canvasViewModel;
        this.controller = canvasController;
        this.topBar = topBar;
        this.rightPanel = rightPanel;

        this.simRenderer = new SimulationRenderer(canvasViewModel);

        // Kept as TOP_BARS_HEIGHT (not renamed to a singular TOP_BAR_HEIGHT) - many downstream
        // call sites (canvas sizing, right-panel/chart-dock/floating-pill offsets) consume this
        // purely as "how much vertical space the top chrome occupies," independent of how many
        // bars compose it.
        this.TOP_BARS_HEIGHT = topBar ? topBar.getHeight() : 0;
        this.RIGHT_PANEL_WIDTH = rightPanel ? rightPanel.getWidth() : 0;

        this.canvas = null;

        // Track previous selection to detect changes
        this.previousSelectedNode = null;
        this.previousSimulationIndex = -1; // Track simulation position for right panel updates
        this.previousNodesCount = 0;
        this.previousEdgesCount = 0;

        // Touch handling for pinch zoom
        this.touches = [];
        this.lastPinchDistance = 0;

        // Reward particle system
        this.rewardParticleSystem = new RewardParticleSystem();

        // Value Iteration view (set after construction)
        this.valueIterationView = null;

        // Learning Iteration view (unknown:full quadrant real Q-learning; set after construction)
        this.learningIterationView = null;
        this.learningTreePill = null;

        // Bottom chart dock (Values mode; instantiated in a later phase)
        this.chartDock = null;

        // Floating Build-mode tool palette (set after construction)
        this.toolPalette = null;

        // Floating zoom pill (set after construction)
        this.zoomPill = null;

        // Floating Values-mode estimator pill (set after construction)
        this.estimatorPill = null;

        // Floating Values-mode pills set after construction
        this.mcRunsPill = null;
        this.viSweepChip = null;

        // Cached dot-grid background layer; rebuilt on resize/theme change, not every redraw()
        this._dotGridLayer = null;
        this._dotGridTheme = null;
    }

    // Policy's canvas is identical to Build's (fully editable - only the right panel differs),
    // so every Build-only rendering/interaction branch here treats both modes the same.
    _isEditableMode() {
        return this.viewModel.mode === 'build' || this.viewModel.mode === 'policy';
    }

    setup() {
        const canvasWidth = windowWidth - this.RIGHT_PANEL_WIDTH;
        const canvasHeight = windowHeight - this.TOP_BARS_HEIGHT;

        this.canvas = createCanvas(canvasWidth, canvasHeight);
        this.canvas.position(0, this.TOP_BARS_HEIGHT);

        // Suppress browser context menu so right-click can be used for canvas interactions
        this.canvas.elt.addEventListener('contextmenu', e => e.preventDefault());

        // Set global text font
        textFont(Typography.sans());

        this.invalidateDotGrid();

        noLoop();
        redraw();
    }

    // Rebuilt lazily on next draw() when canvas size or theme has changed.
    invalidateDotGrid() {
        this._dotGridLayer = null;
    }

    // Height the chart dock currently reserves at the bottom of the values-mode canvas area
    // (0 while closed or before it's mounted).
    getDockHeight() {
        return this.chartDock ? this.chartDock.getReservedHeight() : 0;
    }

    // Called by ChartDock when the user drags/collapses it, so the values-mode layout
    // (pane sizes, scrubber position) re-accounts for the new reserved height.
    onDockResize() {
        if (this.viewModel.interaction.mode !== 'values') return;
        const canvasWidth = windowWidth - this.RIGHT_PANEL_WIDTH;
        const canvasHeight = windowHeight - this.TOP_BARS_HEIGHT;
        const paneWidths = this._valuesPaneWidths(canvasWidth);
        const valuesHeight = canvasHeight - this.getDockHeight();
        this._relayoutValueIterationIfActive(paneWidths.vi, valuesHeight);
        if (this.expectationView && this.viewModel.valuesSubView === 'mc') {
            this.expectationView.resize(paneWidths.mc, valuesHeight, this.TOP_BARS_HEIGHT);
        }
        redraw();
    }

    _buildDotGridLayer(w, h) {
        const spacing = 22;
        const g = createGraphics(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
        g.clear();
        g.noStroke();
        g.fill(AppPalette.border.gridDot);
        for (let x = spacing / 2; x < w; x += spacing) {
            for (let y = spacing / 2; y < h; y += spacing) {
                g.circle(x, y, 1.4);
            }
        }
        return g;
    }

    _ensureDotGridLayer() {
        const theme = AppPalette.getTheme();
        if (this._dotGridLayer && this._dotGridTheme === theme
            && this._dotGridLayer.width === width && this._dotGridLayer.height === height) {
            return this._dotGridLayer;
        }
        if (this._dotGridLayer) this._dotGridLayer.remove();
        this._dotGridLayer = this._buildDotGridLayer(width, height);
        this._dotGridTheme = theme;
        return this._dotGridLayer;
    }

    draw() {
        background(AppPalette.surface.canvas);
        image(this._ensureDotGridLayer(), 0, 0);

        // Values mode: delegate to the MC / Method sub-view
        if (this.viewModel.interaction.mode === 'values') {
            const usableW = windowWidth - this.RIGHT_PANEL_WIDTH;
            const usableH = windowHeight - this.TOP_BARS_HEIGHT - this.getDockHeight();
            const subView = this.viewModel.valuesSubView;

            if (subView === 'mc' && this.expectationView) {
                this.expectationView.draw(usableW, usableH);
            } else if (subView === 'vi' && this.valueIterationView) {
                push();
                // Fixed screen-space shift (applied before pan/zoom, so it isn't affected by
                // zoom scale) to clear the floating estimator pill.
                translate(0, MV_VALUES_PILL_CLEARANCE);
                translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
                scale(this.viewModel.viewport.zoom);
                // The unknown:full quadrant (Learning Iteration) is a genuinely separate
                // subsystem (real episodic Q-learning + search tree), not VI's rendering.
                const quadrant = ValuesMethodMatrix.key(this.viewModel.modelKnown, this.viewModel.observability);
                if (quadrant === 'unknown:full' && this.learningIterationView) {
                    this.learningIterationView.draw();
                } else {
                    this.valueIterationView.draw();
                }
                pop();
            }
            return;
        }

        // Apply zoom and pan transformations
        push();
        translate(this.viewModel.viewport.panX, this.viewModel.viewport.panY);
        scale(this.viewModel.viewport.zoom);

        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            this.treeView.draw(windowWidth - this.RIGHT_PANEL_WIDTH);
        } else {
            this.drawEdges();
            this.drawNodes();
            this.drawTextLabels();
        }

        // Draw spinning arrow if in spinning arrow phase (action node) or state_spinning_arrow (state node)
        if (this.viewModel.simulationState) {
            const _phase = this.viewModel.simulationState.phase;
            if (_phase === 'spinning_arrow') this.drawSpinningArrow();
            if (_phase === 'state_spinning_arrow') this.drawStateSpinningArrow();
        }

        // Draw travel ball during edge_highlight phase
        this.drawHighlightedEdgeTravelBall();

        pop();

        // Continuous redraw during animated simulation phases
        const _simS = this.viewModel.simulationState;
        if (_simS && _simS.replayInitialized && !_simS.isPhaseComplete() &&
            (_simS.phase === 'reveal' ||
             _simS.phase === 'highlight' ||
             _simS.phase === 'spinning_arrow' ||
             _simS.phase === 'state_spinning_arrow')) {
            requestAnimationFrame(() => { if (typeof redraw === 'function') redraw(); });
        }

        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            this.treeView.drawChrome();
        }

        // Draw info/error messages
        this.drawMessages();

        // Update right panel if selection, simulation state, or graph structure changed
        if (this.rightPanel) {
            const currentSelection = this.viewModel.selection.selectedNode;
            const isSimulating = this.viewModel.simulationState && this.viewModel.simulationState.replayInitialized;
            const simulationIndex = isSimulating ? this.viewModel.simulationState.currentIndex : -1;
            const currentNodesCount = this.viewModel.graph.nodes.length;
            const currentEdgesCount = this.viewModel.graph.edges.length;

            if (currentSelection !== this.previousSelectedNode ||
                (isSimulating && simulationIndex !== this.previousSimulationIndex) ||
                currentNodesCount !== this.previousNodesCount ||
                currentEdgesCount !== this.previousEdgesCount) {
                this.rightPanel.updateContent();
                this.previousSelectedNode = currentSelection;
                this.previousSimulationIndex = simulationIndex;
                this.previousNodesCount = currentNodesCount;
                this.previousEdgesCount = currentEdgesCount;
            }
        }

        if (this.viewModel.interaction.heldNode && this.viewModel.interaction.placingMode) {
            this.updateHeldNodePosition();
        }
        if (this.viewModel.interaction.heldTextLabel && this.viewModel.interaction.placingMode === 'textbox') {
            this.updateHeldNodePosition();
        }
    }

    // Effective pane widths for the current Values sub-view: 'mc'/'vi' are exclusive panes, each
    // owning the whole canvas (canvas comparison lives in the charts, not a split canvas view).
    _valuesPaneWidths(canvasWidth) {
        return { mc: canvasWidth, vi: canvasWidth };
    }

    drawMessages() {
        // Display info message if set
        if (this.viewModel.infoMessage) {
            push();
            fill(0, 150, 0, 200);
            noStroke();
            rect(MV_MSG_X, height - MV_MSG_Y_OFFSET, MV_MSG_WIDTH, MV_MSG_HEIGHT, MV_MSG_RADIUS);
            fill(255);
            textAlign(LEFT, CENTER);
            textSize(MV_MSG_TEXT_SIZE);
            text(this.viewModel.infoMessage, MV_MSG_X + 10, height - MV_MSG_Y_OFFSET / 2);
            pop();

            setTimeout(() => {
                this.viewModel.infoMessage = null;
                redraw();
            }, MV_MSG_TIMEOUT_MS);
        }

        // Display error message if set
        if (this.viewModel.errorMessage) {
            push();
            fill(200, 0, 0, 200);
            noStroke();
            rect(MV_MSG_X, height - MV_MSG_Y_OFFSET, MV_MSG_WIDTH, MV_MSG_HEIGHT, MV_MSG_RADIUS);
            fill(255);
            textAlign(LEFT, CENTER);
            textSize(MV_MSG_TEXT_SIZE);
            text(this.viewModel.errorMessage, MV_MSG_X + 10, height - MV_MSG_Y_OFFSET / 2);
            pop();

            setTimeout(() => {
                this.viewModel.errorMessage = null;
                redraw();
            }, MV_MSG_TIMEOUT_MS);
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
        const targetEl = document.querySelector('.panel-utility-value');
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

    drawNodes() {
        const nodes = this.viewModel.graph.nodes;

        nodes.forEach(node => {
            // In build/policy mode with active simulation, check visibility
            if (this._isEditableMode() &&
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
                        const staggerMs = idx * MV_REVEAL_NODE_STAGGER;
                        const elapsed = Date.now() - simRevealNode.phaseStartTime;
                        const tRaw = Math.max(0, Math.min(1, (elapsed - staggerMs) / MV_REVEAL_NODE_DUR));
                        revealScale = EasingUtils.easeOutBack(tRaw);
                        if (revealScale <= 0) return;
                    }
                }
            }

            const nodeVM = this.viewModel.createNodeViewModel(node);
            const color = nodeVM.color;

            // Get spinning arrow alpha for this node
            const spinAlpha  = this.getNodeSpinningArrowAlpha(node);
            const focusAlpha = this.getEditorFocusNodeAlpha(node);
            const nodeAlpha  = Math.min(spinAlpha, focusAlpha);
            const isNodeFaded = nodeAlpha < 255;

            const scaleActive = revealScale !== 1;
            if (scaleActive) { push(); translate(node.x, node.y); scale(revealScale); translate(-node.x, -node.y); }

            // Apply alpha to node fill color
            const nodeColor = this.applyAlphaToColor(color, nodeAlpha);
            fill(nodeColor);

            const isStartNode = this.viewModel.startNode &&
                this.viewModel.startNode.id === node.id;
            const isStartNodeInBuild = this._isEditableMode() && isStartNode;

            if (isStartNodeInBuild) {
                stroke(AppPalette.node.startRing);
                strokeWeight(3);
            } else {
                stroke(this.applyAlphaToColor(AppPalette.text.black, nodeAlpha));
                strokeWeight(2);
            }

            // Partial-observability state nodes get the same dash pattern as faded nodes
            // (reused rather than introducing a near-duplicate pair - see MV_DASH_NODE_LINE/GAP)
            // to hint that the agent doesn't fully observe the state in this mode.
            const isPartialObsNode = node.type === 'state' && this.viewModel.observability === 'partial';
            const useDashedStroke = isNodeFaded || isPartialObsNode;

            if (useDashedStroke) {
                drawingContext.setLineDash([MV_DASH_NODE_LINE, MV_DASH_NODE_GAP]);
            }

            circle(node.x, node.y, node.size * 2);

            if (useDashedStroke) {
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
                    drawingContext.globalAlpha = nodeAlpha / 255;

                    // Draw image to fit inside circle
                    const imgSize = node.size * 1.6; // Diameter * 0.8
                    image(node._imageObj, node.x, node.y, imgSize, imgSize);

                    drawingContext.restore(); // resets globalAlpha to 1.0
                }
                pop();

                // Draw name above the node, matching text label style
                const labelColor = this.viewModel.selection.selectedNodeNameLabel === node
                    ? AppPalette.node.selected
                    : AppPalette.text.black;
                const labelPos = node.getNameLabelPosition();
                fill(ColorUtils.applyAlpha(labelColor, nodeAlpha));
                noStroke();
                textAlign(CENTER, CENTER);
                textSize(16);
                text(node.name, labelPos.x, labelPos.y);
            } else {
                // Only draw text if no image - contrast-pick against the node's actual fill
                // color so labels stay legible as node fill colors change with theme/palette.
                fill(this.applyAlphaToColor(ColorUtils.contrastText(color), nodeAlpha));
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

            // In build/policy mode with active simulation, check visibility
            if (this._isEditableMode() &&
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
            // State → Action edges: deterministic policies keep the original flat bold/thin
            // weights (3 / 2); weighted-random policies scale width by the action's share of
            // the distribution (1 + 3p, matching the mockup). Action → State edges: weight
            // based on transition probability.
            let weight;
            if (from.type === 'state' && to.type === 'action') {
                const policyMode = this.viewModel.simulationState ? this.viewModel.simulationState.getPolicyMode(from.id) : 'uniform';
                const policyProb = edgeVM.policyEdgeProbability;
                if (policyMode === 'weighted' && policyProb !== null) {
                    weight = 1 + 3 * policyProb;
                } else {
                    weight = policyProb !== null ? 3 : 2;
                }
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
                        const staggerMs = Math.max(0, idx) * MV_REVEAL_EDGE_STAGGER;
                        const elapsed = Date.now() - simReveal.phaseStartTime;
                        const tRaw = Math.max(0, Math.min(1, (elapsed - staggerMs) / MV_REVEAL_EDGE_DUR));
                        const lineP = EasingUtils.easeOut(tRaw);
                        const headP = Math.max(0, Math.min(1, (lineP - MV_REVEAL_HEAD_THRESH) / (1 - MV_REVEAL_HEAD_THRESH)));
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

        const arrowSize = MV_ARROW_BASE + weight * MV_ARROW_WEIGHT_MULT;

        // Calculate the point on the circumference of the 'to' node
        const toRadius = to.size;
        const arrowTipX = to.x - normalizedDx * toRadius;
        const arrowTipY = to.y - normalizedDy * toRadius;

        // End the line before the arrowhead to avoid covering it
        const lineEndX = arrowTipX - normalizedDx * arrowSize;
        const lineEndY = arrowTipY - normalizedDy * arrowSize;

        // Get spinning arrow render info (dashed + alpha + optional color override)
        const renderInfo = this.getSpinningArrowRenderInfo(from, to);
        const focusAlpha = this.getEditorFocusEdgeAlpha(edge);
        const finalAlpha = Math.min(renderInfo.alpha, focusAlpha);

        // Use color override (blue tint from ring) if available, otherwise default edge color
        const baseColor = renderInfo.colorOverride || edgeColor;
        const alphaEdgeColor = this.applyAlphaToColor(baseColor, finalAlpha);

        // Draw the edge line
        strokeWeight(weight);
        stroke(alphaEdgeColor);

        if (renderInfo.dashed) {
            drawingContext.setLineDash([MV_DASH_LINE, MV_DASH_GAP]);
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
        const focusAlpha = this.getEditorFocusEdgeAlpha(edge);
        const finalAlpha = Math.min(renderInfo.alpha, focusAlpha);
        const baseColor = renderInfo.colorOverride || edgeColor;
        const alphaEdgeColor = this.applyAlphaToColor(baseColor, finalAlpha);

        strokeWeight(weight);
        stroke(alphaEdgeColor);
        noFill();

        if (renderInfo.dashed) {
            drawingContext.setLineDash([MV_DASH_LINE, MV_DASH_GAP]);
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
        const arrowAngle = MV_ARROW_ANGLE;

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

        const arrowSize = MV_ARROW_BASE + weight * MV_ARROW_WEIGHT_MULT;
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

    getSpinningArrowRenderInfo(from, to) {
        return this.simRenderer.getEdgeRenderInfo(from, to);
    }

    getNodeSpinningArrowAlpha(node) {
        return this.simRenderer.getNodeAlpha(node);
    }

    getEditorFocusNodeAlpha(node) {
        if (!this._isEditableMode()) return 255;
        const interaction = this.viewModel.interaction;
        if (!interaction.hasEditorFocus()) return 255;
        return interaction.isNodeInEditorFocus(node)
            ? MV_EDITOR_FOCUS_ALPHA_FULL
            : MV_EDITOR_FOCUS_ALPHA_FADED;
    }

    getEditorFocusEdgeAlpha(edge) {
        if (!this._isEditableMode()) return 255;
        const interaction = this.viewModel.interaction;
        if (!interaction.hasEditorFocus()) return 255;
        return interaction.isEdgeInEditorFocus(edge)
            ? MV_EDITOR_FOCUS_ALPHA_FULL
            : MV_EDITOR_FOCUS_ALPHA_FADED;
    }

    drawHighlightedEdgeTravelBall() {
        this.simRenderer.drawTravelBall();
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
                color: isHighlighted ? AppPalette.text.black : AppPalette.edge.label,
                em: isHighlighted ? 14 : 12,
                alpha: isHighlighted ? 255 : 80
            });
        });

    }

    // Draw spinning arrow animation at state node during action-selection phase (random policy)
    drawStateSpinningArrow() {
        const simState = this.viewModel.simulationState;
        if (!simState || simState.phase !== 'state_spinning_arrow') return;

        const currentNode = simState.currentNode;
        if (!currentNode || currentNode.type !== 'state') return;

        const stateNode = this.viewModel.graph.getNodeById(currentNode.id);
        if (!stateNode) return;

        const edges = simState.spinningArrowEdges;
        if (!edges || edges.length === 0) return;

        const highlightedEdgeIndex = simState.getHighlightedEdgeByArrow();
        const highlightedEdge = edges[highlightedEdgeIndex];

        // Arrow points from state node toward highlighted action node
        let arrowAngle = 0;
        if (highlightedEdge) {
            const targetAction = this.viewModel.graph.getNodeById(highlightedEdge.targetId);
            if (targetAction) {
                arrowAngle = atan2(targetAction.y - stateNode.y, targetAction.x - stateNode.x) + PI / 2;
            }
        }

        push();
        translate(stateNode.x, stateNode.y);
        rotate(arrowAngle);
        this.drawSpinningArrowGlyph(stateNode.size);
        pop();

        // Probability labels on each state→action edge
        const n = edges.length;
        edges.forEach((edge, index) => {
            const actionNode = this.viewModel.graph.getNodeById(edge.targetId);
            if (!actionNode) return;

            const midX = (stateNode.x + actionNode.x) / 2;
            const midY = (stateNode.y + actionNode.y) / 2;
            const isHighlighted = (index === highlightedEdgeIndex);
            const probLabel = `p = ${(1 / n).toFixed(2)}`;

            push();
            noStroke();
            if (isHighlighted) {
                fill(ColorUtils.applyAlpha(AppPalette.simulation.spinLabelHighlight, 220));
                rect(midX - 30, midY - 12, 60, 24, 4);
            } else {
                fill(ColorUtils.applyAlpha(AppPalette.simulation.spinLabelBackground, 60));
                rect(midX - 30, midY - 12, 60, 24, 4);
            }
            pop();

            mathRenderer.draw(drawingContext, probLabel, midX, midY, {
                color: isHighlighted ? AppPalette.text.black : AppPalette.edge.label,
                em: isHighlighted ? 14 : 12,
                alpha: isHighlighted ? 255 : 80
            });
        });
    }

    drawTextLabels() {
        const labels = this.viewModel.graph.textLabels;
        const selectedLabel = this.viewModel.selection.selectedTextLabel;

        labels.forEach(label => {
            // Simple color logic: yellow if selected
            const isSelected = selectedLabel === label;
            const color = isSelected ? AppPalette.node.selected : AppPalette.text.black;
            fill(color);
            noStroke();
            textAlign(CENTER, CENTER);
            textSize(label.fontSize);
            text(label.text, label.x, label.y);

            if (isSelected && this._isEditableMode()) {
                this._drawTextLabelHitBox(label);
            }
        });
    }

    // Visible bounding box + resize handle for the selected text label - drawn with the exact
    // same geometry GeometricHelper.isClickOnTextLabelCorner hit-tests against, so the handle
    // shown is always exactly where dragging resizes instead of moves.
    _drawTextLabelHitBox(label) {
        const textWidth = label.text.length * label.fontSize * 0.6;
        const halfW = textWidth / 2;
        const halfH = label.fontSize / 2;

        push();
        noFill();
        stroke(AppPalette.node.selected);
        strokeWeight(1);
        rectMode(CENTER);
        rect(label.x, label.y, textWidth, label.fontSize);

        noStroke();
        fill(AppPalette.node.selected);
        rect(label.x + halfW, label.y + halfH, 8, 8);
        pop();
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

        // Tree view owns its own synthetic layout (not the graph's real node positions), so it
        // fully bypasses GeometricHelper-based hit-testing and edge/node click logic below. Right-
        // click (set s0) and zoom still work normally - only plain left-click on the canvas routes
        // here. Clicks on empty tree-canvas space still arm panning (mirroring Graph view's own
        // empty-click handling further below) so drag-to-pan keeps working in Tree view.
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' &&
            this.treeView && mouseButton !== RIGHT) {
            if (this.topBar) {
                this.topBar.closeAllDropdowns();
            }
            if (this.treeView.hitTestBadge(mouseX, mouseY)) {
                this.treeView.handleClick(mouseX, mouseY);
                redraw();
            } else {
                this.viewModel.viewport.isPanning = true;
                this.viewModel.viewport.panStartX = mouseX;
                this.viewModel.viewport.panStartY = mouseY;
                this.viewModel.viewport.panStartOffsetX = this.viewModel.viewport.panX;
                this.viewModel.viewport.panStartOffsetY = this.viewModel.viewport.panY;
                cursor('grab');
            }
            return;
        }

        // Right-click in build/policy mode: set start node (s₀)
        if (mouseButton === RIGHT) {
            if (this._isEditableMode()) {
                const world = this.viewModel.viewport.screenToWorld(mouseX, mouseY);
                const target = GeometricHelper.findEntityAtPosition(this.viewModel.graph, world.x, world.y);
                if (target.type === 'node' && target.entity.type === 'state') {
                    this.controller.setStartNode(target.entity);
                    if (this.rightPanel) this.rightPanel.updateContent();
                    redraw();
                }
            }
            return;
        }

        // Close menu dropdowns when clicking on canvas
        if (this.topBar) {
            this.topBar.closeAllDropdowns();
        }

        // Note: Sidebar buttons are positioned absolutely to the left of the canvas
        // and handle their own click events (returning false to prevent propagation).
        // No need to check for button area overlap here.

        // Check if clicking on empty canvas for panning (must check BEFORE delegating to controller)
        const world = this.viewModel.viewport.screenToWorld(mouseX, mouseY);
        const target = GeometricHelper.findEntityAtPosition(this.viewModel.graph, world.x, world.y);

        // If clicking on empty canvas and not placing a node (or about to place a text
        // label), start panning. Without the textLabelRequested check, clicking empty
        // canvas to place a text label - the common case - was swallowed by panning and
        // never reached the textLabelRequested handling below.
        if (target.type === 'none' && !this.viewModel.interaction.placingMode &&
            !this.viewModel.interaction.textLabelRequested) {
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
            this.promptForTextLabel(world.x, world.y);
        }

        // Check if rename was requested
        if (this.viewModel.interaction.renameRequested && this.viewModel.interaction.renameTargetNode) {
            this.promptForRename(this.viewModel.interaction.renameTargetNode);
        }

        // Set cursor for resize
        if (this.viewModel.interaction.resizingNode || this.viewModel.interaction.resizingTextLabel) {
            cursor('nwse-resize');
        }

        // A canvas click may have just finished a placement (dropping a held node/text label),
        // reverting to the select tool - keep the palette's active-tool highlight in sync.
        if (this.toolPalette) this.toolPalette.updateActiveTool(this.viewModel.interaction.placingMode);

        redraw();
    }

    mouseDragged() {
        // Only handle drags within the canvas bounds
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }

        // MC's mini-panel grid doesn't use pan/zoom; VI (including its pane in split view) does.
        if (this.viewModel.interaction.mode === 'values' && this.viewModel.valuesSubView === 'mc') return;

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
        if (this.viewModel.interaction.resizingNode || this.viewModel.interaction.resizingTextLabel) {
            cursor(ARROW);
        }

        redraw();
    }

    mouseMoved() {
        if (this._isEditableMode() && this.viewModel.buildCanvasView === 'tree' && this.treeView) {
            const changed = this.treeView.handleMouseMove(mouseX, mouseY);
            this.viewModel.interaction.hoveredEdge = this.treeView.realHoveredEdge;
            if (changed) {
                redraw();
                if (this.rightPanel) this.rightPanel.updateContent();
            }
            return;
        }

        if (this.viewModel.interaction.mode === 'values' && this.viewModel.valuesSubView === 'mc' && this.expectationView) {
            const hoverChanged = this.expectationView.handleMouseMove(mouseX, mouseY);
            if (hoverChanged) {
                redraw();
                if (this.chartDock) this.chartDock.refresh();
            }
            return;
        }

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

    promptForTextLabel(worldX, worldY) {
        const text = prompt('Enter text label:');
        if (text && text.trim()) {
            this.controller.createTextLabel(text.trim(), worldX, worldY);
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
        // Only handle scroll on canvas. mouseX/mouseY are canvas-relative and don't account for
        // DOM chrome layered on top (right panel, chart dock, toolbar, pills) - check the actual
        // event target too, so wheeling over e.g. the right panel scrolls it natively instead of
        // zooming the canvas underneath.
        if (mouseX < 0 || mouseX > width || mouseY < 0 || mouseY > height) {
            return;
        }
        if (event.target !== this.canvas.elt) {
            return;
        }

        // MC's mini-panel grid doesn't use pan/zoom; VI (including its pane in split view) does.
        if (this.viewModel.interaction.mode === 'values' && this.viewModel.valuesSubView === 'mc') return;

        // Zoom towards mouse position
        const zoomFactor = -event.delta * 0.001;
        const newZoom = this.viewModel.viewport.zoom * (1 + zoomFactor);

        this.viewModel.viewport.setZoom(newZoom, mouseX, mouseY);
        if (this.zoomPill) this.zoomPill.refresh();
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
                if (this.zoomPill) this.zoomPill.refresh();
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

        // Several shortcuts (e.g. 'r' resets zoom) mutate viewport.zoom directly via the
        // controller; refresh is cheap and idempotent, so just always sync rather than trying
        // to detect which key was pressed.
        if (this.zoomPill) this.zoomPill.refresh();

        redraw();

        return shouldPreventDefault;
    }

    keyReleased() {
        // Reserved for future key release handling
        return true;
    }

    windowResized() {
        if (this.rightPanel) this.RIGHT_PANEL_WIDTH = this.rightPanel.getWidth();

        const canvasWidth = windowWidth - this.RIGHT_PANEL_WIDTH;
        const canvasHeight = windowHeight - this.TOP_BARS_HEIGHT;

        resizeCanvas(canvasWidth, canvasHeight);
        this.canvas.position(0, this.TOP_BARS_HEIGHT);
        if (this.chartDock) this.chartDock.updateBounds(0, canvasWidth);
        if (this.zoomPill) this.zoomPill.updateBounds(this.RIGHT_PANEL_WIDTH);
        if (this.estimatorPill) this.estimatorPill.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        if (this.mcRunsPill) this.mcRunsPill.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        if (this.viSweepChip) this.viSweepChip.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        if (this.learningTreePill) this.learningTreePill.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        const valuesHeight = canvasHeight - this.getDockHeight();
        const paneWidths = this._valuesPaneWidths(canvasWidth);
        this._relayoutValueIterationIfActive(paneWidths.vi, valuesHeight);
        if (this.expectationView && this.viewModel.interaction.mode === 'values'
            && this.viewModel.valuesSubView === 'mc') {
            this.expectationView.resize(paneWidths.mc, valuesHeight, this.TOP_BARS_HEIGHT);
        }

        // Update top bar width
        if (this.topBar) {
            this.topBar.updateWidth(windowWidth);
        }

        // Update right panel position and height
        if (this.rightPanel) {
            this.rightPanel.updateWidth(windowWidth);
            this.rightPanel.updateHeight(windowHeight, this.TOP_BARS_HEIGHT);
        }

        redraw();
    }

    onPanelResize(newPanelWidth) {
        this.RIGHT_PANEL_WIDTH = newPanelWidth;
        const canvasWidth = windowWidth - newPanelWidth;
        const canvasHeight = windowHeight - this.TOP_BARS_HEIGHT;
        resizeCanvas(canvasWidth, canvasHeight);
        this.canvas.position(0, this.TOP_BARS_HEIGHT);
        if (this.chartDock) this.chartDock.updateBounds(0, canvasWidth);
        if (this.zoomPill) this.zoomPill.updateBounds(this.RIGHT_PANEL_WIDTH);
        if (this.estimatorPill) this.estimatorPill.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        if (this.mcRunsPill) this.mcRunsPill.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        if (this.viSweepChip) this.viSweepChip.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        if (this.learningTreePill) this.learningTreePill.updateBounds(0, windowWidth - this.RIGHT_PANEL_WIDTH);
        const valuesHeight = canvasHeight - this.getDockHeight();
        const paneWidths = this._valuesPaneWidths(canvasWidth);
        this._relayoutValueIterationIfActive(paneWidths.vi, valuesHeight);
        if (this.expectationView && this.viewModel.interaction.mode === 'values'
            && this.viewModel.valuesSubView === 'mc') {
            this.expectationView.resize(paneWidths.mc, valuesHeight, this.TOP_BARS_HEIGHT);
        }
        redraw();
    }

    // Value Iteration now draws the single live graph at real node positions (like Build/Policy),
    // so there is no synthetic column layout to recompute on resize. An open explanation card's
    // fan-out geometry is derived from real node positions too, but is cleared here since a
    // resize/dock-drag is a natural point to dismiss the overlay rather than re-anchor it.
    _relayoutValueIterationIfActive(canvasWidth, canvasHeight) {
        if (this.viewModel.interaction.mode !== 'values') return;
        if (this.viewModel.valuesSubView !== 'vi') return;
        const viViewModel = this.viewModel.valueIterationViewModel;
        if (!viViewModel) return;
        if (viViewModel.explanationDetail) {
            viViewModel.clearExplanationDetail();
            if (this.rightPanel) this.rightPanel.updateContent();
        }
    }
}
