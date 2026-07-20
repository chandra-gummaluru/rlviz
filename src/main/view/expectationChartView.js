// Inline Convergence + Histogram charts for the MC left pane's "Chart" view (Phase 3a) - a real
// DOM component (like ChartDock, not a p5-canvas overlay), layered over the canvas region
// ExpectationView.draw() intentionally leaves blank while leftView === 'chart'. Deliberately NOT
// user-configurable per-slot like ChartDock's two independently-pickable slots: this view always
// shows Convergence on top, Histogram below - a simpler fixed layout for this phase. Reuses
// ChartDataBuilders' existing pure data-shaping functions verbatim - no new chart math here,
// only a new render target.
class ExpectationChartView {
    constructor(canvasViewModel, expectationState, expectationViewModel, valueIterationState) {
        this.viewModel = canvasViewModel;
        this.expectationState = expectationState;
        this.expectationViewModel = expectationViewModel;
        this.valueIterationState = valueIterationState;

        this.containerEl = null;
        this._slotBodyEls = [null, null];
        this._statEls = [null, null];
        this._legendEls = [null, null];
        this._chartInstances = [null, null];
        this._bounds = null;
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'expectation-chart-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const labels = ['V̂(S₀) vs V*', 'Return distribution'];
        for (let i = 0; i < 2; i++) {
            const slot = document.createElement('div');
            slot.className = 'expectation-chart-view-slot';

            const header = document.createElement('div');
            header.className = 'expectation-chart-view-header';

            const caption = document.createElement('span');
            caption.className = 'expectation-chart-view-caption';
            caption.textContent = labels[i];
            header.appendChild(caption);

            // Right-aligned stat text (histogram's "n = N episodes" - Convergence's own slot
            // just leaves this empty, since that chart's legend lives in Chart.js's own top
            // legend instead).
            const stat = document.createElement('span');
            stat.className = 'expectation-chart-view-stat';
            header.appendChild(stat);
            this._statEls[i] = stat;

            slot.appendChild(header);

            const body = document.createElement('div');
            body.className = 'expectation-chart-view-body';
            slot.appendChild(body);
            this._slotBodyEls[i] = body;

            // Bottom legend row (histogram only - see _renderHistogram()); Convergence's legend
            // is Chart.js's own built-in top legend instead, since its dataset set is dynamic.
            const legend = document.createElement('div');
            legend.className = 'expectation-chart-view-legend';
            slot.appendChild(legend);
            this._legendEls[i] = legend;

            container.appendChild(slot);
        }

        this.hide();
    }

    // x, y, width, height: the LEFT PANE's full box (leftW from ExpectationViewModel.splitWidths,
    // topOffset..canvasH vertically) - a full rectangle, not edge-anchored like the segmented
    // pills, since this component occupies the whole pane rather than floating at one corner.
    updateBounds(x, y, width, height) {
        this._bounds = { x, y, width, height };
        this._applyLayout();
    }

    _applyLayout() {
        if (!this.containerEl || !this._bounds) return;
        const { x, y, width, height } = this._bounds;
        this.containerEl.style.left = x + 'px';
        this.containerEl.style.top = y + 'px';
        this.containerEl.style.width = width + 'px';
        this.containerEl.style.height = height + 'px';
    }

    refresh() {
        if (!this.containerEl || this.containerEl.style.display === 'none') return;
        this._renderConvergence();
        this._renderHistogram();
    }

    _renderConvergence() {
        const body = this._slotBodyEls[0];
        if (!body) return;
        if (this._chartInstances[0]) {
            this._chartInstances[0].destroy();
            this._chartInstances[0] = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const { mcMeans, mcSEs, viValues, vStar } = ChartDataBuilders.buildConvergenceData(
            this.expectationState, this.valueIterationState);

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(mcMeans.length, viValues.length, 1);

        const datasets = [];

        // +-SE shaded band around the MC line - see chartDock.js's _renderConvergence for the
        // fill-target rationale (lower bound first with fill:false, upper bound right after with
        // fill:'-1' so Chart.js fills the area between the two).
        if (mcMeans.length > 0 && mcSEs.length === mcMeans.length) {
            datasets.push({
                label: 'E[G] − SE',
                data: mcMeans.map((y, x) => ({ x, y: y - (mcSEs[x] || 0) })),
                borderColor: 'transparent',
                pointRadius: 0, fill: false
            });
            datasets.push({
                label: 'E[G] ± SE',
                data: mcMeans.map((y, x) => ({ x, y: y + (mcSEs[x] || 0) })),
                borderColor: 'transparent',
                pointRadius: 0, fill: '-1',
                backgroundColor: ColorUtils.applyAlpha(AppPalette.accent.orange, 35)
            });
        }
        if (viValues.length > 0) {
            const methodEntry = ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability);
            datasets.push({
                label: `V (${methodEntry.pillLabel})`,
                data: viValues.map((y, x) => ({ x, y })),
                borderColor: AppPalette.accent[methodEntry.accent],
                borderWidth: 2, pointRadius: 0, tension: 0
            });
        }
        if (mcMeans.length > 0) {
            datasets.push({
                label: 'estimate',
                data: mcMeans.map((y, x) => ({ x, y })),
                borderColor: AppPalette.accent.orange,
                borderWidth: 2, pointRadius: 0, tension: 0.3,
                // Marked for ConvergenceEndpointPlugin below - the one line whose final value
                // gets a solid dot + numeric callout, matching the reference design.
                _labelEndpoint: true
            });
        }
        if (vStar !== null) {
            datasets.push({
                label: `V* = ${vStar.toFixed(2)}`,
                data: [{ x: 0, y: vStar }, { x: maxLen - 1, y: vStar }],
                borderColor: AppPalette.text.muted,
                borderDash: [4, 4], borderWidth: 1, pointRadius: 0
            });
        }

        const highlightedRun = this.expectationViewModel ? this.expectationViewModel.highlightedRun : null;
        if (highlightedRun !== null) {
            const allY = [...viValues, ...mcMeans, vStar].filter(v => typeof v === 'number' && isFinite(v));
            if (allY.length > 0) {
                const yMin = Math.min(...allY);
                const yMax = Math.max(...allY);
                const t = this.expectationState.currentT;
                datasets.push({
                    label: `ep ${highlightedRun + 1}`,
                    data: [{ x: t, y: yMin }, { x: t, y: yMax }],
                    borderColor: AppPalette.accent.yellow,
                    borderDash: [3, 3], borderWidth: 1.5, pointRadius: 0
                });
            }
        }

        // Draws a solid dot + the numeric value next to the final point of whichever dataset(s)
        // are flagged `_labelEndpoint: true` above - Chart.js has no built-in per-point label
        // support without an extra plugin dependency (none is vendored here), so this is a small
        // inline plugin scoped to just this chart instance (passed via `plugins:` below, not
        // Chart.register()'d globally) rather than affecting chartDock's/viChartView's own charts.
        const endpointPlugin = {
            id: 'convergenceEndpoint',
            afterDatasetsDraw(chart) {
                chart.data.datasets.forEach((ds, i) => {
                    if (!ds._labelEndpoint || !ds.data || ds.data.length === 0) return;
                    const meta = chart.getDatasetMeta(i);
                    const points = meta.data;
                    if (!points || points.length === 0) return;
                    const last = points[points.length - 1];
                    const lastValue = ds.data[ds.data.length - 1];
                    const y = typeof lastValue === 'object' ? lastValue.y : lastValue;
                    const ctx = chart.ctx;
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
                });
            }
        };

        this._chartInstances[0] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            plugins: [endpointPlugin],
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                layout: { padding: { right: 36 } }, // room for the endpoint plugin's value callout
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'end',
                        labels: {
                            boxWidth: 16, boxHeight: 2, font: { size: 10 }, color: AppPalette.text.muted,
                            // Hides the invisible +-SE fill-boundary datasets - they exist purely
                            // to shade the band between them, not meaningful legend entries.
                            filter: item => item.text && !item.text.includes('SE')
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        ticks: { font: { size: 9 }, color: AppPalette.text.muted, stepSize: 1 },
                        grid: { color: AppPalette.border.chartGrid },
                        title: { display: true, text: `${maxLen} episodes`, align: 'end', font: { size: 9 }, color: AppPalette.text.muted }
                    },
                    y: { ticks: { font: { size: 9 }, color: AppPalette.text.muted }, grid: { color: AppPalette.border.chartGrid } }
                }
            }
        });
    }

    _renderHistogram() {
        const body = this._slotBodyEls[1];
        if (!body) return;
        if (this._chartInstances[1]) {
            this._chartInstances[1].destroy();
            this._chartInstances[1] = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const t = this.expectationState.currentT;
        const { bins, counts, runIndexByBin } = ChartDataBuilders.buildHistogramData(this.expectationState, t);
        if (this._statEls[1]) {
            const n = this.expectationState.rollouts ? this.expectationState.rollouts.length : 0;
            this._statEls[1].textContent = `n = ${n} episodes`;
        }
        if (bins.length === 0) {
            if (this._legendEls[1]) this._legendEls[1].innerHTML = '';
            return;
        }

        const highlightedRun = this.expectationViewModel ? this.expectationViewModel.highlightedRun : null;
        let highlightedBinIdx = null;
        if (highlightedRun !== null && runIndexByBin) {
            for (let i = 0; i < runIndexByBin.length; i++) {
                if (runIndexByBin[i].includes(highlightedRun)) { highlightedBinIdx = i; break; }
            }
        }

        // Colored by the RETURN'S SIGN/RANK, not raw bin index - red for a bin that's actually
        // negative, green for the single best (rightmost) bin, orange (with a light->dark
        // gradient across the remaining middle bins) in between. Matches
        // AppPalette.accent.green's own dark-theme doc comment ("positive rewards, successful
        // episodes").
        const lastIdx = bins.length - 1;
        const midOrangeIndices = bins
            .map((b, i) => ({ b, i }))
            .filter(({ b, i }) => b.low >= 0 && i !== lastIdx)
            .map(({ i }) => i);

        const bgColors = bins.map((bin, i) => {
            if (highlightedBinIdx !== null) {
                return i === highlightedBinIdx ? AppPalette.accent.yellow : ColorUtils.applyAlpha(AppPalette.text.muted, 40);
            }
            if (bin.low < 0) return AppPalette.accent.red;
            if (i === lastIdx) return AppPalette.accent.green;
            const posInMid = midOrangeIndices.length > 1 ? midOrangeIndices.indexOf(i) / (midOrangeIndices.length - 1) : 0;
            return ColorUtils.applyAlpha(AppPalette.accent.orange, 55 + posInMid * 40);
        });

        if (this._legendEls[1]) {
            this._legendEls[1].innerHTML = '';
            if (highlightedBinIdx === null) {
                const hasNegative = bins.some(b => b.low < 0);
                const entries = [];
                if (hasNegative) entries.push({ color: AppPalette.accent.red, label: 'negative return' });
                entries.push({ color: AppPalette.accent.green, label: 'positive return' });
                entries.forEach(({ color, label }) => {
                    const item = document.createElement('span');
                    item.className = 'expectation-chart-view-legend-item';
                    const swatch = document.createElement('span');
                    swatch.className = 'expectation-chart-view-legend-swatch';
                    swatch.style.background = color;
                    item.appendChild(swatch);
                    item.appendChild(document.createTextNode(label));
                    this._legendEls[1].appendChild(item);
                });
            }
        }

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        this._chartInstances[1] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: bins.map(b => b.label),
                datasets: [{ data: counts, backgroundColor: bgColors }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { font: { size: 8 }, color: AppPalette.text.muted }, grid: { display: false } },
                    y: { ticks: { font: { size: 9 }, color: AppPalette.text.muted }, grid: { color: AppPalette.border.chartGrid }, beginAtZero: true }
                }
            }
        });
    }

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
