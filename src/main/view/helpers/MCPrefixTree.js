// MCPrefixTree — builds a prefix (trie) tree from MC rollouts for the MC View.
//
// Each tree node represents a unique trajectory prefix (path from root to that node).
// The same graph node can appear multiple times in the tree at different paths.
// Node identity is the full pathKey ("42/7/13"), not the graph node id.
//
// Pure JS, no p5 calls.
class MCPrefixTree {
    // Build a prefix tree from rollouts up to depth currentT (number of completed transitions).
    //
    // rollouts: array of rollout objects from ExpectationState.rollouts
    //   Each rollout: { trace, rewards, utilities, numSteps }
    //   trace: alternating [state, action, state, action, state, ...]
    //          trace[0] = root state, trace[1] = first action, trace[2] = second state, ...
    //   utilities: array of G(t) values indexed by t (0..numSteps)
    //
    // graph: domain Graph object — used to fetch .image from graph nodes
    //
    // currentT: integer depth (number of state→action→state transitions to include)
    //
    // Returns: { root, edges, totalRollouts, currentT, maxDepth }
    //   or null if rollouts is empty or null.
    static build(rollouts, graph, currentT) {
        if (!rollouts || rollouts.length === 0) return null;

        const totalRollouts = rollouts.length;

        // --- Step 1: Build tree nodes -----------------------------------------------
        // We use a flat map from pathKey → treeNode for fast lookup during insertion.
        const nodeMap = new Map(); // pathKey → treeNode

        // Helper: get or create a tree node at a given path position.
        // traceEntry: { id, type, name } from the rollout trace
        // pathKey:    "/" -joined string of all node ids on the path up to here
        // depth:      integer depth from root (0 = root state)
        // parentKey:  pathKey of the parent node (null for root)
        const getOrCreate = (traceEntry, pathKey, depth, parentKey) => {
            if (nodeMap.has(pathKey)) {
                return nodeMap.get(pathKey);
            }
            const graphNode = graph ? graph.getNodeById(traceEntry.id) : null;
            const treeNode = {
                id: pathKey,
                nodeId: traceEntry.id,
                type: traceEntry.type,
                name: traceEntry.name,
                image: (graphNode && graphNode.image) ? graphNode.image : null,
                count: 0,
                children: [],
                // Layout (filled in by _assignPositions):
                x: 0,
                y: 0,
                depth: depth,
                // Leaf stats (filled in after tree build):
                isLeaf: false,
                meanReturn: null,
                minReturn: null,
                maxReturn: null,
                isTruncated: false,
                // Internal bookkeeping:
                _parentKey: parentKey,
                _rolloutReturns: [], // returns for rollouts whose path ends exactly here
            };
            nodeMap.set(pathKey, treeNode);

            // Wire up parent → child relationship
            if (parentKey !== null) {
                const parent = nodeMap.get(parentKey);
                if (parent && !parent.children.find(c => c.id === pathKey)) {
                    parent.children.push(treeNode);
                }
            }
            return treeNode;
        };

        // --- Step 2: Walk each rollout, inserting up to currentT transitions ---------
        // Maximum trace depth to include: 2*currentT+1 entries (indices 0..2*currentT).
        // depth in the tree corresponds to trace index:
        //   trace[0] → depth 0 (root state)
        //   trace[1] → depth 1 (first action)
        //   trace[2] → depth 2 (second state)
        //   ...
        //   trace[2*currentT] → depth 2*currentT (state after currentT transitions)
        const maxTraceIdx = 2 * currentT; // inclusive

        for (const rollout of rollouts) {
            const { trace, utilities, numSteps } = rollout;
            if (!trace || trace.length === 0) continue;

            // How far this rollout actually goes (may be shorter than currentT)
            const rolloutMaxIdx = Math.min(maxTraceIdx, trace.length - 1);

            // Walk the path, collecting pathKey as we go
            let pathKey = String(trace[0].id);
            for (let idx = 0; idx <= rolloutMaxIdx; idx++) {
                const entry = trace[idx];
                if (!entry) break;

                if (idx > 0) {
                    // Extend pathKey by this node's id
                    pathKey = pathKey + '/' + String(entry.id);
                }

                const parentKey = idx === 0 ? null : (() => {
                    // Parent path key is everything before the last "/" segment
                    const lastSlash = pathKey.lastIndexOf('/');
                    return lastSlash >= 0 ? pathKey.slice(0, lastSlash) : null;
                })();

                const node = getOrCreate(entry, pathKey, idx, parentKey);
                node.count++;

                // If this is the deepest node in this rollout's path, record its return
                const isDeepestForRollout = idx === rolloutMaxIdx;
                if (isDeepestForRollout) {
                    // Return at currentT (or the rollout's actual end, whichever is earlier)
                    const effectiveT = Math.min(currentT, numSteps);
                    const g = utilities ? utilities[effectiveT] : null;
                    node._rolloutReturns.push({ g, truncated: numSteps < currentT ? false : true });
                }
            }
        }

        // --- Step 3: Mark leaves and compute leaf stats ----------------------------
        let maxDepth = 0;
        for (const [, node] of nodeMap) {
            if (node.depth > maxDepth) maxDepth = node.depth;
            if (node.children.length === 0) {
                node.isLeaf = true;
                const returns = node._rolloutReturns;
                if (returns.length > 0) {
                    const vals = returns.map(r => r.g).filter(v => v !== null && v !== undefined);
                    if (vals.length > 0) {
                        node.meanReturn = vals.reduce((a, b) => a + b, 0) / vals.length;
                        node.minReturn = Math.min(...vals);
                        node.maxReturn = Math.max(...vals);
                    }
                    // Truncated if any rollout ended early (numSteps < currentT)
                    node.isTruncated = returns.some(r => r.truncated);
                }
            }
        }

        // Root is the first state in the first rollout
        const rootPathKey = String(rollouts[0].trace[0].id);
        const root = nodeMap.get(rootPathKey);
        if (!root) return null;

        // --- Step 4: Assign layout positions ---------------------------------------
        MCPrefixTree._assignPositions(root);

        // --- Step 5: Build edge list -----------------------------------------------
        const edges = [];
        for (const [, node] of nodeMap) {
            for (const child of node.children) {
                edges.push({
                    from: node,
                    to: child,
                    count: child.count,
                    share: child.count / totalRollouts,
                });
            }
        }

        return { root, edges, totalRollouts, currentT, maxDepth };
    }

    // Assign x/y layout positions to all tree nodes.
    // Leaves get sequential y slots (SLOT_SPACING apart) in left-to-right (DFS) order.
    // Internal nodes sit at the mean y of their children.
    // x = depth * COLUMN_GAP.
    static _assignPositions(root) {
        if (!root) return;

        let slotCounter = 0;

        const assignSlots = (node) => {
            if (!node.children || node.children.length === 0) {
                node._slot = slotCounter;
                slotCounter++;
            } else {
                node.children.forEach(c => assignSlots(c));
                const slots = node.children.map(c => c._slot);
                node._slot = slots.reduce((a, b) => a + b, 0) / slots.length;
            }
        };

        assignSlots(root);

        // Convert slots to pixel coordinates
        MCPrefixTree._forEach(root, node => {
            node.x = node.depth * MCPrefixTree.COLUMN_GAP;
            node.y = node._slot * MCPrefixTree.SLOT_SPACING;
        });
    }

    // Depth-first traversal of the tree, calling fn(node) for every node.
    static _forEach(node, fn) {
        if (!node) return;
        fn(node);
        node.children.forEach(c => MCPrefixTree._forEach(c, fn));
    }
}

MCPrefixTree.COLUMN_GAP    = 180; // horizontal distance between adjacent depth columns
MCPrefixTree.SLOT_SPACING  =  80; // vertical distance between adjacent leaf slots
