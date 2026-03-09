// Node presentation view model
class NodeViewModel {
    constructor(node, selectionViewModel, interactionViewModel, simulationState) {
        this.node = node;
        this.selectionViewModel = selectionViewModel;
        this.interactionViewModel = interactionViewModel;
        this.simulationState = simulationState;
    }

    get color() {
        // Simulation active: highlight current node only
        if (this.interactionViewModel.mode === 'simulate' &&
            this.simulationState &&
            this.simulationState.replayInitialized) {
            const currentNode = this.simulationState.currentNode;
            if (currentNode && currentNode.id === this.node.id) {
                return '#FF9800'; // Orange
            }
        }

        // Editor mode: existing colors
        if (this.selectionViewModel.selectedNode === this.node) {
            return '#FFC107'; // Yellow for selected
        }

        if (this.interactionViewModel.heldNode === this.node) {
            return '#9CCC65'; // Light green for held
        }

        return this.node.type === 'state' ? '#BDBDBD' : '#424242';
    }

    get isVisible() {
        if (this.interactionViewModel.mode === 'simulate' &&
            this.simulationState &&
            this.simulationState.replayInitialized) {
            return this.simulationState.isNodeVisible(this.node.id);
        }
        return true;
    }

    get size() {
        return this.node.size;
    }

    get position() {
        return { x: this.node.x, y: this.node.y };
    }

    get name() {
        return this.node.name;
    }

    get type() {
        return this.node.type;
    }
}
