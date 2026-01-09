class UndoButton {
    constructor(x, y, width, height, onClick) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.onClick = onClick;
        this.button = null;
        this.enabled = true;
    }

    show() {
        if (!this.button) {
            this.button = createButton('↶ Undo');
            this.button.position(this.x, this.y);
            this.button.size(this.width, this.height);

            // Styling
            this.button.style('background-color', '#FF9800');
            this.button.style('color', '#FFFFFF');
            this.button.style('border', 'none');
            this.button.style('border-radius', '5px');
            this.button.style('font-size', '14px');
            this.button.style('font-weight', 'bold');
            this.button.style('cursor', 'pointer');
            this.button.style('transition', 'background-color 0.3s');

            this.button.mousePressed(() => {
                if (this.enabled) {
                    this.onClick();
                }
                return false;
            });

            this.button.mouseOver(() => {
                if (this.enabled) {
                    this.button.style('background-color', '#FB8C00');
                }
            });

            this.button.mouseOut(() => {
                if (this.enabled) {
                    this.button.style('background-color', '#FF9800');
                } else {
                    this.button.style('background-color', '#CCCCCC');
                }
            });
        }
    }

    hide() {
        if (this.button) {
            this.button.hide();
        }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (this.button) {
            if (enabled) {
                this.button.style('background-color', '#FF9800');
                this.button.style('cursor', 'pointer');
                this.button.style('opacity', '1');
            } else {
                this.button.style('background-color', '#CCCCCC');
                this.button.style('cursor', 'not-allowed');
                this.button.style('opacity', '0.6');
            }
        }
    }

    setColor(color) {
        if (this.button) {
            this.button.style('background-color', color);
        }
    }
}