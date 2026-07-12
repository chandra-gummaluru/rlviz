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

class TreeView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
        this.hoveredStateId = null;
        this._usableWidth = 900; // corrected by the first real draw(usableWidth) call
    }

    // Builds the current tree (recomputed every draw - same "no cache" convention already used
    // by ExpectationViewModel.computeLayout() elsewhere in this codebase; MDP graphs in this app
    // are small enough that this is cheap).
    _currentTree() {
        const startNode = this.viewModel.startNode;
        if (!startNode) return null;
        return TreeLayout.build(this.viewModel.graph, startNode.id, this.viewModel.treeExpanded, 1, this._usableWidth);
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

        // Edges first (so nodes draw on top of their own incoming edge).
        TreeLayout.forEach(tree, node => {
            node.children.forEach(child => this._drawEdge(node, child));
        });
        // Nodes second.
        TreeLayout.forEach(tree, node => this._drawNode(node));
        this._drawHoverBadge(tree);

        pop();
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
        if (node.kind === 'state') {
            const off = TREE_VIEW_STATE_RADIUS * 0.75;
            return { x: node.x + off, y: node.y + off };
        }
        return { x: node.x + TREE_VIEW_ACTION_HALF, y: node.y + TREE_VIEW_ACTION_HALF };
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
            if (node.kind === 'state') {
                if (dx * dx + dy * dy <= halfSize * halfSize) hit = node;
            } else {
                if (Math.abs(dx) <= halfSize && Math.abs(dy) <= halfSize) hit = node;
            }
        });
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

    // Public entry point for mainView.js's mouseMoved(). Returns true if the hovered state
    // changed (caller should redraw), following ExpectationView.handleMouseMove's convention.
    handleMouseMove(screenX, screenY) {
        const node = this._hitTest(screenX, screenY);
        const newHoveredStateId = (node && node.kind === 'state') ? node.stateId : null;
        const changed = newHoveredStateId !== this.hoveredStateId;
        this.hoveredStateId = newHoveredStateId;
        return changed;
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
        push();
        stroke(AppPalette.edge.default);
        strokeWeight(1.5);
        line(parent.x, parent.y, child.x, child.y);
        pop();

        // Outcome edges (action -> state) carry a "p 0.8 . +5" label; plain state->action edges
        // (child.kind === 'action') don't have a probability/reward to show.
        if (child.kind === 'state' && child.incomingProbability !== undefined) {
            const midX = (parent.x + child.x) / 2;
            const midY = (parent.y + child.y) / 2;
            push();
            textAlign(CENTER, CENTER);
            textSize(9);
            textFont(Typography.mono());
            noStroke();
            const pStr = `p ${child.incomingProbability.toFixed(2).replace(/0+$/, '').replace(/\.$/, '.0')} · `;
            const rewardColor = child.incomingReward >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative;
            const rStr = (child.incomingReward >= 0 ? '+' : '') + child.incomingReward.toFixed(0);
            const pWidth = textWidth(pStr);
            fill(AppPalette.text.muted);
            text(pStr, midX - pWidth / 2, midY - 8);
            fill(rewardColor);
            text(rStr, midX - pWidth / 2 + pWidth + textWidth(rStr) / 2, midY - 8);
            pop();
        }
    }

    _drawNode(node) {
        const isHoveredState = node.kind === 'state' && this.hoveredStateId !== null &&
            node.stateId === this.hoveredStateId;

        if (isHoveredState) {
            push();
            noFill();
            stroke(AppPalette.accent.yellow);
            strokeWeight(3);
            circle(node.x, node.y, (TREE_VIEW_STATE_RADIUS + 5) * 2);
            pop();
        }

        push();
        if (node.kind === 'state') {
            fill(ColorUtils.applyAlpha(AppPalette.node.state, 220));
            stroke(AppPalette.text.medium);
            strokeWeight(2);
            circle(node.x, node.y, TREE_VIEW_STATE_RADIUS * 2);
        } else {
            fill(ColorUtils.applyAlpha(AppPalette.node.action, 220));
            stroke(AppPalette.text.medium);
            strokeWeight(2);
            rect(node.x - TREE_VIEW_ACTION_HALF, node.y - TREE_VIEW_ACTION_HALF,
                TREE_VIEW_ACTION_HALF * 2, TREE_VIEW_ACTION_HALF * 2, 6);
        }
        noStroke();
        fill(ColorUtils.contrastText(node.kind === 'state' ? AppPalette.node.state : AppPalette.node.action));
        textAlign(CENTER, CENTER);
        textSize(10);
        textFont(Typography.sans());
        text(node.name, node.x, node.y);
        pop();

        if (node.hasChildren) {
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

        push();
        textAlign(CENTER, BOTTOM);
        textSize(10);
        textFont(Typography.mono());
        fill(AppPalette.accent.yellow);
        noStroke();
        text(`${first.name} — ${copies.length}× in tree`, first.x, first.y - TREE_VIEW_STATE_RADIUS - 8);
        pop();
    }

    _drawFooterCaption() {
        push();
        fill(AppPalette.text.muted);
        noStroke();
        textAlign(LEFT, BOTTOM);
        textSize(10);
        textFont(Typography.mono());
        text('the MDP unrolled from S₀ (initial state) · circles = states · squares = actions',
            16, height - 12);
        pop();
    }
}
