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
     * @returns {Array} visited - Array of {id, type, name} objects representing the path
     */
    generate(startNode, maxSteps = 50, policy = {}) {
        if (!startNode) {
            throw new Error('Start node is required');
        }
        if (startNode.type !== 'state') {
            throw new Error('Start node must be a state node');
        }

        const visited = [];
        let current = startNode;
        let stepCount = 0;

        // Add start node
        visited.push(this.createVisitedEntry(current));

        // Generate path by alternating between state and action nodes
        while (stepCount < maxSteps && visited.length < maxSteps) {
            stepCount++;

            if (current.type === 'state') {
                // From state: follow selected policy action when present; otherwise pick random action
                const nextAction = this.selectActionForPolicy(current, policy);
                if (!nextAction) {
                    break;  // Terminal state
                }
                visited.push(this.createVisitedEntry(nextAction));
                current = nextAction;

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

    /**
     * Select an action from a state using a deterministic policy when available.
     * Falls back to a random valid action (one with transitions) if the policy
     * action is missing or has no outgoing transitions.
     */
    selectActionForPolicy(stateNode, policy = {}) {
        if (!stateNode.actions || stateNode.actions.length === 0) {
            return null;
        }

        const selectedActionId = policy[stateNode.id];
        if (selectedActionId !== undefined && selectedActionId !== null && selectedActionId !== '') {
            const normalizedId = Number(selectedActionId);
            const matchingActionId = stateNode.actions.find(actionId => Number(actionId) === normalizedId);
            if (matchingActionId !== undefined) {
                const actionNode = this.graph.nodes.find(n => n.type === 'action' && n.id === matchingActionId);
                if (actionNode && actionNode.sas && actionNode.sas.length > 0) return actionNode;
            }
        }

        return this.selectRandomAction(stateNode);
    }

    /**
     * Select a random action from a state node's available actions.
     * Only considers actions that have at least one outgoing transition,
     * so the trace never ends stranded on an action node.
     */
    selectRandomAction(stateNode) {
        if (!stateNode.actions || stateNode.actions.length === 0) {
            return null;  // No actions available
        }

        // Filter to action nodes that have at least one transition
        const validActions = stateNode.actions
            .map(actionId => this.graph.nodes.find(n => n.type === 'action' && n.id === actionId))
            .filter(n => n && n.sas && n.sas.length > 0);

        if (validActions.length === 0) {
            return null;  // Terminal state — no reachable next state
        }

        return validActions[Math.floor(Math.random() * validActions.length)];
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
