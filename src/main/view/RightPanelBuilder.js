// DOM factory helpers for RightPanel. Reduces repeated createSpan/createSlider boilerplate.
// Depends on p5.js DOM globals: createSpan, createDiv, createSlider.
class RightPanelBuilder {

    // Creates a styled node-type badge (coloured pill span) parented to container.
    static nodeBadge(text, nodeType, container) {
        const bg = nodeType === 'state' ? AppPalette.node.badgeState : AppPalette.node.badgeAction;
        const badge = createSpan(text);
        badge.parent(container);
        badge.style('background', bg);
        badge.style('color', ColorUtils.contrastText(bg));
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

        // Every input[type="range"] in the app is fully custom-styled (appearance:none) and
        // reads its filled-portion width from this CSS custom property (see style.css) - WebKit/
        // Blink have no native "filled" pseudo-element the way Firefox does, so it has to be
        // kept in sync from JS. Self-contained here (not left to each caller) so every slider
        // built via this factory gets it automatically, on both initial render and every drag.
        // --fill is a unitless 0-1 fraction, not a percentage - style.css's gradient formula
        // needs it as a plain number to combine with --thumb-d in a calc() expression.
        const syncFillPct = () => {
            const el = slider.elt;
            const frac = (parseFloat(el.value) - parseFloat(el.min)) / (parseFloat(el.max) - parseFloat(el.min));
            el.style.setProperty('--fill', frac);
        };
        syncFillPct();
        slider.elt.addEventListener('input', syncFillPct);

        return { slider, valueDisplay };
    }
}
