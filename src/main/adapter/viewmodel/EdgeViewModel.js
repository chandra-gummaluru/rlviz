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
                return AppPalette.edge.highlighted;
            }
        }

        if (this.selectionViewModel.selectedEdge === this.edge) {
            return AppPalette.edge.highlighted;
        }

        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();

        if (from.type === 'action' && to.type === 'state') {
            return this._getRewardColor();
        }

        return AppPalette.edge.default;
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
            return AppPalette.reward.zero;
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
        // Saturation-based: low intensity = desaturated gray-green, high = vivid green
        // HSL: hue=140, saturation scales 10%→90%, lightness=38%
        const saturation = Math.round(10 + 80 * intensity); // 10% to 90%
        return `hsl(140, ${saturation}%, 38%)`;
    }

    _interpolateToRed(intensity) {
        // Saturation-based: low intensity = desaturated gray-red, high = vivid red
        // HSL: hue=0, saturation scales 10%→90%, lightness=40%
        const saturation = Math.round(10 + 80 * intensity); // 10% to 90%
        return `hsl(0, ${saturation}%, 40%)`;
    }
}
