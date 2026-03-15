class ZoomInButton {
    constructor(x, y, width, height, onClick) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.onClick = onClick;

        this.button = createButton('+');
        this.button.position(this.x, this.y);
        this.button.size(this.width, this.height);
        this.button.mousePressed((event) => {
            this.onClick();
            return false;
        });
        this.button.style('width', `${this.width}px`);
        this.button.style('padding', '10px');
        this.button.style('background-color', '#616161');
        this.button.style('color', 'white');
        this.button.style('border', 'none');
        this.button.style('border-radius', '4px');
        this.button.style('cursor', 'pointer');
        this.button.style('font-size', '20px');
        this.button.style('font-weight', 'bold');
    }

    setEnabled(isEnabled) {
        this.button.attribute('disabled', !isEnabled ? 'true' : null);
        this.button.style('background-color', isEnabled ? '#2196F3' : '#CCCCCC');
    }

    hide() {
        this.button.hide();
    }

    show() {
        this.button.show();
    }

    setColor(newColor) {
        this.button.style('background-color', newColor);
    }
}
