class NodesObj {
    constructor(name, posX, posY, size) {
        this.name = name;
        this.x = posX;
        this.y = posY;
        this.size = size;
        this.id = null;
    }

    getName() {
        return this.name;
    }

    setName(newName) {
        this.name = newName;
    }

    getPosition() {
        return { x: this.x, y: this.y };
    }

    setPosition(newX, newY) {
        this.x = newX;
        this.y = newY;
    }

    getSize() {
        return this.size;
    }

    setSize(newSize) {
        this.size = newSize;
    }

    distanceTo(x, y) {
        return Math.sqrt((this.x - x) ** 2 + (this.y - y) ** 2);
    }

    contains(x, y) {
        return this.distanceTo(x, y) <= this.size;
    }
}
