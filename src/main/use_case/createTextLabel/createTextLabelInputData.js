// Input data for CreateTextLabel use case
class CreateTextLabelInputData {
    constructor(text, x, y, fontSize) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.fontSize = fontSize;
    }

    static forRequest() {
        return new CreateTextLabelInputData(null, 0, 0, 16);
    }

    static forExecution(text, x, y, fontSize = 16) {
        return new CreateTextLabelInputData(text, x, y, fontSize);
    }
}
