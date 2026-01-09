// Interactor for creating nodes
class CreateNodeInteractor extends CreateNodeInputBoundary {
    constructor(graph, outputBoundary) {
        super();
        this.graph = graph;
        this.outputBoundary = outputBoundary;
        this.nextNodeId = 0;
    }

    execute(inputData) {
        try {
            // Generate ID and name
            const id = this.nextNodeId++;
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

            // Assign ID and add to graph
            node.id = id;
            this.graph.addNode(node);

            // Present success
            this.outputBoundary.presentNodeCreated(node);
        } catch (error) {
            this.outputBoundary.presentError(error.message);
        }
    }
}
