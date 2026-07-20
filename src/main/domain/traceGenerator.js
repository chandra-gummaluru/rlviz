// Generates a valid execution trace through the MDP graph
class TraceGenerator {
    constructor(graph) {
        this.graph = graph;
    }

    /**
     * Generate a valid trace starting from a given state node
     * @param {Object} startNode - The starting state node
     * @param {number} maxSteps - Maximum number of nodes in the trace
     * @param {Object} policy - Optional stateId -> actionId map. Missing entries use random actions.
     * @param {Object} policyWeights - Optional stateId -> {actionId: rawWeight} map for explicit
     *   weighted-random policies. Consulted only for states with no deterministic policy entry.
     * @param {Object|null} timeDependentPolicy - Optional stateId -> array[t] of (actionId |
     *   'random') for a time-dependent (π_t) policy - a plain snapshot object, not a
     *   SimulationState reference, matching how policy/policyWeights are already passed in. When
     *   present, overrides policy/policyWeights for any state with an entry at the current elapsed
     *   decision count; states with no entry fall through to policy/policyWeights unchanged.
     * @returns {Array} visited - Array of {id, type, name} objects representing the path
     */
    generate(startNode, maxSteps = 50, policy = {}, policyWeights = {}, timeDependentPolicy = null) {
        if (!startNode) {
            throw new Error('Start node is required');
        }
        if (startNode.type !== 'state') {
            throw new Error('Start node must be a state node');
        }

        const visited = [];
        let current = startNode;
        let stepCount = 0;
        let elapsedT = 0; // increments once per DECISION (state node picking an action), matching
                           // π_t's own elapsed-time indexing - not the raw node-visit count below.

        // Add start node
        visited.push(this.createVisitedEntry(current));

        // Generate path by alternating between state and action nodes
        while (stepCount < maxSteps && visited.length < maxSteps) {
            stepCount++;

            if (current.type === 'state') {
                // From state: follow selected policy action when present; otherwise sample by
                // the state's weighted policy if configured, else uniform random.
                const piTAction = timeDependentPolicy
                    ? this._resolvePiTAction(timeDependentPolicy, current.id, elapsedT)
                    : null;
                const nextAction = this.selectActionForPolicy(current, policy, policyWeights, piTAction);
                if (!nextAction) {
                    break;  // Terminal state
                }
                visited.push(this.createVisitedEntry(nextAction));
                current = nextAction;
                elapsedT++;

            } else if (current.type === 'action') {
                // From action: pick random next state (weighted by probability)
                const nextState = this.selectRandomNextState(current);
                if (!nextState) {
                    break;  // Terminal action
                }
                visited.push(this.createVisitedEntry(nextState));
                current = nextState;
            }
        }

        return visited;
    }

    // Clamped read from a plain {stateId -> array} time-dependent policy snapshot - null if the
    // state has no entry (selectActionForPolicy() then falls through to policy/policyWeights).
    _resolvePiTAction(timeDependentPolicy, stateId, elapsedT) {
        const seq = timeDependentPolicy[stateId];
        if (!seq || seq.length === 0) return null;
        const idx = Math.max(0, Math.min(seq.length - 1, elapsedT));
        return seq[idx];
    }

    /**
     * Select an action from a state using a deterministic policy when available, else a
     * weighted-random policy when configured, else uniform random. `piTAction` (a concrete
     * actionId, the 'random' sentinel, or null), when non-null, overrides policy/policyWeights
     * entirely for this call - see the time-dependent-policy param on generate() above.
     */
    selectActionForPolicy(stateNode, policy = {}, policyWeights = {}, piTAction = null) {
        if (!stateNode.actions || stateNode.actions.length === 0) {
            return null;
        }

        if (piTAction !== null && piTAction !== undefined) {
            if (piTAction === 'random') {
                return this.selectRandomAction(stateNode);
            }
            const normalizedId = Number(piTAction);
            const matchingActionId = stateNode.actions.find(actionId => Number(actionId) === normalizedId);
            if (matchingActionId !== undefined) {
                const actionNode = this.graph.nodes.find(n => n.type === 'action' && n.id === matchingActionId);
                if (actionNode) return actionNode;
            }
            // Stale/invalid time-dependent entry (e.g. action deleted since it was set) - fall
            // through to the stationary resolution below rather than crashing or dead-ending.
        }

        const selectedActionId = policy[stateNode.id];
        if (selectedActionId !== undefined && selectedActionId !== null && selectedActionId !== '') {
            const normalizedId = Number(selectedActionId);
            const matchingActionId = stateNode.actions.find(actionId => Number(actionId) === normalizedId);
            if (matchingActionId !== undefined) {
                const actionNode = this.graph.nodes.find(n => n.type === 'action' && n.id === matchingActionId);
                if (actionNode) return actionNode;
            }
        }

        return this.selectRandomAction(stateNode, policyWeights[stateNode.id]);
    }

    /**
     * Select a random action from a state node's available actions. When `weights` (a
     * {actionId: rawWeight} map, not necessarily normalized) is provided, samples using the
     * same weighted cumulative-threshold technique as selectRandomNextState below - actions no
     * longer present on the state are silently dropped rather than sampled or crashing. Falls
     * back to uniform-by-index when weights is absent/empty/all-invalid.
     */
    selectRandomAction(stateNode, weights) {
        if (!stateNode.actions || stateNode.actions.length === 0) {
            return null;  // No actions available
        }

        if (weights) {
            const validIds = new Set(stateNode.actions.map(Number));
            const cumulative = [];
            let sum = 0;
            Object.entries(weights).forEach(([actionId, weight]) => {
                const numericId = Number(actionId);
                if (!validIds.has(numericId) || weight <= 0) return;
                sum += weight;
                cumulative.push({ actionId: numericId, threshold: sum });
            });

            if (cumulative.length > 0 && sum > 0) {
                const rand = Math.random() * sum;
                const picked = cumulative.find(entry => rand <= entry.threshold) || cumulative[cumulative.length - 1];
                const actionNode = this.graph.nodes.find(n => n.type === 'action' && n.id === picked.actionId);
                if (actionNode) return actionNode;
            }
        }

        // Uniform fallback
        const randomIndex = Math.floor(Math.random() * stateNode.actions.length);
        const actionId = stateNode.actions[randomIndex];
        const actionNode = this.graph.nodes.find(n => n.type === 'action' && n.id === actionId);
        return actionNode;
    }

    /**
     * Select a random next state from an action node's transitions
     * Weighted by transition probabilities
     */
    selectRandomNextState(actionNode) {
        if (!actionNode.sas || actionNode.sas.length === 0) {
            return null;  // No transitions available
        }

        // Build cumulative probability array
        const transitions = actionNode.sas;
        const cumulative = [];
        let sum = 0;

        for (const transition of transitions) {
            sum += transition.probability;
            cumulative.push({
                nextStateId: transition.nextState,
                threshold: sum,
                probability: transition.probability
            });
        }

        // Select weighted random
        const rand = Math.random() * sum;
        for (const entry of cumulative) {
            if (rand <= entry.threshold) {
                const stateNode = this.graph.getNodeById(entry.nextStateId);
                return stateNode;
            }
        }

        // Fallback: return first transition (shouldn't happen)
        const fallbackStateId = transitions[0].nextState;
        return this.graph.getNodeById(fallbackStateId);
    }

    /**
     * Create a visited entry from a node
     */
    createVisitedEntry(node) {
        return {
            id: node.id,
            type: node.type,
            name: node.getName ? node.getName() : node.name,
            meta: {}  // Can add probability, reward later
        };
    }

    /**
     * Validate that a trace is valid for the current graph
     */
    validateTrace(visited) {
        if (!visited || visited.length === 0) {
            return { valid: false, error: 'Empty trace' };
        }

        if (visited[0].type !== 'state') {
            return { valid: false, error: 'First node must be a state' };
        }

        // Check each consecutive pair has a valid edge
        for (let i = 0; i < visited.length - 1; i++) {
            const current = visited[i];
            const next = visited[i + 1];

            // Check type alternation
            if (current.type === next.type) {
                return {
                    valid: false,
                    error: `Invalid sequence at index ${i}: ${current.type} -> ${next.type}`
                };
            }

            // Check edge exists
            const hasEdge = this.checkEdgeExists(current.id, next.id);
            if (!hasEdge) {
                return {
                    valid: false,
                    error: `Missing edge: ${current.id} -> ${next.id}`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Check if an edge exists between two nodes
     */
    checkEdgeExists(fromId, toId) {
        return this.graph.edges.some(edge => {
            const from = edge.getFromNode();
            const to = edge.getToNode();
            return from.id === fromId && to.id === toId;
        });
    }
}
