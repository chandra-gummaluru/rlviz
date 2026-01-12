class PlayButton {
    constructor(x, y, width, height, onClick) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.onClick = onClick;
        this.isPlaying = false;
        this.button = createButton('▶ Play');
        this.button.position(this.x, this.y);
        this.button.size(this.width, this.height);
        this.setColor('#4CAF50'); // Green color
        this.button.style('color', '#FFFFFF');
        this.button.style('border', 'none');
        this.button.style('border-radius', '5px');
        this.button.style('cursor', 'pointer');
        this.button.style('font-size', '14px');
        this.button.style('font-weight', 'bold');
        this.button.mousePressed(() => {
            this.onClick();
            return false;
        });
    }

    show() {
        this.button.show();
    }

    hide() {
        this.button.hide();
    }

    setEnabled(enabled) {
        if (enabled) {
            this.button.removeAttribute('disabled');
            this.setColor('#4CAF50');
            this.button.style('cursor', 'pointer');
            this.button.style('opacity', '1');
        } else {
            this.button.attribute('disabled', '');
            this.setColor('#CCCCCC');
            this.button.style('cursor', 'not-allowed');
            this.button.style('opacity', '0.6');
        }
    }

    setColor(color) {
        this.button.style('background-color', color);
    }

    setPlaying(playing) {
        this.isPlaying = playing;
        if (playing) {
            this.button.html('⏸ Pause');
            this.setColor('#FF9800'); // Orange color for pause
        } else {
            this.button.html('▶ Play');
            this.setColor('#4CAF50'); // Green color for play
        }
    }
}
