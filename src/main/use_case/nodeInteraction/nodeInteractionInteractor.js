// Interactor for node interactions (finding and moving nodes)
class NodeInteractionInteractor extends NodeInteractionInputBoundary {
    constructor(graph, outputBoundary) {
        super();
        this.graph = graph;
        this.outputBoundary = outputBoundary;
    }

    findNodeAtPosition(inputData) {
        // Search from end to beginning (topmost nodes first)
        for (let i = this.graph.nodes.length - 1; i >= 0; i--) {
            const node = this.graph.nodes[i];
            if (node.contains(inputData.x, inputData.y)) {
                this.outputBoundary.presentNodeFound(node);
                return;
            }
        }

        // No node found
        this.outputBoundary.presentNodeNotFound();
    }

    moveNode(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);

        if (node) {
            node.setPosition(inputData.newX, inputData.newY);
            this.outputBoundary.presentNodeMoved(node);
        } else {
            this.outputBoundary.presentError('Node not found');
        }
    }
}
