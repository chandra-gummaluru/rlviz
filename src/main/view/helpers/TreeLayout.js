// Pure JS, no p5 calls - unrolls the domain Graph into a search tree rooted at a given state,
// bounded by a default depth cap unless a node's pathId is in the caller-supplied expandedSet.
// A state can legitimately appear at multiple tree positions (this is the feature's whole point,
// per the design spec) - node identity in the tree is the pathId, not the state id.
class TreeLayout {
    // graph: the domain Graph. startStateId: root state id (may be null/undefined - returns
    // null). expandedSet: Set<pathId> of nodes whose children should be shown beyond
    // defaultDepth. defaultDepth: state-hop depth cap for the default (unexpanded) render.
    static build(graph, startStateId, expandedSet, defaultDepth = 1, usableWidth = 900) {
        // Note: use an explicit null/undefined check, not a truthiness check - node ids in this
        // codebase start at 0 (see createNodeInteractor.js), and `!0` is true in JS, which would
        // wrongly reject the very first state a user creates.
        if (startStateId === null || startStateId === undefined || !graph) return null;
        const startNode = graph.getNodeById(startStateId);
        if (!startNode) return null;

        const buildState = (stateId, pathId, stateDepth) => {
            const stateNode = graph.getNodeById(stateId);
            const name = stateNode ? stateNode.name : `S${stateId}`;
            const actions = (stateNode && stateNode.actions) ? stateNode.actions : [];
            const node = {
                kind: 'state', pathId, stateId, actionId: null, name,
                stateDepth, hasChildren: actions.length > 0, isCollapsed: false,
                children: [], x: 0, y: 0
            };

            const withinDefault = stateDepth < defaultDepth;
            const manuallyExpanded = expandedSet.has(pathId);
            if (!node.hasChildren || !(withinDefault || manuallyExpanded)) {
                node.isCollapsed = node.hasChildren && node.children.length === 0;
                return node;
            }

            actions.forEach((actionId, ai) => {
                const actionPathId = `${pathId}.a${ai}`;
                const actionNode = graph.getNodeById(actionId);
                const aName = actionNode ? actionNode.name : `a${ai}`;
                const sas = (actionNode && actionNode.sas) ? actionNode.sas : [];
                const actionTreeNode = {
                    kind: 'action', pathId: actionPathId, stateId: null, actionId,
                    name: aName, stateDepth, hasChildren: sas.length > 0, isCollapsed: false,
                    children: [], x: 0, y: 0
                };

                const actionWithinDefault = stateDepth < defaultDepth;
                const actionManuallyExpanded = expandedSet.has(actionPathId);
                if (actionTreeNode.hasChildren && (actionWithinDefault || actionManuallyExpanded)) {
                    sas.forEach((transition, ti) => {
                        const childPathId = `${actionPathId}.${ti}`;
                        const childState = buildState(transition.nextState, childPathId, stateDepth + 1);
                        childState.incomingProbability = transition.probability;
                        childState.incomingReward = transition.reward;
                        actionTreeNode.children.push(childState);
                    });
                } else {
                    actionTreeNode.isCollapsed = actionTreeNode.hasChildren;
                }
                node.children.push(actionTreeNode);
            });
            node.isCollapsed = false; // state itself was expanded (has children now)
            return node;
        };

        const root = buildState(startStateId, 's0', 0);
        TreeLayout._assignPositions(root, usableWidth);
        return root;
    }

    // Leaves get sequential vertical slots in left-to-right traversal order; each internal node's
    // slot = mean of its children's slots (unchanged from v1 - same "leaves first, average up"
    // approach learningIterationView.js's _layoutTree uses).
    //
    // Horizontal (x) position differs by column in v2: columns 0-2 (root state, its actions, the
    // resulting states - exactly what a defaultDepth=1 tree shows before any expansion) partition
    // usableWidth into thirds, each node centered in its third. Columns 3+ (only reachable by
    // manually expanding past the default view) fall back to fixed LEVEL_SPACING, continuing on
    // from column 2's x position - expansion never re-partitions the canvas, only re-rooting
    // (which already clears treeExpanded) resets back to the fresh thirds view.
    static _assignPositions(root, usableWidth) {
        if (!root) return;
        let slotCounter = 0;
        const assignSlot = (node, level) => {
            node._level = level;
            if (!node.children || node.children.length === 0) {
                node._slot = slotCounter;
                slotCounter++;
            } else {
                node.children.forEach(c => assignSlot(c, level + 1));
                const slots = node.children.map(c => c._slot);
                node._slot = slots.reduce((a, b) => a + b, 0) / slots.length;
            }
        };
        assignSlot(root, 0);

        const thirdWidth = usableWidth / 3;
        const col2X = thirdWidth * 2.5; // center of the third third
        const xForLevel = (level) => {
            if (level <= 2) return thirdWidth * (level + 0.5);
            return col2X + (level - 2) * TreeLayout.LEVEL_SPACING;
        };

        TreeLayout.forEach(root, node => {
            node.x = xForLevel(node._level);
            node.y = node._slot * TreeLayout.SLOT_SPACING;
        });
    }

    static forEach(node, fn) {
        if (!node) return;
        fn(node);
        node.children.forEach(c => TreeLayout.forEach(c, fn));
    }
}

TreeLayout.LEVEL_SPACING = 110; // horizontal gap between adjacent tree columns (state<->action)
TreeLayout.SLOT_SPACING  = 64;  // vertical gap between adjacent sibling leaves
