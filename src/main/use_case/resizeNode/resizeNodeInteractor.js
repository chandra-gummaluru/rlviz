// Interactor for resizing nodes or text labels (font size)
class ResizeNodeInteractor extends ResizeNodeInputBoundary {
    constructor(graph, commandHistory, outputBoundary) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.outputBoundary = outputBoundary;
    }

    resizeNode(inputData) {
        if (inputData.textLabelId !== null && inputData.textLabelId !== undefined) {
            const textLabel = this.graph.getTextLabelById(inputData.textLabelId);
            if (!textLabel) {
                this.outputBoundary.presentError('Text label not found');
                return;
            }
            const command = new ResizeTextLabelCommand(textLabel, inputData.oldSize, inputData.newSize);
            this.commandHistory.execute(command);
            this.outputBoundary.presentNodeResized(textLabel);
            return;
        }

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
