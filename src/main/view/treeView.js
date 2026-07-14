// Renders the Build/Policy "Tree" view: the MDP unrolled left-to-right from startNode, via
// TreeLayout. Draws inside mainView.js's existing pan/zoom transform - does not push/translate/
// scale itself. Click/hover interaction is added in later tasks (this file grows to own them).
const TREE_VIEW_STATE_RADIUS = 24;
const TREE_VIEW_ACTION_HALF  = 16;
const TREE_VIEW_BADGE_RADIUS = 8;
// The tool palette (see toolPalette.js / .tool-palette in style.css) floats at
// left:12px, top:(topBarHeight + 12) and, measured in a real browser (Chromium,
// 1400x900, default 40px top bar), spans x:[12, 164], y:[52, 228]. The root's hover ring
// extends TREE_VIEW_STATE_RADIUS + 5 px beyond its circle, and its hover badge (e.g.
// "Bud — 1× in tree", measured ~96px wide via textWidth()) is centered on the node and
// draws above the ring, so it - not the bare node circle - is the widest/leftmost thing
// that can clip the palette. anchorX=200 left the badge's left edge at ~152px, ~12px
// under the palette's 164px right edge; anchorX=240 keeps a comfortable ~25px+ margin
// even for a somewhat longer state name.
const TREE_VIEW_ANCHOR_X     = 240;
const TREE_VIEW_ANCHOR_Y     = 120;
const TREE_VIEW_EDGE_HOVER_PX = 6; // screen-pixel hover tolerance for edge hit-testing

class TreeView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.hoveredStateId = null;
        this.hoveredEdge = null;
        this._hoveredEdgeKey = null;
        this._usableWidth = 900; // corrected by the first real draw(usableWidth) call
    }

    _isSimulating() {
        const simState = this.viewModel.simulationState;
        return !!(simState && simState.replayInitialized);
    }

    // During an active simulation, the tree must auto-expand past the user's manual treeExpanded
    // set to cover however far the live trace has gone - the trace can run deeper (up to
    // simulationState.maxSteps transitions) than the default depth-1 cap or anything the user
    // happened to click open. Recomputed fresh each call (no cache), same convention every other
    // TreeLayout consumer here already follows.
    _expandedSetForCurrentDraw() {
        if (!this._isSimulating()) return this.viewModel.treeExpanded;
        const simState = this.viewModel.simulationState;
        const pathIds = this._traceStepToPathId(simState.visited, this.viewModel.graph);
        const bound = Math.min(simState.currentIndex, pathIds.length - 1);
        const expanded = new Set(this.viewModel.treeExpanded);
        for (let i = 0; i <= bound; i++) expanded.add(pathIds[i]);
        return expanded;
    }

    // Builds the current tree (recomputed every draw - same "no cache" convention already used
    // by ExpectationViewModel.computeLayout() elsewhere in this codebase; MDP graphs in this app
    // are small enough that this is cheap).
    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        const expandedSet = this._expandedSetForCurrentDraw();
        return TreeLayout.build(this.viewModel.graph, startNode.id, expandedSet, 1, this._usableWidth);
    }

    // Maps each index of simulationState.visited to its exact pathId in the full unrolled tree,
    // by walking the trace and the domain graph in lockstep - TreeLayout.build() iterates
    // graph.actions/.sas in this exact same order when constructing children, so the two never
    // desync by construction (both ultimately read the same arrays off the same graph). Returns a
    // pathId array parallel to `visited`, truncated at the first index where a match can't be
    // found (defensive - should never happen with a well-formed trace, but must not crash
    // rendering if it somehow did).
    _traceStepToPathId(visited, graph) {
        if (!visited || visited.length === 0) return [];
        const pathIds = ['s0'];
        for (let i = 1; i < visited.length; i++) {
            const prevEntry = visited[i - 1];
            const entry = visited[i];
            const prevPathId = pathIds[i - 1];

            if (entry.type === 'action') {
                const stateNodeInGraph = graph.getNodeById(prevEntry.id);
                const ai = (stateNodeInGraph && stateNodeInGraph.actions)
                    ? stateNodeInGraph.actions.indexOf(entry.id) : -1;
                if (ai < 0) break;
                pathIds.push(`${prevPathId}.a${ai}`);
            } else {
                const actionNodeInGraph = graph.getNodeById(prevEntry.id);
                const ti = (actionNodeInGraph && actionNodeInGraph.sas)
                    ? actionNodeInGraph.sas.findIndex(t => t.nextState === entry.id) : -1;
                if (ti < 0) break;
                pathIds.push(`${prevPathId}.${ti}`);
            }
        }
        return pathIds;
    }

    // usableWidth is the canvas's usable width (windowWidth - RIGHT_PANEL_WIDTH, passed by
    // mainView.js). We reserve TREE_VIEW_ANCHOR_X out of that budget before it reaches
    // TreeLayout's thirds computation, since draw() also translates everything right by that same
    // amount (to clear the floating tool palette) - without this, the thirds math and the anchor
    // translate would double-count that horizontal space and the third column would render
    // off-canvas at ordinary window widths (this was found by code review; verify the fix with
    // real window-size numbers, not just by reading the formula, per this task's own instructions).
    draw(usableWidth) {
        if (usableWidth) this._usableWidth = Math.max(300, usableWidth - TREE_VIEW_ANCHOR_X);
        const tree = this._currentTree();
        if (!tree) return;

        push();
        translate(TREE_VIEW_ANCHOR_X, TREE_VIEW_ANCHOR_Y);

        if (this._isSimulating()) {
            this._drawTraceReveal(tree, this.viewModel.simulationState);
        } else {
            this._drawStaticTree(tree);
        }

        pop();
    }

    // Full unrolled tree, all branches, hover ring + badges - the existing v1/v2 Browse-mode
    // behavior, extracted unchanged into its own method now that draw() also has a second mode.
    _drawStaticTree(tree) {
        // Edges first (so nodes draw on top of their own incoming edge).
        TreeLayout.forEach(tree, node => {
            node.children.forEach(child => this._drawEdge(node, child));
        });
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));
        this._drawHoverBadge(tree);
    }

    // Builds a pathId -> TreeNode lookup map for one tree (used by _drawTraceReveal to resolve
    // trace-position pathIds back to the tree nodes/positions to render).
    _buildPathIdMap(tree) {
        const map = new Map();
        TreeLayout.forEach(tree, node => map.set(node.pathId, node));
        return map;
    }

    // Progressive reveal, tree-positioned: mirrors Graph view's own progressive-reveal convention
    // (mainView.js's drawNodes()/drawEdges(), which gates on simulationState.isNodeVisible/
    // isEdgeVisible) but resolved against tree pathIds instead of real graph node world-positions.
    // Committed trace steps (pathIds[0..currentIndex]) always draw; the "frontier fan" - the
    // current tree node's full set of real children (all actions of a state, or all outcomes of
    // an action) - draws either all of them (undecided phases, matching SimulationAnimator's
    // reveal flash) or just the one chosen next pathId (decided phases). Unlike Graph view, this
    // does NOT reuse simState.isNodeVisible/isEdgeVisible for the frontier: those are tracked
    // globally per real node id and never cleared, which is unambiguous in Graph view (one real
    // id = one canvas position) but not in Tree view, where the same real id can occupy multiple
    // tree positions (cycles) - a cyclic destination already revealed earlier in the trace would
    // incorrectly read as "visible" for a brand new tree-position occurrence. See
    // `_drawTraceReveal`'s own frontier-fan comment below for the phase/pathId-based fix.
    _drawTraceReveal(tree, simState) {
        const pathIds = this._traceStepToPathId(simState.visited, this.viewModel.graph);
        const pathMap = this._buildPathIdMap(tree);
        const ci = Math.min(simState.currentIndex, pathIds.length - 1);
        if (ci < 0) return;

        // Committed edges: consecutive committed pathIds, drawn as plain traversed edges.
        for (let i = 1; i <= ci; i++) {
            const parent = pathMap.get(pathIds[i - 1]);
            const child = pathMap.get(pathIds[i]);
            if (parent && child) this._drawEdge(parent, child);
        }

        // Frontier fan: during the "undecided" phases (reveal / state_spinning_arrow /
        // spinning_arrow), show ALL of current's real children - matching Graph view's own
        // reveal-then-narrow flow. Once decided (highlight / transition / idle), show ONLY the
        // one child matching pathIds[ci+1] - the definitive "what was actually chosen," known
        // directly from our own trace->pathId mapping (Task 3), not from simState's global
        // per-real-id visibility flags. This deliberately does NOT use
        // simState.isNodeVisible/isEdgeVisible for the frontier: those flags are sticky per real
        // id and never cleared, so a cyclic destination whose real id was already revealed
        // earlier in the trace (e.g. back to the start state) would read as "visible" for a brand
        // new tree-position occurrence before this specific decision was actually revealed -
        // producing a spurious one-sided preview. Keying off pathIds[ci+1] instead sidesteps that
        // ambiguity completely, since it's derived straight from the real trace, not a shared flag.
        const current = pathMap.get(pathIds[ci]);
        const DECIDED_PHASES = new Set(['highlight', 'transition', 'idle']);
        const chosenNextPathId = (ci + 1 < pathIds.length) ? pathIds[ci + 1] : null;
        const isDecided = DECIDED_PHASES.has(simState.phase);

        if (current) {
            current.children.forEach(child => {
                const showThisChild = isDecided ? (child.pathId === chosenNextPathId) : true;
                if (showThisChild) this._drawEdge(current, child);
            });
        }

        // Committed nodes (current one highlighted).
        for (let i = 0; i <= ci; i++) {
            const node = pathMap.get(pathIds[i]);
            if (node) this._drawNode(node, { isCurrent: i === ci, showBadge: false });
        }

        // Frontier fan nodes.
        if (current) {
            current.children.forEach(child => {
                const showThisChild = isDecided ? (child.pathId === chosenNextPathId) : true;
                if (showThisChild) this._drawNode(child, { isCurrent: false, showBadge: false });
            });
        }
    }

    // Converts a tree-local (x, y) point into current screen coordinates, applying the same
    // anchor offset draw() uses plus the shared viewport pan/zoom. Takes plain coordinates (not a
    // TreeNode) so it can also convert badge-center / edge-midpoint points, not just node centers.
    _treeToScreen(x, y) {
        const worldX = x + TREE_VIEW_ANCHOR_X;
        const worldY = y + TREE_VIEW_ANCHOR_Y;
        return this.viewModel.viewport.worldToScreen(worldX, worldY);
    }

    // Tree-local (x, y) of a node's +/- expand badge - bottom-right corner for both shapes, scaled
    // to each shape's own size so the badge always sits just outside the node's own boundary.
    _badgeCenter(node) {
        // Both shapes are circles now - the same "off = radius * 0.75" corner-ish offset applies
        // to either, just with each shape's own half-size as the radius.
        const halfSize = node.kind === 'state' ? TREE_VIEW_STATE_RADIUS : TREE_VIEW_ACTION_HALF;
        const off = halfSize * 0.75;
        return { x: node.x + off, y: node.y + off };
    }

    // Returns the topmost TreeNode whose on-screen shape contains (screenX, screenY), or null.
    _hitTest(screenX, screenY) {
        const tree = this._currentTree();
        if (!tree) return null;
        const zoom = this.viewModel.viewport.zoom;
        let hit = null;
        TreeLayout.forEach(tree, node => {
            const p = this._treeToScreen(node.x, node.y);
            const halfSize = (node.kind === 'state' ? TREE_VIEW_STATE_RADIUS : TREE_VIEW_ACTION_HALF) * zoom;
            const dx = screenX - p.x, dy = screenY - p.y;
            if (dx * dx + dy * dy <= halfSize * halfSize) hit = node;
        });
        return hit;
    }

    // Shortest distance from point (px, py) to the line segment (x1,y1)-(x2,y2). Standard
    // projection-and-clamp formula.
    _distanceToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx, projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
    }

    // Returns {stateNode, actionNode, childStateNode} for the outcome edge nearest (screenX,
    // screenY), if within TREE_VIEW_EDGE_HOVER_PX screen pixels - or null. Only outcome edges
    // (action -> state) are hoverable; state -> action edges have no probability to show.
    // Walks state/action pairs explicitly (rather than TreeLayout.forEach's generic node-at-a-time
    // traversal) because the tooltip needs the ORIGINATING state's name (the action's parent),
    // which a single node object doesn't carry a reference to.
    _hitTestEdge(screenX, screenY) {
        const tree = this._currentTree();
        if (!tree) return null;
        let hit = null;
        let bestDist = TREE_VIEW_EDGE_HOVER_PX;
        const walk = (stateNode) => {
            stateNode.children.forEach(actionNode => {
                const p1 = this._treeToScreen(actionNode.x, actionNode.y);
                actionNode.children.forEach(childStateNode => {
                    const p2 = this._treeToScreen(childStateNode.x, childStateNode.y);
                    const d = this._distanceToSegment(screenX, screenY, p1.x, p1.y, p2.x, p2.y);
                    if (d <= bestDist) {
                        bestDist = d;
                        hit = { stateNode, actionNode, childStateNode };
                    }
                    walk(childStateNode);
                });
            });
        };
        walk(tree);
        return hit;
    }

    // Returns the TreeNode whose +/- badge contains (screenX, screenY), or null. Only nodes with
    // hasChildren === true have a badge at all (terminal nodes get none).
    _hitTestBadge(screenX, screenY) {
        const tree = this._currentTree();
        if (!tree) return null;
        const zoom = this.viewModel.viewport.zoom;
        const badgeRadius = TREE_VIEW_BADGE_RADIUS * zoom;
        let hit = null;
        TreeLayout.forEach(tree, node => {
            if (!node.hasChildren) return;
            const center = this._badgeCenter(node);
            const p = this._treeToScreen(center.x, center.y);
            const dx = screenX - p.x, dy = screenY - p.y;
            if (dx * dx + dy * dy <= badgeRadius * badgeRadius) hit = node;
        });
        return hit;
    }

    // Public: whether (screenX, screenY) hits a node's expand/collapse badge - lets callers
    // (mainView.js) distinguish "clicked a badge" from "clicked empty tree-canvas space or a
    // node's plain body" without reaching into the private _hitTestBadge() directly.
    hitTestBadge(screenX, screenY) {
        return this._hitTestBadge(screenX, screenY) !== null;
    }

    // Public entry point for mainView.js's mousePressed(). Toggles expansion if the click hit a
    // node's +/- badge (the ONLY way to toggle now - clicking a node's plain body does nothing).
    // Always returns true so the caller knows Tree view fully owns this click.
    handleClick(screenX, screenY) {
        const node = this._hitTestBadge(screenX, screenY);
        if (node) {
            this._toggle(node.pathId);
        }
        return true;
    }

    // Public entry point for mainView.js's mouseMoved(). Returns true if either hover target
    // changed (caller should redraw), following ExpectationView.handleMouseMove's convention.
    // Node-hover (repeated-state ring + badge) and edge-hover (P(s'|s,a) tooltip) are mutually
    // exclusive per mouse position - edge-hover is only checked when no node is under the cursor.
    handleMouseMove(screenX, screenY) {
        const node = this._hitTest(screenX, screenY);
        const newHoveredStateId = (node && node.kind === 'state') ? node.stateId : null;

        const edgeHit = newHoveredStateId === null ? this._hitTestEdge(screenX, screenY) : null;
        const newHoveredEdgeKey = edgeHit ? edgeHit.childStateNode.pathId : null;

        const changed = (newHoveredStateId !== this.hoveredStateId) ||
            (newHoveredEdgeKey !== this._hoveredEdgeKey);

        this.hoveredStateId = newHoveredStateId;
        this.hoveredEdge = edgeHit;
        this._hoveredEdgeKey = newHoveredEdgeKey;
        return changed;
    }

    // The real graph EdgeObj for the currently-hovered outcome edge, or null. Tree nodes carry the
    // real ids they were unrolled from (actionNode.actionId, childStateNode.stateId), so the actual
    // domain edge - not a tree-local approximation - can be looked up directly. Used to drive
    // RightPanel's existing hoveredEdge-based rendering verbatim (see mainView.js's tree branch of
    // mouseMoved()), so the tree's edge-hover panel is pixel-identical to Build mode's own, by
    // construction rather than by re-implementing the layout.
    get realHoveredEdge() {
        if (!this.hoveredEdge) return null;
        const { actionNode, childStateNode } = this.hoveredEdge;
        return this.viewModel.graph.edges.find(e =>
            e.getFromNode().id === actionNode.actionId && e.getToNode().id === childStateNode.stateId
        ) || null;
    }

    _toggle(pathId) {
        // Controller is reached via the global canvasController (same convention every other
        // view in this codebase uses for controller access - e.g. mainView.js's this.controller).
        canvasController.toggleTreeNodeExpanded(pathId);
    }

    // Screen-fixed UI chrome (empty-state prompt, footer caption) - must be called from OUTSIDE
    // any pan/zoom transform (mainView.js calls this after its own outer pop(), same pattern as
    // drawMessages()), so these elements stay pinned regardless of the graph's current pan/zoom.
    drawChrome() {
        const tree = this._currentTree();
        if (!tree) {
            this._drawEmptyPrompt();
        } else {
            this._drawFooterCaption();
        }
    }

    _drawEmptyPrompt() {
        push();
        fill(AppPalette.text.muted);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        textFont(Typography.sans());
        text('Right-click a state to set the start node (s₀) first.', width / 2, height / 2);
        pop();
    }

    _drawEdge(parent, child) {
        const isOutcomeEdge = child.kind === 'state' && child.incomingProbability !== undefined;

        push();
        if (isOutcomeEdge) {
            // Reward-sign color + probability-proportional width, reusing this app's EXISTING
            // Action->State edge-width formula (1 + 4*probability, from mainView.js's own graph
            // rendering) rather than inventing a new one - no default text label anymore, the
            // precise P(s'|s,a) value is revealed on hover instead, via the right panel's edge
            // inspector (RightPanel.renderEdgePanel), not an on-canvas tooltip.
            const rewardColor = child.incomingReward >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative;
            stroke(rewardColor);
            strokeWeight(1 + 4 * child.incomingProbability);
        } else {
            stroke(AppPalette.edge.default);
            strokeWeight(1.5);
        }
        line(parent.x, parent.y, child.x, child.y);
        pop();
    }

    _drawNode(node, opts = {}) {
        const { isCurrent = false, showBadge = true } = opts;
        const isHoveredState = !this._isSimulating() && node.kind === 'state' &&
            this.hoveredStateId !== null && node.stateId === this.hoveredStateId;

        if (isHoveredState) {
            push();
            noFill();
            stroke(AppPalette.accent.yellow);
            strokeWeight(3);
            circle(node.x, node.y, (TREE_VIEW_STATE_RADIUS + 5) * 2);
            pop();
        }

        // Either node kind can carry an uploaded image on its real underlying graph node (tree
        // nodes are ephemeral per-position wrappers; the image lives on the shared real node, so
        // multiple tree positions of a repeated state - and Build mode itself - share one decoded
        // p5.Image rather than each loading their own copy). Build mode allows images on both state
        // and action nodes (mainView.js's drawNodes() and RightPanel's Image section are both
        // generic across node.type), so this mirrors that rather than restricting to states.
        const realNodeId = node.kind === 'state' ? node.stateId : node.actionId;
        const realNode = this.viewModel.graph.getNodeById(realNodeId);
        const hasImage = !!(realNode && realNode.image);
        const halfSize = node.kind === 'state' ? TREE_VIEW_STATE_RADIUS : TREE_VIEW_ACTION_HALF;

        push();
        const baseFill = isCurrent
            ? AppPalette.node.activeInitial
            : (node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action);
        fill(ColorUtils.applyAlpha(baseFill, 220));
        stroke(AppPalette.text.medium);
        strokeWeight(2);
        circle(node.x, node.y, halfSize * 2);
        pop();

        if (hasImage) {
            push();
            imageMode(CENTER);
            if (!realNode._imageObj) {
                realNode._imageObj = loadImage(realNode.image);
            }
            if (realNode._imageObj && realNode._imageObj.width > 0) {
                // Circular clip, matching mainView.js's own Build-mode convention for imaged nodes.
                drawingContext.save();
                drawingContext.beginPath();
                drawingContext.arc(node.x, node.y, halfSize * 0.8, 0, TWO_PI);
                drawingContext.clip();
                const imgSize = halfSize * 1.6;
                image(realNode._imageObj, node.x, node.y, imgSize, imgSize);
                drawingContext.restore();
            }
            pop();

            // Name moves above the node instead of centered inside it, so it doesn't sit on top of
            // the image - matches mainView.js's own Build-mode convention for imaged nodes.
            push();
            noStroke();
            fill(AppPalette.text.black);
            textAlign(CENTER, CENTER);
            textSize(10);
            textFont(Typography.sans());
            text(node.name, node.x, node.y - halfSize - 8);
            pop();
        } else {
            push();
            noStroke();
            fill(ColorUtils.contrastText(node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action));
            textAlign(CENTER, CENTER);
            textSize(10);
            textFont(Typography.sans());
            text(node.name, node.x, node.y);
            pop();
        }

        if (showBadge && node.hasChildren) {
            const center = this._badgeCenter(node);
            push();
            fill(AppPalette.accent.cyan);
            stroke(ColorUtils.contrastText(AppPalette.accent.cyan));
            strokeWeight(1);
            circle(center.x, center.y, TREE_VIEW_BADGE_RADIUS * 2);
            noStroke();
            fill(ColorUtils.contrastText(AppPalette.accent.cyan));
            textAlign(CENTER, CENTER);
            textSize(11);
            textFont(Typography.sans());
            text(node.isCollapsed ? '+' : '−', center.x, center.y - 0.5);
            pop();
        }
    }

    // Small "S2 - 2x" badge drawn once, above the FIRST (shallowest) copy of the hovered state.
    _drawHoverBadge(tree) {
        if (this.hoveredStateId === null) return;
        const copies = [];
        TreeLayout.forEach(tree, node => {
            if (node.kind === 'state' && node.stateId === this.hoveredStateId) copies.push(node);
        });
        if (copies.length === 0) return;
        copies.sort((a, b) => a.stateDepth - b.stateDepth);
        const first = copies[0];

        // An imaged node already has its name label drawn at y - RADIUS - 8 (see _drawNode) -
        // push this badge further up so the two don't overlap.
        const realNode = this.viewModel.graph.getNodeById(first.stateId);
        const hasImage = !!(realNode && realNode.image);
        const yOffset = hasImage ? TREE_VIEW_STATE_RADIUS + 22 : TREE_VIEW_STATE_RADIUS + 8;

        push();
        textAlign(CENTER, BOTTOM);
        textSize(10);
        textFont(Typography.mono());
        fill(AppPalette.accent.yellow);
        noStroke();
        text(`${first.name} — ${copies.length}× in tree`, first.x, first.y - yOffset);
        pop();
    }

    _drawFooterCaption() {
        push();
        fill(AppPalette.text.muted);
        noStroke();
        textAlign(LEFT, BOTTOM);
        textSize(10);
        textFont(Typography.mono());
        text('the MDP unrolled from S₀ (initial state) · larger circles = states · smaller circles = actions',
            16, height - 12);
        pop();
    }
}
