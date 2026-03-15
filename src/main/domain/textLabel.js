class TextLabel {
    constructor(text, x, y, fontSize = 16) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.fontSize = fontSize;
        this.id = Date.now() + Math.random();
    }

    setText(newText) {
        this.text = newText;
    }

    setPosition(newX, newY) {
        this.x = newX;
        this.y = newY;
    }

    setFontSize(size) {
        this.fontSize = size;
    }

    contains(mouseX, mouseY) {
        // Approximate text bounds (this is a rough estimate)
        const textWidth = this.text.length * this.fontSize * 0.6;
        const textHeight = this.fontSize;

        return mouseX >= this.x - textWidth / 2 &&
               mouseX <= this.x + textWidth / 2 &&
               mouseY >= this.y - textHeight / 2 &&
               mouseY <= this.y + textHeight / 2;
    }
}
