// Interactor for setting node images
class SetImageInteractor extends SetImageInputBoundary {
    constructor(graph, commandHistory, outputBoundary) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        // Get node by ID
        const node = this.graph.getNodeById(inputData.nodeId);

        if (!node) {
            this.outputBoundary.presentError('Node not found');
            return;
        }

        // Store old image (may be undefined)
        const oldImage = node.image;

        // Create and execute command through command history
        const command = new SetImageCommand(node, oldImage, inputData.imageData);
        this.commandHistory.execute(command);

        // Present success
        this.outputBoundary.presentImageSet(node);
    }
}
