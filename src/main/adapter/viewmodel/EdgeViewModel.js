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

        // Policy log hover-preview takes priority over the live policy - reads the same
        // getPolicyMode()-shaped logic but against the SNAPSHOT, not simulationState itself.
        const previewPolicy = this.interactionViewModel.previewPolicy;
        const previewTimeDependentPolicy = this.interactionViewModel.previewTimeDependentPolicy;
        if (previewTimeDependentPolicy) {
            return this._piTEdgeProbability(previewTimeDependentPolicy, from, to, this.interactionViewModel.piTCursor);
        }
        if (previewPolicy) {
            const previewWeights = this.interactionViewModel.previewPolicyWeights || {};
            const deterministicAction = previewPolicy[from.id];
            if (deterministicAction !== undefined && deterministicAction !== null) {
                return Number(deterministicAction) === Number(to.id) ? 1.0 : null;
            }
            const weights = previewWeights[from.id];
            if (weights) {
                const actions = from.actions || [];
                const sum = actions.reduce((s, a) => s + (weights[a] ?? 0), 0);
                if (sum <= 0) return null;
                return (weights[to.id] ?? 0) / sum;
            }
            return null; // previewed state has no explicit policy entry - uniform, nothing to highlight
        }

        // Time-dependent (π_t) live policy - edge weights follow the Policy π panel's own pager
        // position (interactionViewModel.piTCursor), per the handoff's "π edge weights follow the
        // pager/scrubber."
        if (this.simulationState.isTimeDependent()) {
            return this._piTEdgeProbability(this.simulationState.timeDependentPolicy, from, to, this.interactionViewModel.piTCursor);
        }

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

    // Shared resolution for a time-dependent policy snapshot (live or previewed) at a given t -
    // concrete action gets 1.0 on the matching edge, 'random'/no-entry means uniform across the
    // state's actions (nothing highlighted, mirroring the stationary 'uniform' case above).
    _piTEdgeProbability(timeDependentPolicy, from, to, t) {
        const seq = timeDependentPolicy[from.id];
        if (!seq || seq.length === 0) return null;
        const idx = Math.max(0, Math.min(seq.length - 1, t));
        const action = seq[idx];
        if (action === 'random' || action === null || action === undefined) return null;
        return Number(action) === Number(to.id) ? 1.0 : null;
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
