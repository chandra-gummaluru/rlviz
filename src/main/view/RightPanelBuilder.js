// DOM factory helpers for RightPanel. Reduces repeated createSpan/createSlider boilerplate.
// Depends on p5.js DOM globals: createSpan, createDiv, createSlider.
class RightPanelBuilder {

    // Creates a styled node-type badge (coloured pill span) parented to container.
    static nodeBadge(text, nodeType, container) {
        const bg = nodeType === 'state' ? '#2d6a4f' : '#1565c0';
        const badge = createSpan(text);
        badge.parent(container);
        badge.style('background', bg);
        badge.style('color', 'white');
        badge.style('padding', '2px 8px');
        badge.style('border-radius', '4px');
        badge.style('font-size', '13px');
        return badge;
    }

    // Creates a slider + value display row parented to container.
    // Returns { slider, valueDisplay } — caller wires the input() callback.
    // Slider mousedown/click events are stopped to prevent canvas interaction.
    static sliderRow(container, min, max, initial, step) {
        const row = createDiv();
        row.parent(container);
        row.addClass('panel-slider-row');

        const slider = createSlider(min, max, initial, step);
        slider.parent(row);
        slider.addClass('panel-slider');

        const valueDisplay = createDiv(typeof initial === 'number' ? initial.toString() : initial);
        valueDisplay.parent(row);
        valueDisplay.addClass('panel-slider-value');

        slider.elt.addEventListener('mousedown', e => e.stopPropagation());
        slider.elt.addEventListener('click', e => e.stopPropagation());

        return { slider, valueDisplay };
    }
}
