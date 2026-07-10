// Canvas renderer for the Learning Iteration (unknown:full) quadrant of Values mode: real
// episodic Q-learning with two views (flat MDP Graph, and an episode search Tree) plus UCB
// exploration-bonus halos.
//
// Dispatched from mainView.js's `subView === 'vi'` branch when the resolved quadrant is
// unknown:full (otherwise the existing ValueIterationView draws). Runs inside mainView's
// pan/zoom transform, so everything here is drawn in world coordinates.
//
// Deliberately self-contained: it reads graph.nodes / graph.edges and qLearningState directly
// rather than piggy-backing on Build mode's node/edge draw passes (which are gated by many
// Build/Policy-only branches that don't apply here) or on ValueIterationState's internals.

// --- Layout / style constants ---
const LI_STATE_RADIUS      = 22;
const LI_ACTION_RADIUS     = 15;
const LI_TREE_ROW_HEIGHT   = 96;   // vertical gap between successive tree rows (state <-> action)
const LI_TREE_X_SPACING    = 92;   // horizontal gap between adjacent tree leaves
const LI_TREE_MAX_DEPTH    = 6;    // state-level cap (belt-and-suspenders with cycle detection)
const LI_TREE_NODE_BUDGET  = 320;  // hard cap on rendered tree nodes (runaway-branching guard)

class LearningIterationView {
    constructor(canvasViewModel) {
        this.viewModel = canvasViewModel;
    }

    get qls() { return this.viewModel.qLearningState; }
    get graph() { return this.viewModel.graph; }

    // Purple-family method palette (learningIteration namespace) - theme-aware.
    get colors() { return AppPalette.learningIteration; }
    get accentHex() { return AppPalette.accent.purpleT; }

    draw() {
        const graph = this.graph;
        const qls = this.qls;
        if (!graph || !qls) { this._drawPlaceholder('Learning Iteration'); return; }

        const stateNodes = graph.nodes.filter(n => n.type === 'state');
        if (stateNodes.length === 0) {
            this._drawPlaceholder('Add states to the graph to run learning');
            return;
        }

        if (this.viewModel.learningIterationCanvasView === 'tree') {
            this._drawTreeView();
        } else {
            this._drawGraphView();
        }
    }

    // ============================================================= Graph view

    // Flat MDP at each node's REAL x/y (same framing as Build mode), with the P-unknown
    // convention (`p = ?`) on every action->state edge, real rewards, and a Q̂ = max_a Q(s,a)
    // estimate label under each state.
    _drawGraphView() {
        const graph = this.graph;
        const qls = this.qls;

        // Edges first (behind nodes).
        for (const stateNode of graph.nodes) {
            if (stateNode.type !== 'state' || !stateNode.actions) continue;
            for (const actionId of stateNode.actions) {
                const actionNode = graph.getNodeById(actionId);
                if (!actionNode) continue;
                // state -> action
                this._drawEdge(stateNode.x, stateNode.y, actionNode.x, actionNode.y,
                    stateNode.size, LI_ACTION_RADIUS, ColorUtils.applyAlpha(AppPalette.edge.default, 150), 1.4);
                // action -> next states
                if (actionNode.sas) {
                    actionNode.sas.forEach(({ nextState, reward }) => {
                        const toNode = graph.getNodeById(nextState);
                        if (!toNode) return;
                        this._drawEdge(actionNode.x, actionNode.y, toNode.x, toNode.y,
                            LI_ACTION_RADIUS, toNode.size, ColorUtils.applyAlpha(AppPalette.edge.default, 90), 1);
                        const lx = (actionNode.x + toNode.x) / 2;
                        const ly = (actionNode.y + toNode.y) / 2 - 8;
                        // P is unknown in this quadrant -> "p = ?"; reward is unaffected.
                        mathRenderer.draw(drawingContext, 'p = ?', lx, ly,
                            { color: AppPalette.text.placeholder, em: 9, alignX: 'center', alignY: 'middle' });
                        mathRenderer.draw(drawingContext, `r = ${(reward || 0).toFixed(1)}`, lx, ly + 11,
                            { color: AppPalette.text.medium, em: 9, alignX: 'center', alignY: 'middle' });
                    });
                }
            }
        }

        // Action nodes - rounded squares, matching Build mode / the Value Iteration view.
        for (const node of graph.nodes) {
            if (node.type !== 'action') continue;
            this._drawActionSquare(node.x, node.y, node.name, LI_ACTION_RADIUS,
                ColorUtils.applyAlpha(AppPalette.node.action, 220), 255);
        }

        // State nodes with Q̂ estimate.
        for (const node of graph.nodes) {
            if (node.type !== 'state') continue;
            const actions = node.actions || [];
            const hasData = actions.some(a => qls.getN(node.id, a) > 0);
            this._drawStateCircle(node.x, node.y, node.size, node.name);
            let label;
            if (actions.length === 0) {
                label = 'terminal';
            } else {
                const vHat = Math.max(...actions.map(a => qls.getQ(node.id, a)));
                label = `Q̂ = ${vHat.toFixed(2)}`;
            }
            mathRenderer.draw(drawingContext, label, node.x, node.y + 11,
                { color: hasData ? this.colors.result : AppPalette.text.light, em: 11, alignX: 'center', alignY: 'middle' });
        }
    }

    // ============================================================== Tree view

    _drawTreeView() {
        const qls = this.qls;
        if (!qls.root) { this._drawPlaceholder('Run learning to grow the search tree'); return; }

        const tree = this._buildTree();

        // Root-only placeholder before any episode has run.
        if (qls.episodeCount === 0 || !tree.children || tree.children.length === 0) {
            const anchor = this._treeAnchor();
            this._drawStateCircle(anchor.x, anchor.y, LI_STATE_RADIUS, tree.name || 'S₀');
            mathRenderer.draw(drawingContext, 'Press Run learning to sample episodes',
                anchor.x, anchor.y + LI_STATE_RADIUS + 22,
                { color: AppPalette.text.light, em: 12, alignX: 'center', alignY: 'middle' });
            return;
        }

        this._layoutTree(tree);

        // Edges behind nodes.
        this._forEachTreeNode(tree, node => {
            node.children.forEach(child => {
                const r1 = node.kind === 'state' ? LI_STATE_RADIUS : LI_ACTION_RADIUS;
                const r2 = child.kind === 'state' ? LI_STATE_RADIUS : LI_ACTION_RADIUS;
                const alpha = child.visited === false ? 55 : 130;
                this._drawEdge(node.x, node.y, child.x, child.y, r1, r2,
                    ColorUtils.applyAlpha(AppPalette.edge.default, alpha), 1.2);
            });
        });

        // UCB halos (drawn under the diamonds so the diamond sits on top of the ring center).
        if (qls.algorithm === 'ucb') {
            this._forEachTreeNode(tree, node => {
                if (node.kind === 'state') this._drawUCBHalos(node);
            });
        }

        // Nodes.
        this._forEachTreeNode(tree, node => {
            if (node.kind === 'state') {
                this._drawStateCircle(node.x, node.y, LI_STATE_RADIUS, node.name);
                // Outcome states carry a sampled transition count + mean reward.
                if (node.transN !== undefined) {
                    this._drawNQLabels(node.x, node.y + LI_STATE_RADIUS + 2,
                        node.transN, node.vHat, `r̄=${node.transR.toFixed(1)}`);
                } else {
                    // Root state: just its value estimate.
                    this._drawValueLabel(node.x, node.y + LI_STATE_RADIUS + 4, node.vHat);
                }
            } else {
                const dim = node.visited === false;
                this._drawActionDiamond(node.x, node.y, node.name, LI_ACTION_RADIUS,
                    ColorUtils.applyAlpha(AppPalette.node.action, dim ? 70 : 220), dim ? 120 : 255);
                this._drawNQLabels(node.x, node.y + LI_ACTION_RADIUS + 2, node.N, node.Q, null, dim);
            }
        });
    }

    // Builds the unrolled episode tree from observed transitions only (no speculative expansion:
    // an action's outcomes appear only once transitionCounts has recorded them). Bounded by
    // cycle detection on the ancestor path, a state-depth cap, and a total-node budget.
    _buildTree() {
        const qls = this.qls;
        const graph = this.graph;
        const budget = { n: 0 };

        const buildState = (stateId, depth, row, onPath) => {
            budget.n++;
            const stateNode = graph.getNodeById(stateId);
            const name = (stateNode && stateNode.name) || `S${stateId}`;
            const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
            const vHat = actions.length ? Math.max(...actions.map(a => qls.getQ(stateId, a))) : 0;
            const node = { kind: 'state', stateId, name, depth, row, vHat, children: [] };

            const cyclic = onPath.has(stateId);
            if (cyclic || depth >= LI_TREE_MAX_DEPTH || budget.n >= LI_TREE_NODE_BUDGET) {
                return node; // leaf: stop expanding (cycle back, depth cap, or budget exhausted)
            }

            const nextPath = new Set(onPath);
            nextPath.add(stateId);

            for (const actionId of actions) {
                if (budget.n >= LI_TREE_NODE_BUDGET) break;
                budget.n++;
                const actionNode = graph.getNodeById(actionId);
                const aName = (actionNode && actionNode.name) || `a${actionId}`;
                const N = qls.getN(stateId, actionId);
                const Q = qls.getQ(stateId, actionId);
                const aNode = {
                    kind: 'action', stateId, actionId, name: aName,
                    depth, row: row + 1, N, Q, visited: N > 0, children: []
                };

                if (N > 0 && actionNode && actionNode.sas) {
                    for (const { nextState } of actionNode.sas) {
                        if (budget.n >= LI_TREE_NODE_BUDGET) break;
                        const tN = qls.getTransitionCount(stateId, actionId, nextState);
                        if (tN <= 0) continue; // only actually-sampled outcomes appear
                        const child = buildState(nextState, depth + 1, row + 2, nextPath);
                        child.transN = tN;
                        child.transR = qls.getTransitionMeanReward(stateId, actionId, nextState);
                        aNode.children.push(child);
                    }
                }
                node.children.push(aNode);
            }
            return node;
        };

        return buildState(qls.root.stateId, 0, 0, new Set());
    }

    // Top-down layout: each leaf gets one horizontal slot in left-to-right traversal order;
    // each internal node's x = mean of its children's x; y = row * rowHeight. Anchored so the
    // root sits near the original graph framing.
    _layoutTree(tree) {
        const slot = { i: 0 };
        const assign = (node) => {
            if (!node.children || node.children.length === 0) {
                node._localX = slot.i * LI_TREE_X_SPACING;
                slot.i++;
            } else {
                node.children.forEach(assign);
                const xs = node.children.map(c => c._localX);
                node._localX = xs.reduce((a, b) => a + b, 0) / xs.length;
            }
        };
        assign(tree);

        const anchor = this._treeAnchor();
        const shiftX = anchor.x - tree._localX;
        this._forEachTreeNode(tree, node => {
            node.x = node._localX + shiftX;
            node.y = anchor.y + node.row * LI_TREE_ROW_HEIGHT;
        });
    }

    // World-space anchor for the tree root: horizontally centered over the graph's states, near
    // their top edge, so switching Graph->Tree keeps the tree within the existing viewport frame.
    _treeAnchor() {
        const states = this.graph.nodes.filter(n => n.type === 'state');
        if (states.length === 0) return { x: 0, y: 0 };
        const xs = states.map(s => s.x);
        const ys = states.map(s => s.y);
        const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
        const topY = Math.min(...ys);
        return { x: cx, y: topY - 40 };
    }

    _forEachTreeNode(node, fn) {
        fn(node);
        if (node.children) node.children.forEach(c => this._forEachTreeNode(c, fn));
    }

    // =========================================================== UCB halos

    // For a state decision point with >=2 sibling actions, draw a partial exploration-bonus ring
    // on each VISITED action (angular sweep in [15deg, 360deg], proportional to its UCB bonus
    // normalized by the max sibling bonus). The action argmax(Q+bonus) actually picks gets a FULL
    // ring: yellow when it differs from the plain-greedy argmax(Q) pick ("chose to explore"),
    // green (the same "best" color VI uses) when they agree.
    _drawUCBHalos(stateNode) {
        const qls = this.qls;
        const actionChildren = stateNode.children.filter(c => c.kind === 'action');
        if (actionChildren.length < 2) return;

        const allActionIds = actionChildren.map(c => c.actionId);
        const ucbSel = qls.ucbAction(stateNode.stateId, allActionIds);
        const greedySel = qls.greedyAction(stateNode.stateId, allActionIds);

        // Max finite bonus among visited siblings (normalizer).
        let maxBonus = 0;
        actionChildren.forEach(c => {
            if (!c.visited) return;
            const b = qls.ucbBonus(stateNode.stateId, c.actionId);
            if (isFinite(b) && b > maxBonus) maxBonus = b;
        });

        actionChildren.forEach(c => {
            const isSelected = c.actionId === ucbSel;

            if (c.visited) {
                const bonus = qls.ucbBonus(stateNode.stateId, c.actionId);
                if (isFinite(bonus)) {
                    const frac = maxBonus > 0 ? bonus / maxBonus : 0;
                    // Floor so a tiny nonzero bonus is still visible.
                    const sweep = (Math.PI / 12) + frac * (2 * Math.PI - Math.PI / 12); // [15deg, 360deg]
                    this._drawHaloArc(c.x, c.y, LI_ACTION_RADIUS + 7, sweep,
                        ColorUtils.applyAlpha(this.accentHex, 150), 2);
                }
            }

            if (isSelected) {
                const explored = ucbSel !== greedySel;
                const ringHex = explored ? AppPalette.accent.yellow : AppPalette.reward.positive;
                this._drawHaloArc(c.x, c.y, LI_ACTION_RADIUS + 7, 2 * Math.PI,
                    ColorUtils.applyAlpha(ringHex, 235), 3);
                // Soft glow for the explore pick.
                if (explored) {
                    this._drawHaloArc(c.x, c.y, LI_ACTION_RADIUS + 11, 2 * Math.PI,
                        ColorUtils.applyAlpha(ringHex, 70), 2);
                }
            }
        });
    }

    // Partial/full ring via the raw canvas context (same low-level drawingContext idiom VI uses
    // for custom stroke effects). Starts at the top (-90deg) and sweeps clockwise.
    _drawHaloArc(cx, cy, radius, sweepRad, strokeColor, weight) {
        const ctx = drawingContext;
        push();
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + sweepRad, false);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = weight;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
        pop();
    }

    // ============================================================ Primitives

    _drawStateCircle(x, y, r, name) {
        const accent = color(this.accentHex);
        push();
        fill(red(accent), green(accent), blue(accent), 40);
        stroke(AppPalette.text.medium);
        strokeWeight(2);
        ellipse(x, y, r * 2, r * 2);
        pop();

        push();
        fill(AppPalette.text.nearBlack);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(13);
        textFont(Typography.sans());
        text(name, x, y - 5);
        pop();
    }

    // Tree mode only - the diamond is a deliberate decision-tree convention (state/action/outcome
    // shape distinction), kept intentionally different from the flat Graph view's node shapes.
    _drawActionDiamond(x, y, name, r, fillColor, strokeAlpha) {
        push();
        fill(fillColor);
        // Theme-aware stroke (was a hardcoded rgb(60,60,60)) - text.medium is the same token
        // _drawStateCircle already uses for its node outline in this file.
        stroke(ColorUtils.applyAlpha(AppPalette.text.medium, strokeAlpha));
        strokeWeight(1.5);
        beginShape();
        vertex(x, y - r);
        vertex(x + r, y);
        vertex(x, y + r);
        vertex(x - r, y);
        endShape(CLOSE);

        // Label color picked for contrast against the diamond's actual fill (was a hardcoded
        // white, unreadable against light fills/themes) rather than assumed white.
        fill(ColorUtils.applyAlpha(ColorUtils.contrastText(fillColor), strokeAlpha));
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(9);
        textFont(Typography.sans());
        text(name, x, y);
        pop();
    }

    // Graph mode's action-node shape - a rounded square, matching Build mode
    // (mainView.js's `rect(node.x - node.size, ..., 8)`) and the Value Iteration view's action
    // node convention, so the flat MDP graph looks the same across Build/Policy/VI/Graph mode.
    // Tree mode intentionally keeps the diamond above - do not reuse this for Tree mode.
    _drawActionSquare(x, y, name, r, fillColor, strokeAlpha) {
        push();
        fill(fillColor);
        stroke(ColorUtils.applyAlpha(AppPalette.text.medium, strokeAlpha));
        strokeWeight(1.5);
        rect(x - r, y - r, r * 2, r * 2, 4);

        fill(ColorUtils.applyAlpha(ColorUtils.contrastText(fillColor), strokeAlpha));
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(9);
        textFont(Typography.sans());
        text(name, x, y);
        pop();
    }

    _drawEdge(x1, y1, x2, y2, r1, r2, edgeColor, weight) {
        const dx = x2 - x1, dy = y2 - y1;
        const angle = atan2(dy, dx);
        const sx = x1 + r1 * cos(angle), sy = y1 + r1 * sin(angle);
        const ex = x2 - r2 * cos(angle), ey = y2 - r2 * sin(angle);
        push();
        stroke(edgeColor);
        strokeWeight(weight);
        line(sx, sy, ex, ey);
        const a = 6;
        fill(edgeColor);
        noStroke();
        triangle(ex, ey,
            ex - a * cos(angle - 0.4), ey - a * sin(angle - 0.4),
            ex - a * cos(angle + 0.4), ey - a * sin(angle + 0.4));
        pop();
    }

    // "N=3  Q=1.24" style label block below a tree node (optional extra chip, e.g. mean reward).
    _drawNQLabels(x, y, n, q, extra, dim = false) {
        const alpha = dim ? 130 : 255;
        push();
        noStroke();
        textAlign(CENTER, TOP);
        textFont(Typography.mono());
        textSize(9);
        fill(red(color(AppPalette.text.medium)), green(color(AppPalette.text.medium)), blue(color(AppPalette.text.medium)), alpha);
        text(`N=${n}`, x, y);
        const qHex = color(dim ? AppPalette.text.light : this.colors.result);
        fill(red(qHex), green(qHex), blue(qHex), alpha);
        text(`Q=${q.toFixed(2)}`, x, y + 11);
        if (extra) {
            fill(red(color(AppPalette.text.light)), green(color(AppPalette.text.light)), blue(color(AppPalette.text.light)), alpha);
            text(extra, x, y + 22);
        }
        pop();
    }

    _drawValueLabel(x, y, v) {
        mathRenderer.draw(drawingContext, `Q̂ = ${v.toFixed(2)}`, x, y,
            { color: this.colors.result, em: 11, alignX: 'center', alignY: 'top' });
    }

    _drawPlaceholder(msg) {
        const panelW = 272;
        push();
        resetMatrix();
        fill(AppPalette.text.light);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(18);
        textFont(Typography.sans());
        text(msg, (windowWidth - panelW) / 2, (windowHeight - 40) / 2);
        pop();
    }
}
