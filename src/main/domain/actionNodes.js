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

    renormalizeProbabilities() {
        const total = this.sas.reduce((sum, t) =>
            sum + Math.max(0, t.probability), 0);

        console.log(`[${this.name}] Renormalization check: total = ${total.toFixed(3)}`);

        if (total > 1) {
            console.log(`[${this.name}] Renormalizing! Total > 1, dividing by ${total.toFixed(3)}`);
            this.sas.forEach(t => {
                const oldProb = t.probability;
                t.probability = t.probability / total;
                console.log(`  ${t.sasName}: ${oldProb.toFixed(3)} → ${t.probability.toFixed(3)}`);
            });
        } else {
            console.log(`[${this.name}] No renormalization needed (total ≤ 1)`);
        }
    }

    canConnectTo(targetNode) {
        return targetNode && targetNode.type === "state";
    }

    getTotalProbability() {
        return this.sas.reduce((sum, t) =>
            sum + Math.max(0, t.probability), 0);
    }
}