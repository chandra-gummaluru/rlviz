// Base Command class for undo/redo pattern
class Command {
    execute() {
        throw new Error('Command.execute() must be implemented');
    }

    undo() {
        throw new Error('Command.undo() must be implemented');
    }

    getDescription() {
        return 'Command';
    }
}

// Command to add a node
class AddNodeCommand extends Command {
    constructor(graph, node) {
        super();
        this.graph = graph;
        this.node = node;
    }

    execute() {
        this.graph.addNode(this.node);
    }

    undo() {
        this.graph.removeNode(this.node.id);
    }

    getDescription() {
        return `Add ${this.node.type} node: ${this.node.name}`;
    }
}

// Command to delete a node
class DeleteNodeCommand extends Command {
    constructor(graph, node) {
        super();
        this.graph = graph;
        this.node = node;
        // Store all edges connected to this node for restoration
        this.deletedEdges = graph.edges.filter(edge =>
            edge.getFromNode() === node || edge.getToNode() === node
        );
    }

    execute() {
        this.graph.removeNode(this.node.id);
    }

    undo() {
        // Restore the node
        this.graph.addNode(this.node);
        // Restore all connected edges
        this.deletedEdges.forEach(edge => {
            this.graph.addEdge(edge);
        });
    }

    getDescription() {
        return `Delete ${this.node.type} node: ${this.node.name}`;
    }
}

// Command to move a node
class MoveNodeCommand extends Command {
    constructor(node, oldX, oldY, newX, newY) {
        super();
        this.node = node;
        this.oldX = oldX;
        this.oldY = oldY;
        this.newX = newX;
        this.newY = newY;
    }

    execute() {
        this.node.setPosition(this.newX, this.newY);
    }

    undo() {
        this.node.setPosition(this.oldX, this.oldY);
    }

    getDescription() {
        return `Move node: ${this.node.name}`;
    }
}

// Command to add an edge
class AddEdgeCommand extends Command {
    constructor(graph, edge) {
        super();
        this.graph = graph;
        this.edge = edge;
    }

    execute() {
        this.graph.addEdge(this.edge);
    }

    undo() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();
        this.graph.removeEdge(from.id, to.id);
    }

    getDescription() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();
        return `Add edge: ${from.name} → ${to.name}`;
    }
}

// Command to delete an edge
class DeleteEdgeCommand extends Command {
    constructor(graph, edge) {
        super();
        this.graph = graph;
        this.edge = edge;
    }

    execute() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        // Handle based on edge direction
        if (from.type === 'state' && to.type === 'action') {
            // State → Action: Remove action from state's actions list
            from.delAction(to.id);

        } else if (from.type === 'action' && to.type === 'state') {
            // Action → State: Remove transition from action's sas list
            from.delSAS(
                `${from.id}->${to.id}`,
                this.edge.getProbability(),
                to.id
            );
        }

        // Remove edge from graph
        this.graph.removeEdge(from.id, to.id);
    }

    undo() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        // Restore edge to graph
        this.graph.addEdge(this.edge);

        // Restore based on edge direction
        if (from.type === 'state' && to.type === 'action') {
            // State → Action: Restore action to state's actions list
            from.addAction(to.id);

        } else if (from.type === 'action' && to.type === 'state') {
            // Action → State: Restore transition to action's sas list
            from.addSAS(
                `${from.id}->${to.id}`,
                this.edge.getProbability(),
                to.id,
                this.edge.getReward()
            );
        }
    }

    getDescription() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();
        return `Delete edge: ${from.name} → ${to.name}`;
    }
}

// Command to add a text label
class AddTextLabelCommand extends Command {
    constructor(graph, textLabel) {
        super();
        this.graph = graph;
        this.textLabel = textLabel;
    }

    execute() {
        this.graph.addTextLabel(this.textLabel);
    }

    undo() {
        this.graph.removeTextLabel(this.textLabel.id);
    }

    getDescription() {
        return `Add text: ${this.textLabel.text}`;
    }
}

// Command to delete a text label
class DeleteTextLabelCommand extends Command {
    constructor(graph, textLabel) {
        super();
        this.graph = graph;
        this.textLabel = textLabel;
    }

    execute() {
        this.graph.removeTextLabel(this.textLabel.id);
    }

    undo() {
        this.graph.addTextLabel(this.textLabel);
    }

    getDescription() {
        return `Delete text: ${this.textLabel.text}`;
    }
}

// Command to rename a node
class RenameNodeCommand extends Command {
    constructor(node, oldName, newName) {
        super();
        this.node = node;
        this.oldName = oldName;
        this.newName = newName;
    }

    execute() {
        this.node.setName(this.newName);
    }

    undo() {
        this.node.setName(this.oldName);
    }

    getDescription() {
        return `Rename: ${this.oldName} → ${this.newName}`;
    }
}

// Command to move a text label
class MoveTextLabelCommand extends Command {
    constructor(textLabel, oldX, oldY, newX, newY) {
        super();
        this.textLabel = textLabel;
        this.oldX = oldX;
        this.oldY = oldY;
        this.newX = newX;
        this.newY = newY;
    }

    execute() {
        this.textLabel.setPosition(this.newX, this.newY);
    }

    undo() {
        this.textLabel.setPosition(this.oldX, this.oldY);
    }

    getDescription() {
        return `Move text: ${this.textLabel.text}`;
    }
}

// Command to resize a node
class ResizeNodeCommand extends Command {
    constructor(node, oldSize, newSize) {
        super();
        this.node = node;
        this.oldSize = oldSize;
        this.newSize = newSize;
    }

    execute() {
        this.node.setSize(this.newSize);
    }

    undo() {
        this.node.setSize(this.oldSize);
    }

    getDescription() {
        return `Resize node: ${this.node.name}`;
    }
}
