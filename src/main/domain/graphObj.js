class Graph {
    constructor() {
        this.nodes = [];
        this.edges = [];
        this.textLabels = [];
    }

    addNode(node) {
        this.nodes.push(node);
    }

    addEdge(edge) {
        this.edges.push(edge);
    }

    addTextLabel(label) {
        this.textLabels.push(label);
    }

    removeNode(nodeId) {
        const nodeToRemove = this.getNodeById(nodeId);
        if (!nodeToRemove) return;

        // Clean up adjacency lists in other nodes
        if (nodeToRemove.type === 'state') {
            // Removing a state node: clean up references in action nodes' sas lists
            this.nodes.forEach(node => {
                if (node.type === 'action') {
                    // Remove all transitions to this state
                    node.sas = node.sas.filter(transition => transition.nextState !== nodeId);
                    // Renormalize probabilities after removal
                    node.renormalizeProbabilities();
                }
            });
        } else if (nodeToRemove.type === 'action') {
            // Removing an action node: clean up references in state nodes' actions lists
            this.nodes.forEach(node => {
                if (node.type === 'state') {
                    // Remove this action from the state's actions list
                    node.delAction(nodeId);
                }
            });
        }

        // Remove the node itself
        this.nodes = this.nodes.filter(n => n.id !== nodeId);

        // Remove all edges connected to this node
        this.edges = this.edges.filter(e =>
            e.getFromNode().id !== nodeId && e.getToNode().id !== nodeId
        );
    }

    removeEdge(fromId, toId) {
        this.edges = this.edges.filter(e =>
            !(e.getFromNode().id === fromId && e.getToNode().id === toId)
        );
    }

    removeTextLabel(labelId) {
        this.textLabels = this.textLabels.filter(l => l.id !== labelId);
    }

    getNodeById(id) {
        return this.nodes.find(n => n.id === id);
    }

    getTextLabelById(id) {
        return this.textLabels.find(l => l.id === id);
    }

    getUnnormalizedActionNodes(tolerance = 0.001) {
        return this.nodes.filter(n => {
            if (n.type !== 'action' || n.sas.length === 0) return false;
            const total = n.getTotalProbability();
            return Math.abs(total - 1.0) > tolerance;
        });
    }

    buildTransitionMatrix() {
        // Get all state nodes sorted by ID
        const states = this.nodes.filter(n => n.type === 'state').sort((a, b) => a.id - b.id);
        const actions = this.nodes.filter(n => n.type === 'action').sort((a, b) => a.id - b.id);

        // Create state ID to index mapping
        const stateIdToIndex = {};
        states.forEach((state, index) => {
            stateIdToIndex[state.id] = index;
        });

        // Create action ID to index mapping
        const actionIdToIndex = {};
        actions.forEach((action, index) => {
            actionIdToIndex[action.id] = index;
        });

        // Build transition probability matrix: P[s][a][s'] = probability
        const transitionMatrix = [];
        const rewardMatrix = [];

        states.forEach((fromState, fromIndex) => {
            transitionMatrix[fromIndex] = [];
            rewardMatrix[fromIndex] = [];

            actions.forEach((action, actionIndex) => {
                transitionMatrix[fromIndex][actionIndex] = [];
                rewardMatrix[fromIndex][actionIndex] = [];

                // Initialize all transitions to 0
                states.forEach((toState, toIndex) => {
                    transitionMatrix[fromIndex][actionIndex][toIndex] = 0;
                    rewardMatrix[fromIndex][actionIndex][toIndex] = 0;
                });

                // Check if this state connects to this action
                if (fromState.actions.includes(action.id)) {
                    // Fill in the actual transition probabilities and rewards
                    action.sas.forEach(transition => {
                        const toStateIndex = stateIdToIndex[transition.nextState];
                        if (toStateIndex !== undefined) {
                            transitionMatrix[fromIndex][actionIndex][toStateIndex] = transition.probability;
                            rewardMatrix[fromIndex][actionIndex][toStateIndex] = transition.reward || 0;
                        }
                    });
                }
            });
        });

        return {
            transitionMatrix: transitionMatrix,
            rewardMatrix: rewardMatrix,
            stateIds: states.map(s => s.id),
            stateNames: states.map(s => s.name),
            actionIds: actions.map(a => a.id),
            actionNames: actions.map(a => a.name)
        };
    }

    serialize(includePositions = false) {
        console.log('Graph.serialize() called, includePositions:', includePositions, 'nodes:', this.nodes.length, 'edges:', this.edges.length);
        const matrices = this.buildTransitionMatrix();

        const serialized = {
            nodes: this.nodes.map(node => ({
                id: node.id,
                type: node.type,
                name: node.name,
                ...(includePositions ? { x: node.x, y: node.y, size: node.size } : {}),
                ...(node.type === 'state'
                    ? { actions: node.actions }
                    : { transitions: node.sas.map(s => ({
                        stateId: s.nextState,
                        probability: s.probability,
                        reward: s.reward || 0
                    }))}
                )
            })),
            transitionMatrix: {
                states: matrices.stateIds,
                stateNames: matrices.stateNames,
                actions: matrices.actionIds,
                actionNames: matrices.actionNames,
                P: matrices.transitionMatrix,
                R: matrices.rewardMatrix,
                description: "P[s][a][s'] = probability of transitioning from state s to state s' via action a. R[s][a][s'] = reward for that transition."
            }
        };

        // Include edges and text labels for full export (re-importable)
        if (includePositions) {
            serialized.edges = this.edges.map(edge => ({
                from: edge.getFromNode().id,
                to: edge.getToNode().id,
                probability: edge.getProbability(),
                reward: edge.getReward(),
                labelOffset: edge.labelOffset
            }));

            if (this.textLabels && this.textLabels.length > 0) {
                serialized.textLabels = this.textLabels.map(label => ({
                    id: label.id,
                    text: label.text,
                    x: label.x,
                    y: label.y,
                    fontSize: label.fontSize || 16
                }));
            }
        }

        console.log('Graph.serialize() completed, result keys:', Object.keys(serialized));
        return serialized;
    }

    deserialize(data) {
        this.nodes = [];
        this.edges = [];

        data.nodes.forEach(nodeData => {
            let node;
            const size = nodeData.size !== undefined ? nodeData.size : 30;
            if (nodeData.type === 'state') {
                node = new StateNode(nodeData.id.toString(), nodeData.x, nodeData.y, size);
                node.actions = nodeData.actions || [];
            } else {
                node = new ActionNode(nodeData.id.toString(), nodeData.x, nodeData.y, size);
                if (nodeData.transitions) {
                    nodeData.transitions.forEach(t => {
                        node.addSAS(`${nodeData.id}->${t.stateId}`, t.probability, t.stateId, t.reward);
                    });
                }
            }
            node.id = nodeData.id;
            this.nodes.push(node);
        });
    }
}
