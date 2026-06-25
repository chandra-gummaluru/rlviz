class CreateNodeInteractor extends CreateNodeInputBoundary {
    constructor(graph, outputBoundary) {
        super();
        this.graph = graph;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        try {
            // Compute next available ID from current graph state
            const id = this.graph.nodes.length > 0
                ? Math.max(...this.graph.nodes.map(n => n.id)) + 1
                : 0;
            const name = inputData.type === 'state' ? `S${id}` : `A${id}`;
            const size = 30;

            // Create node based on type
            let node;
            if (inputData.type === 'state') {
                node = new StateNode(name, inputData.x, inputData.y, size);
            } else if (inputData.type === 'action') {
                node = new ActionNode(name, inputData.x, inputData.y, size);
            } else {
                throw new Error('Invalid node type');
            }

            // Assign ID and add directly to graph (no undo/redo)
            node.id = id;
            this.graph.addNode(node);

            // Present success
            this.outputBoundary.presentNodeCreated(node);
        } catch (error) {
            this.outputBoundary.presentError(error.message);
        }
    }
}
