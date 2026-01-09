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

    serialize() {
        return {
            nodes: this.nodes.map(node => ({
                id: node.id,
                type: node.type,
                x: node.x,
                y: node.y,
                ...(node.type === 'state'
                    ? { actions: node.actions }
                    : { transitions: node.sas.map(s => ({
                        stateId: s.nextState,
                        probability: s.probability,
                        reward: s.reward || 0
                    }))}
                )
            }))
        };
    }

    deserialize(data) {
        this.nodes = [];
        this.edges = [];

        data.nodes.forEach(nodeData => {
            let node;
            if (nodeData.type === 'state') {
                node = new StateNode(nodeData.id.toString(), nodeData.x, nodeData.y, 30);
                node.actions = nodeData.actions || [];
            } else {
                node = new ActionNode(nodeData.id.toString(), nodeData.x, nodeData.y, 30);
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
