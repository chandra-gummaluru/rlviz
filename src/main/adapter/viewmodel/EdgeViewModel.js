// Edge presentation view model
class EdgeViewModel {
    constructor(edge, graph, selectionViewModel, interactionViewModel, simulationState) {
        this.edge = edge;
        this.graph = graph;
        this.selectionViewModel = selectionViewModel;
        this.interactionViewModel = interactionViewModel;
        this.simulationState = simulationState;
    }

    get color() {
        // Simulation active: highlight current edge
        if (this.interactionViewModel.mode === 'simulate' &&
            this.simulationState &&
            this.simulationState.highlightedEdge) {
            const from = this.edge.getFromNode();
            const to = this.edge.getToNode();
            if (this.simulationState.isEdgeHighlighted(from.id, to.id)) {
                return '#FF5722'; // Red for highlighted edge
            }
        }

        // Selected edge: keep highlight color
        if (this.selectionViewModel.selectedEdge === this.edge) {
            return '#FF5722';
        }

        // Get reward-based color for Action -> State edges
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        if (from.type === 'action' && to.type === 'state') {
            return this._getRewardColor();
        }

        // Default color for State -> Action edges
        return '#666666';
    }

    get isBidirectional() {
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        return this.graph.edges.some(e =>
            e.getFromNode().id === to.id && e.getToNode().id === from.id
        );
    }

    _getRewardColor() {
        const reward = this.edge.getReward();
        const { minReward, maxReward } = this._getRewardRange();

        if (reward === 0) {
            return '#000000'; // Black for zero reward
        }

        if (reward > 0) {
            const intensity = maxReward === 0 ? 0 : reward / maxReward;
            return this._interpolateToGreen(intensity);
        } else {
            const intensity = minReward === 0 ? 0 : Math.abs(reward / minReward);
            return this._interpolateToRed(intensity);
        }
    }

    _getRewardRange() {
        // Find min and max rewards across all Action→State edges
        const actionStateEdges = this.graph.edges.filter(e =>
            e.getFromNode().type === 'action' && e.getToNode().type === 'state'
        );

        if (actionStateEdges.length === 0) {
            return { minReward: 0, maxReward: 0 };
        }

        let minReward = Infinity;
        let maxReward = -Infinity;

        actionStateEdges.forEach(e => {
            const r = e.getReward();
            minReward = Math.min(minReward, r);
            maxReward = Math.max(maxReward, r);
        });

        // Handle case where all rewards are the same
        if (minReward === maxReward) {
            return { minReward: minReward, maxReward: minReward };
        }

        return { minReward, maxReward };
    }

    _interpolateToGreen(intensity) {
        // Interpolate from black (#000000) to dark green (#006400)
        // Dark green RGB: (0, 100, 0)
        const r = 0;
        const g = Math.round(100 * intensity); // 0 to 100
        const b = 0;
        return `rgb(${r}, ${g}, ${b})`;
    }

    _interpolateToRed(intensity) {
        // Interpolate from black (#000000) to dark red (#8B0000)
        // Dark red RGB: (139, 0, 0)
        const r = Math.round(139 * intensity); // 0 to 139
        const g = 0;
        const b = 0;
        return `rgb(${r}, ${g}, ${b})`;
    }
}
