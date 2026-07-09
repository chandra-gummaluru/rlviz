const EXPECTATION_TOTAL_RUNS = 128;

class ExpectationState {
    constructor() {
        this.rollouts = [];
        this.currentT = 0;
        this.maxT = 0;
        this.displayRuns = 16;  // how many of the 128 to show in the grid
        this.maxSteps = 100;
        this.gamma = 0.9;
        this.computed = false;
        this.policyFallbacks = [];
    }

    setRollouts(rollouts) {
        this.rollouts = rollouts;
        this.maxT = rollouts.reduce((max, r) => Math.max(max, r.numSteps), 0);
        this.computed = true;
        this.currentT = 0;
        this.policyFallbacks = [];
    }

    setGamma(gamma) {
        if (!isFinite(gamma) || gamma < 0 || gamma > 1) return;
        this.gamma = gamma;
        for (const rollout of this.rollouts) {
            rollout.utilities = this._computeUtilities(rollout.rewards, gamma);
        }
    }

    resetData() {
        this.rollouts = [];
        this.currentT = 0;
        this.maxT = 0;
        this.computed = false;
        this.policyFallbacks = [];
    }

    getDisplaySlice() {
        return this.rollouts.slice(0, this.displayRuns);
    }

    _computeUtilities(rewards, gamma) {
        const utilities = [0];
        for (let k = 0; k < rewards.length; k++) {
            utilities.push(utilities[k] + Math.pow(gamma, k) * rewards[k]);
        }
        return utilities;
    }

    _getUtility(rollout, t) {
        // t may be fractional while the scrubber is being dragged (integer once released);
        // floor it since utilities[] is indexed per whole step.
        const effectiveT = Math.floor(Math.min(t, rollout.numSteps));
        return rollout.utilities[effectiveT];
    }

    getAllUtilitiesAtT(t) {
        return this.rollouts.map(r => this._getUtility(r, t));
    }

    getDisplayUtilitiesAtT(t) {
        return this.getDisplaySlice().map(r => this._getUtility(r, t));
    }

    getMeanAtT(t) {
        if (!this.computed || this.rollouts.length === 0) return null;
        const vals = this.getAllUtilitiesAtT(t);
        return vals.reduce((a, b) => a + b, 0) / vals.length;
    }

    getSigmaAtT(t) {
        if (!this.computed || this.rollouts.length === 0) return null;
        const vals = this.getAllUtilitiesAtT(t);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
    }

    getMeansOverTime() {
        if (!this.computed) return [];
        return Array.from({ length: this.maxT + 1 }, (_, t) => this.getMeanAtT(t));
    }

    // Per-state Monte Carlo value estimate: for every visit to a state across all rollouts, the
    // discounted return-to-go from that visit onward, averaged. Aggregates already-collected
    // per-step rewards (no new sampling). For the start state, this is equivalent to (and
    // consistent with) getMeanAtT(maxT)'s existing estimate.
    getPerStateMeans() {
        if (!this.computed || this.rollouts.length === 0) return {};

        const sums = {};
        const counts = {};

        this.rollouts.forEach(rollout => {
            const { trace, rewards, numSteps } = rollout;

            const returnToGo = new Array(numSteps + 1).fill(0);
            for (let i = numSteps - 1; i >= 0; i--) {
                returnToGo[i] = rewards[i] + this.gamma * returnToGo[i + 1];
            }

            for (let j = 0; j <= numSteps; j++) {
                const stateEntry = trace[2 * j];
                if (!stateEntry) continue;
                const stateId = stateEntry.id;
                sums[stateId] = (sums[stateId] || 0) + returnToGo[j];
                counts[stateId] = (counts[stateId] || 0) + 1;
            }
        });

        const means = {};
        Object.keys(sums).forEach(stateId => {
            means[stateId] = sums[stateId] / counts[stateId];
        });
        return means;
    }

    getSigmasOverTime() {
        if (!this.computed) return [];
        return Array.from({ length: this.maxT + 1 }, (_, t) => this.getSigmaAtT(t));
    }
}
