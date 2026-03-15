// Interactor for creating nodes
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
            console.log('Created node:', node.name, 'with ID:', node.id, 'at position:', node.x, node.y);
            this.graph.addNode(node);

            console.log('Added to graph. Total nodes:', this.graph.nodes.length);
            console.log('Graph nodes:', this.graph.nodes.map(n => ({ id: n.id, name: n.name })));

            // Present success
            this.outputBoundary.presentNodeCreated(node);
        } catch (error) {
            this.outputBoundary.presentError(error.message);
        }
    }
}
