// Shared shaft+head spinning-arrow glyph, used by both Graph view (mainView.js) and Tree view
// (treeView.js) for the simulation's action/outcome-decision animation. Pure drawing - no
// position/rotation setup; callers push()/translate()/rotate() to the node's center + arrow
// angle before calling draw(), then pop().
class SpinningArrowGlyph {
    // Draw a shaft+head arrow polygon in local (already-translated/rotated) coordinates.
    // tipY = -length (up), head spans [-shaftLength..-length], shaft spans [tailY..-shaftLength].
    static _drawArrowPolygon(length, shaftLength, shaftWidth, headWidth, opts = {}) {
        const { fillColor, strokeColor, strokeWt, scaleFactor, tailY = 0 } = opts;
        const tipY    = -length;
        const headY   = -shaftLength; // where shaft meets head
        const halfS   = shaftWidth / 2;
        const halfH   = headWidth  / 2;

        push();
        if (scaleFactor && scaleFactor !== 1) scale(scaleFactor);
        if (fillColor)   fill(fillColor);   else noFill();
        if (strokeColor) { stroke(strokeColor); strokeWeight(strokeWt || 1.5); } else noStroke();

        beginShape();
        vertex(0,      tipY);   // tip
        vertex( halfH, headY);  // right head corner
        vertex( halfS, headY);  // right shaft top
        vertex( halfS, tailY);  // right shaft bottom
        vertex(-halfS, tailY);  // left shaft bottom
        vertex(-halfS, headY);  // left shaft top
        vertex(-halfH, headY);  // left head corner
        endShape(CLOSE);
        pop();
    }

    // Full spinning-arrow glyph scaled to nodeSize so tip lands at the node circumference.
    // Call inside push()/translate()/rotate() ... pop() with origin at the node center. nodeSize
    // is a RADIUS (matches this app's node.size convention - see nodesObj.js/stateNodes.js).
    static draw(nodeSize) {
        const s          = nodeSize / 32;
        const length     = nodeSize;
        const shaftLen   = Math.max(4, Math.round(18 * s));
        const shaftWidth = Math.max(3, Math.round(5  * s));
        const headWidth  = Math.max(9, Math.round(17 * s));

        SpinningArrowGlyph._drawArrowPolygon(length, shaftLen, shaftWidth, headWidth, {
            fillColor: color(0, 0, 0, 120),
            strokeColor: null,
            scaleFactor: 1.12,
            tailY: 0
        });

        SpinningArrowGlyph._drawArrowPolygon(length, shaftLen, shaftWidth, headWidth, {
            fillColor: color(255, 87, 34),
            strokeColor: color(20, 20, 20, 220),
            strokeWt: 1.5,
            scaleFactor: 1,
            tailY: 0
        });

        fill(255, 255, 255, 230);
        stroke(20, 20, 20, 180);
        strokeWeight(1);
        circle(0, 0, 6);
    }
}
