// Interactor for RenameNode use case
class RenameNodeInteractor extends RenameNodeInputBoundary {
    constructor(graph, commandHistory, presenter) {
        super();
        this.graph = graph;
        this.commandHistory = commandHistory;
        this.presenter = presenter;
    }

    requestRename(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) {
            this.presenter.presentError('Node not found');
            return;
        }

        // Request user input (View will handle prompt)
        this.presenter.presentRenameRequested(node, node.getName());
    }

    executeRename(inputData) {
        const node = this.graph.getNodeById(inputData.nodeId);
        if (!node) {
            this.presenter.presentError('Node not found');
            return;
        }

        // Business rule: validate name
        if (!inputData.newName || inputData.newName.trim() === '') {
            this.presenter.presentError('Name cannot be empty');
            return;
        }

        const oldName = node.getName();

        // Don't create command if name didn't change
        if (oldName === inputData.newName) {
            this.presenter.presentRenamed(node);
            return;
        }

        const command = new RenameNodeCommand(node, oldName, inputData.newName);
        this.commandHistory.execute(command);

        this.presenter.presentRenamed(node);
    }
}
