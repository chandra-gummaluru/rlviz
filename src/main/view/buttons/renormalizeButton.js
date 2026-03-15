// Button for renormalizing probabilities
class RenormalizeButton {
    constructor(x, y, width, height, onClick) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.onClick = onClick;

        this.button = createButton('Renormalize Probabilities');
        this.button.position(this.x, this.y);
        this.button.size(this.width, this.height);
        this.button.mousePressed((event) => {
            this.onClick();
            return false;
        });
        this.button.style('width', `${this.width}px`);
        this.button.style('padding', '10px');
        this.button.style('background-color', '#6495ED');
        this.button.style('color', '#FFFFFF');
    }

    hide() {
        this.button.hide();
    }

    show() {
        this.button.show();
    }
}
