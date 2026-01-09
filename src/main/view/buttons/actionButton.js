class ActionButton {
    constructor(x, y, width, height, onClick) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.onClick = onClick;

        this.button = createButton('Add Action');
        this.button.position(this.x, this.y);
        this.button.size(this.width, this.height);
        this.button.mousePressed((event) => {
            this.onClick();
            return false;
        });
        this.button.style('width', `${this.width}px`);
        this.button.style('padding', '10px');
    }

    setEnabled(isEnabled) {
        this.button.attribute('disabled', !isEnabled ? 'true' : null);
        this.button.style('background-color', isEnabled ? '#FFFFFF' : '#CCCCCC');
    }

    hide() {
        this.button.hide();
    }

    show() {
        this.button.show();
    }

    setColor(newColor) {
        this.color = newColor;
        this.button.style('background-color', this.color);
    }
}
