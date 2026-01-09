class EdgeObj {
    constructor(fromNode, toNode, probability, reward) {
        this.fromNode = fromNode;
        this.toNode = toNode;
        this.probability = this.clampProbability(probability);
        this.reward = this.sanitizeReward(reward);
    }

    clampProbability(prob) {
        const p = parseFloat(prob);
        if (isNaN(p)) return 0.5;
        return Math.max(0, Math.min(1, p));
    }

    sanitizeReward(reward) {
        const r = parseFloat(reward);
        return isNaN(r) ? 0 : r;
    }

    getFromNode() {
        return this.fromNode;
    }

    getToNode() {
        return this.toNode;
    }

    getProbability() {
        // Return the probability from the source of truth (ActionNode.sas[])
        // instead of the cached value, so renormalization is reflected
        let actionNode, stateNode;

        if (this.fromNode.type === 'action') {
            actionNode = this.fromNode;
            stateNode = this.toNode;
        } else {
            actionNode = this.toNode;
            stateNode = this.fromNode;
        }

        // Find the transition in the action's sas array
        const transition = actionNode.sas.find(t => t.nextState === stateNode.id);

        // If found, return the renormalized probability from the action node
        // Otherwise fall back to the cached value
        return transition ? transition.probability : this.probability;
    }

    getReward() {
        // Return the reward from the source of truth (ActionNode.sas[])
        // instead of the cached value, for consistency
        let actionNode, stateNode;

        if (this.fromNode.type === 'action') {
            actionNode = this.fromNode;
            stateNode = this.toNode;
        } else {
            actionNode = this.toNode;
            stateNode = this.fromNode;
        }

        // Find the transition in the action's sas array
        const transition = actionNode.sas.find(t => t.nextState === stateNode.id);

        // If found, return the reward from the action node
        // Otherwise fall back to the cached value
        return transition ? transition.reward : this.reward;
    }

    setProbability(newProbability) {
        this.probability = this.clampProbability(newProbability);

    }

    setReward(newReward) {
        this.reward = this.sanitizeReward(newReward);
    }

    isValid() {
        if (!this.fromNode || !this.toNode) return false;
        if (this.fromNode.type === this.toNode.type) return false;
        return true;
    }
}
