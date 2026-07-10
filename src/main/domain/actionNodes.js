class ActionNode extends NodesObj {
    constructor(name, posX, posY, size) {
        super(name, posX, posY, size);
        this.sas = [];
        this.type = "action";
    }

    getName() {
        return this.name;
    }

    setName(newName) {
        this.name = newName;
    }

    addSAS(sasName, probability, nextState, reward = 0) {
        let sas = {
            sasName: sasName,
            probability: probability,
            nextState: nextState,
            reward: reward
        };
        this.sas.push(sas);
        this.renormalizeProbabilities();
    }

    delSAS(sasName, probability, nextState) {
        this.sas = this.sas.filter(item =>
            !(item.sasName === sasName &&
              item.probability === probability &&
              item.nextState === nextState)
        );
        this.renormalizeProbabilities();
    }

    renormalizeProbabilities(forceNormalize = false) {
        const total = this.sas.reduce((sum, t) =>
            sum + Math.max(0, t.probability), 0);

        // If forceNormalize is true, always normalize to sum to 1.0
        // Otherwise, only normalize if total > 1
        if (forceNormalize && total > 0 && total !== 1) {
            this.sas.forEach(t => {
                t.probability = t.probability / total;
            });
        } else if (!forceNormalize && total > 1) {
            this.sas.forEach(t => {
                t.probability = t.probability / total;
            });
        }
    }

    canConnectTo(targetNode) {
        return targetNode && targetNode.type === "state";
    }

    // Action nodes render as rounded squares (see mainView.js drawNodes()), not circles, so the
    // base class's circle-distance contains() under-detects clicks near the square's corners
    // (outside the inscribed circle but still inside the visible square). Axis-aligned box test
    // instead - node.size is still a bounding radius (half the square's side length).
    contains(x, y) {
        return Math.abs(x - this.x) <= this.size && Math.abs(y - this.y) <= this.size;
    }

    getTotalProbability() {
        return this.sas.reduce((sum, t) =>
            sum + Math.max(0, t.probability), 0);
    }
}