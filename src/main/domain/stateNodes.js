class StateNode extends NodesObj {
    constructor(name, posX, posY, size) {
        super(name, posX, posY, size);
        this.actions = [];
        this.type = "state";
    }

    getName() {
        return this.name;
    }

    setName(newName) {
        this.name = newName;
    }

    addAction(actionId) {
        if (!this.actions.includes(actionId)) {
            this.actions.push(actionId);
        }
    }

    delAction(actionId) {
        this.actions = this.actions.filter(id => id !== actionId);
    }

    canConnectTo(targetNode) {
        return targetNode && targetNode.type === "action";
    }
}
