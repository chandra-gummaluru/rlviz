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
        // Simulation active: highlight current edge (Build/Policy - Policy's canvas is
        // identical to Build's, only the right panel differs)
        if ((this.interactionViewModel.mode === 'build' || this.interactionViewModel.mode === 'policy') &&
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

        if (this.policyEdgeProbability !== null) {
            return AppPalette.edge.policy;
        }

        return AppPalette.edge.default;
    }

    // Probability (0-1) this state->action edge represents in the current policy, or null when
    // not applicable (Values mode, non state->action edge, or the state's policy is untouched
    // "uniform"). Build and Policy modes only. Deterministic policies return 1.0 for the chosen
    // action and null for its siblings; weighted policies return each action's normalized share.
    get policyEdgeProbability() {
        if (this.interactionViewModel.mode !== 'build' && this.interactionViewModel.mode !== 'policy') return null;
        if (!this.simulationState) return null;
        const from = this.edge.getFromNode();
        const to = this.edge.getToNode();
        if (from.type !== 'state' || to.type !== 'action') return null;

        const policyMode = this.simulationState.getPolicyMode(from.id);
        if (policyMode === 'deterministic') {
            return this.simulationState.getPolicyAction(from.id) === to.id ? 1.0 : null;
        }
        if (policyMode === 'weighted') {
            const probs = this.simulationState._normalizedProbsForState(from.id, from.actions || []);
            if (!probs) return null;
            return probs.get(Number(to.id)) ?? null;
        }
        return null;
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
