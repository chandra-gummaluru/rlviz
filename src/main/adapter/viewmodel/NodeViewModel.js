// Node presentation view model
class NodeViewModel {
    constructor(node, selectionViewModel, interactionViewModel, simulationState) {
        this.node = node;
        this.selectionViewModel = selectionViewModel;
        this.interactionViewModel = interactionViewModel;
        this.simulationState = simulationState;
    }

    get color() {
        // Simulation active: highlight current node only (Build/Policy - Policy's canvas is
        // identical to Build's, only the right panel differs)
        if ((this.interactionViewModel.mode === 'build' || this.interactionViewModel.mode === 'policy') &&
            this.simulationState &&
            this.simulationState.replayInitialized) {
            const currentNode = this.simulationState.currentNode;
            if (currentNode && currentNode.id === this.node.id) {
                return AppPalette.node.activeInitial;
            }
        }

        if (this.selectionViewModel.selectedNode === this.node) {
            return AppPalette.node.selected;
        }

        if (this.interactionViewModel.heldNode === this.node) {
            return AppPalette.node.held;
        }

        return this.node.type === 'state' ? AppPalette.node.state : AppPalette.node.action;
    }

    get isVisible() {
        if ((this.interactionViewModel.mode === 'build' || this.interactionViewModel.mode === 'policy') &&
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
