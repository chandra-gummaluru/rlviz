// Interactor for creating edges
class CreateEdgeInteractor extends CreateEdgeInputBoundary {
    constructor(graph, commandHistory, outputBoundary) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.outputBoundary = outputBoundary;
    }

    execute(inputData) {
        // Get nodes by ID
        const fromNode = this.graph.getNodeById(inputData.fromNodeId);
        const toNode = this.graph.getNodeById(inputData.toNodeId);

        // Validate nodes exist
        if (!fromNode || !toNode) {
            this.outputBoundary.presentError('Invalid node IDs');
            return;
        }

        // Validate connection is allowed (different types only)
        if (!fromNode.canConnectTo(toNode)) {
            this.outputBoundary.presentError('Cannot connect nodes of same type');
            return;
        }

        // Create edge
        const edge = new EdgeObj(fromNode, toNode, inputData.probability, inputData.reward);

        // Validate edge
        if (!edge.isValid()) {
            this.outputBoundary.presentError('Invalid edge');
            return;
        }

        // Update adjacency lists based on edge direction
        if (fromNode.type === 'state' && toNode.type === 'action') {
            // State → Action edge: Just mark that this action is available from this state
            fromNode.addAction(toNode.id);
            // Do NOT add to action's sas[] - no transition probability needed

        } else if (fromNode.type === 'action' && toNode.type === 'state') {
            // Action → State edge: This is a transition with probability
            // Add transition to action's sas[] array (this will be renormalized)
            fromNode.addSAS(
                `${fromNode.id}->${toNode.id}`,
                edge.getProbability(),
                toNode.id,
                edge.getReward()
            );
            // Note: Do NOT add to toNode's actions[] - that's for actions available FROM toNode
        }

        // Create and execute command through command history
        const command = new AddEdgeCommand(this.graph, edge);
        this.commandHistory.execute(command);

        // Present success
        this.outputBoundary.presentEdgeCreated(edge);
    }
}
