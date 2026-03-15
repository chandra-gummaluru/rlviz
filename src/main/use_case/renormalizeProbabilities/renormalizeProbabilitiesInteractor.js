// Interactor for renormalizing probabilities across all action nodes
class RenormalizeProbabilitiesInteractor extends RenormalizeProbabilitiesInputBoundary {
    constructor(graph, commandHistory, presenter) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    execute(inputData) {
        // Find all action nodes
        const actionNodes = this.graph.nodes.filter(node => node.type === 'action');

        if (actionNodes.length === 0) {
            this.presenter.presentNoActionsFound();
            return;
        }

        // Count how many have transitions
        let renormalizedCount = actionNodes.filter(node => node.sas && node.sas.length > 0).length;

        // Create and execute command through command history
        const command = new RenormalizeCommand(this.graph);
        this.commandHistory.execute(command);

        // Present success
        this.presenter.presentRenormalized(renormalizedCount, actionNodes.length);
    }
}
