// Interactor for resizing nodes
class ResizeNodeInteractor extends ResizeNodeInputBoundary {
    constructor(graph, commandHistory, outputBoundary) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.outputBoundary = outputBoundary;
    }

    resizeNode(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);

        if (!node) {
            this.outputBoundary.presentError('Node not found');
            return;
        }

        // Create and execute the resize command through command history
        const command = new ResizeNodeCommand(node, inputData.oldSize, inputData.newSize);
        this.commandHistory.execute(command);

        this.outputBoundary.presentNodeResized(node);
    }
}
