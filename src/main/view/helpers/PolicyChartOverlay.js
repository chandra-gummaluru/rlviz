// Shared Policy log chart-overlay building blocks (policy-logging.md) - reused by BOTH
// expectationChartView.js's (Monte Carlo) and viChartView.js's (Iteration) Convergence charts, so
// a policy logged/hidden/hovered from either pane behaves identically in both: one chip strip,
// one dataset builder, one endpoint-labeling/de-overlap plugin. Pure/stateless - nothing here
// holds its own state; callers pass in the SAME policyEvaluationState/expectationViewModel both
// chart views already share (hiddenPolicyIds/hoveredPolicyId deliberately live on
// ExpectationViewModel, not duplicated per view, so toggling a policy off in one pane keeps it
// off in the other).
const PolicyChartOverlay = {
    // Best entry renders green (policy-logging.md §1/§3's "★ = best, green"); every other entry
    // cycles through AppPalette.expectation.runColors by log order.
    policyColor(entry) {
        if (entry.isBest) return AppPalette.accent.green;
        const colors = AppPalette.expectation.runColors;
        return colors[entry.id % colors.length];
    },

    // Visible logged-policy entries (has a curve, not hidden) - shared filter every caller uses
    // to decide which curve datasets/labels/chips to draw.
    visibleEntries(policyEvaluationState, expectationViewModel) {
        const entries = policyEvaluationState ? policyEvaluationState.entries : [];
        const hiddenIds = expectationViewModel ? expectationViewModel.hiddenPolicyIds : new Set();
        return entries.filter(e => !hiddenIds.has(e.id) && e.valueCurve && e.valueCurve.length > 1);
    },

    // Builds/rebuilds a "+ Log π" button + one toggle chip per logged policy into `stripEl`
    // (cleared first). `onToggle()`/`onHover(id|null)` fire on click/hover - deliberately thin
    // callbacks rather than this helper re-rendering anything itself, since each caller needs a
    // DIFFERENT-scoped re-render (its own convergence chart only, not the strip - see
    // expectationChartView.js's own history on why a hover-triggered full refresh() here would
    // strand a click mid-interaction).
    renderChipStrip(stripEl, { policyEvaluationState, expectationViewModel, onLogPolicy, onToggle, onHover }) {
        if (!stripEl) return;
        stripEl.innerHTML = '';

        const logBtn = document.createElement('button');
        logBtn.type = 'button';
        logBtn.className = 'policy-chip-strip-log-btn';
        logBtn.textContent = '+ Log π';
        logBtn.addEventListener('click', () => {
            if (onLogPolicy) onLogPolicy();
        });
        stripEl.appendChild(logBtn);

        const entries = policyEvaluationState ? policyEvaluationState.entries : [];
        const hiddenIds = expectationViewModel ? expectationViewModel.hiddenPolicyIds : new Set();

        entries.forEach(entry => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'policy-chip';
            if (hiddenIds.has(entry.id)) chip.classList.add('policy-chip--hidden');
            chip.style.setProperty('--policy-chip-color', PolicyChartOverlay.policyColor(entry));
            chip.textContent = entry.name || entry.label;

            chip.addEventListener('click', () => {
                if (!expectationViewModel) return;
                const set = expectationViewModel.hiddenPolicyIds;
                if (set.has(entry.id)) set.delete(entry.id); else set.add(entry.id);
                if (onToggle) onToggle();
            });
            chip.addEventListener('mouseenter', () => {
                if (expectationViewModel) expectationViewModel.hoveredPolicyId = entry.id;
                if (onHover) onHover(entry.id);
            });
            chip.addEventListener('mouseleave', () => {
                if (expectationViewModel) expectationViewModel.hoveredPolicyId = null;
                if (onHover) onHover(null);
            });

            stripEl.appendChild(chip);
        });
    },

    // One dashed Chart.js line dataset per visible logged policy, flagged for
    // createEndpointPlugin()'s de-overlapping label pass below.
    buildCurveDatasets(visibleEntries, hoveredPolicyId) {
        return visibleEntries.map(entry => {
            const color = PolicyChartOverlay.policyColor(entry);
            const isHovered = hoveredPolicyId === entry.id;
            return {
                label: entry.name || entry.label,
                data: entry.valueCurve.map((y, x) => ({ x, y })),
                borderColor: color,
                borderDash: [5, 3],
                borderWidth: isHovered ? 3 : 1.5,
                pointRadius: 0, tension: 0,
                _labelEndpoint: true,
                _endpointLabel: entry.name || '',
                _policyId: entry.id,
                _policyHovered: isHovered
            };
        });
    },

    // Chart.js legend `labels.filter` - hides the +-SE fill-boundary datasets AND policy curves
    // (which already have their own color-coded chip in the strip above) from the chart's
    // built-in top legend.
    legendFilter(item, data) {
        if (!item.text || item.text.includes('SE')) return false;
        const ds = data.datasets[item.datasetIndex];
        return !ds || ds._policyId == null;
    },

    // Widened right-padding so the endpoint plugin's "name value" labels have room - only needed
    // once policy curves are actually visible (a bare-number label fits the original 36px).
    convergenceRightPadding(hasPolicyCurves) {
        return hasPolicyCurves ? 100 : 36;
    },

    // Draws a solid dot + numeric value next to the final point of every `_labelEndpoint: true`
    // dataset. Chart.js has no built-in per-point label support without an extra plugin
    // dependency (none vendored here), so this is a small plugin instance handed to each chart
    // via `plugins:` (not Chart.register()'d globally) - a fresh instance per chart.new() call,
    // not a shared singleton, since Chart.js plugins are attached per-instance anyway.
    //
    // Two label styles coexist: a generic flagged dataset (no `_policyId` - MC's own "estimate"
    // line, VI's own convergence line) draws right next to its own point, exactly as before any
    // policy-log overlay existed. Policy curves (`_policyId` set) go through a SEPARATE pass that
    // de-overlaps and right-aligns at the plot edge with a leader line back to the true endpoint
    // (policy-logging.md §3), so multiple simultaneous policy curves' labels never collide with
    // each other OR with the generic line's own label.
    createEndpointPlugin() {
        return {
            id: 'convergenceEndpoint',
            afterDatasetsDraw(chart) {
                const ctx = chart.ctx;
                const chartArea = chart.chartArea;
                const policyLabels = [];

                chart.data.datasets.forEach((ds, i) => {
                    if (!ds._labelEndpoint || !ds.data || ds.data.length === 0) return;
                    const meta = chart.getDatasetMeta(i);
                    const points = meta.data;
                    if (!points || points.length === 0) return;
                    const last = points[points.length - 1];
                    const lastValue = ds.data[ds.data.length - 1];
                    const y = typeof lastValue === 'object' ? lastValue.y : lastValue;

                    if (ds._policyId == null) {
                        ctx.save();
                        ctx.fillStyle = ds.borderColor;
                        ctx.beginPath();
                        ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.font = '600 11px "IBM Plex Mono", Consolas, monospace';
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'left';
                        ctx.fillText(y.toFixed(2), last.x + 7, last.y);
                        ctx.restore();
                        return;
                    }

                    policyLabels.push({
                        anchorX: last.x, anchorY: last.y, labelY: last.y,
                        text: `${ds._endpointLabel || ''} ${y.toFixed(2)}`.trim(),
                        color: ds.borderColor, hovered: !!ds._policyHovered
                    });
                });

                if (policyLabels.length === 0) return;

                // De-overlap: sort by natural Y, greedily separate by >=13px (policy-logging.md
                // §3's own spacing spec), then pull the whole stack back up if it overflowed the
                // chart's bottom edge - keeps relative order intact either way.
                policyLabels.sort((a, b) => a.labelY - b.labelY);
                const MIN_GAP = 13;
                for (let i = 1; i < policyLabels.length; i++) {
                    if (policyLabels[i].labelY - policyLabels[i - 1].labelY < MIN_GAP) {
                        policyLabels[i].labelY = policyLabels[i - 1].labelY + MIN_GAP;
                    }
                }
                const overflow = policyLabels[policyLabels.length - 1].labelY - chartArea.bottom;
                if (overflow > 0) policyLabels.forEach(e => { e.labelY -= overflow; });

                const labelX = chartArea.right + 7;
                const anyHovered = policyLabels.some(e => e.hovered);

                policyLabels.forEach(e => {
                    const nudged = Math.abs(e.labelY - e.anchorY) > 1;
                    ctx.save();
                    ctx.globalAlpha = (anyHovered && !e.hovered) ? 0.35 : 1;

                    // Leader line back to the curve's TRUE endpoint - only drawn once the label
                    // has actually been nudged away from it (an isolated curve's label sits right
                    // on its own endpoint, no line needed).
                    if (nudged) {
                        ctx.strokeStyle = e.color;
                        ctx.lineWidth = 1;
                        ctx.setLineDash([2, 2]);
                        ctx.beginPath();
                        ctx.moveTo(e.anchorX, e.anchorY);
                        ctx.lineTo(labelX - 4, e.labelY);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }

                    ctx.fillStyle = e.color;
                    ctx.beginPath();
                    ctx.arc(e.anchorX, e.anchorY, 3.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.font = `${e.hovered ? '700' : '600'} 11px "IBM Plex Mono", Consolas, monospace`;
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'left';
                    ctx.fillText(e.text, labelX, e.labelY);
                    ctx.restore();
                });
            }
        };
    }
};
