// Inline Convergence + Histogram charts for the MC left pane's "Chart" view (Phase 3a) - a real
// DOM component (like ChartDock, not a p5-canvas overlay), layered over the canvas region
// ExpectationView.draw() intentionally leaves blank while leftView === 'chart'. Deliberately NOT
// user-configurable per-slot like ChartDock's two independently-pickable slots: this view always
// shows Convergence on top, Histogram below - a simpler fixed layout for this phase. Reuses
// ChartDataBuilders' existing pure data-shaping functions verbatim - no new chart math here,
// only a new render target.
class ExpectationChartView {
    // policyLogDeps (policy-logging.md - Phase 3/4 of the policy-log chart overlays): optional,
    // everything in it defaults to a no-op so this class still works standalone if a caller omits
    // it. `onLogPolicy` is the SAME handler the top bar's dedicated "Evaluate π" button already
    // calls (main.js's onEvaluatePolicy) - the chip strip's own "+ Log π" reuses it verbatim
    // rather than duplicating the naming-modal/cap-check flow.
    constructor(canvasViewModel, expectationState, expectationViewModel, valueIterationState, policyLogDeps = {}) {
        this.viewModel = canvasViewModel;
        this.expectationState = expectationState;
        this.expectationViewModel = expectationViewModel;
        this.valueIterationState = valueIterationState;
        this.policyEvaluationState = policyLogDeps.policyEvaluationState || null;
        this.traceGenerator = policyLogDeps.traceGenerator || null;
        this.startNodeProvider = policyLogDeps.startNodeProvider || (() => null);
        this.onLogPolicy = policyLogDeps.onLogPolicy || null;

        this.containerEl = null;
        this._chipStripEl = null;
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

        // Policy log chip strip (policy-logging.md §3's "shared strip above the cards") - lives
        // above both chart cards, built fresh on every refresh() (see _renderChipStrip()) since
        // its content is exactly `policyEvaluationState.entries`, same "just re-render, don't
        // diff" convention every other DOM view in this codebase already uses.
        const chipStrip = document.createElement('div');
        chipStrip.className = 'policy-chip-strip';
        container.appendChild(chipStrip);
        this._chipStripEl = chipStrip;

        const labels = ['Value over Time for a Given Policy and Initial State', 'Return distribution'];
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
        this._renderChipStrip();
        this._renderConvergence();
        this._renderHistogram();
    }

    // Thin wrapper around the shared PolicyChartOverlay.renderChipStrip() (see that file for the
    // full rationale, incl. why hover deliberately re-renders only _renderConvergence(), not a
    // full refresh()) - shared verbatim with viChartView.js so a policy hidden/hovered from
    // either pane behaves identically in both.
    _renderChipStrip() {
        PolicyChartOverlay.renderChipStrip(this._chipStripEl, {
            policyEvaluationState: this.policyEvaluationState,
            expectationViewModel: this.expectationViewModel,
            onLogPolicy: this.onLogPolicy,
            onToggle: () => this.refresh(),
            onHover: () => this._renderConvergence()
        });
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

        const visiblePolicyEntries = PolicyChartOverlay.visibleEntries(this.policyEvaluationState, this.expectationViewModel);
        const hoveredPolicyId = this.expectationViewModel ? this.expectationViewModel.hoveredPolicyId : null;

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(
            mcMeans.length, viValues.length, 1,
            ...visiblePolicyEntries.map(e => e.valueCurve.length)
        );

        // One dashed line per visible logged policy (policy-logging.md §3) - the exact
        // E[G]-vs-horizon curve PolicyEvaluationState.evaluateCurve() computed at log time.
        const datasets = PolicyChartOverlay.buildCurveDatasets(visiblePolicyEntries, hoveredPolicyId);

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

        // Endpoint dot+label plugin, legend filter, and right-padding are all shared with
        // viChartView.js's own Convergence chart (see PolicyChartOverlay.js) - kept as ONE
        // implementation rather than two near-identical copies now that both charts overlay
        // policy curves.
        this._chartInstances[0] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            plugins: [PolicyChartOverlay.createEndpointPlugin()],
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                layout: { padding: { right: PolicyChartOverlay.convergenceRightPadding(visiblePolicyEntries.length > 0) } },
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'end',
                        labels: {
                            boxWidth: 16, boxHeight: 2, font: { size: 10 }, color: AppPalette.text.muted,
                            filter: PolicyChartOverlay.legendFilter
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'linear',
                        ticks: { font: { size: 9 }, color: AppPalette.text.muted, stepSize: 1 },
                        grid: { color: AppPalette.border.chartGrid },
                        title: { display: true, text: 'Time', align: 'center', font: { size: 9 }, color: AppPalette.text.muted }
                    },
                    y: {
                        ticks: { font: { size: 9 }, color: AppPalette.text.muted },
                        grid: { color: AppPalette.border.chartGrid },
                        title: { display: true, text: 'Utility', align: 'center', font: { size: 9 }, color: AppPalette.text.muted }
                    }
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

        // Per-policy translucent overlay (policy-logging.md §4) - each visible logged policy gets
        // its own stepped outline + dashed E[G] marker, binned into the SAME bin edges the live
        // MC population above already established (not its own [min,max] range), so every overlay
        // shares one comparable x-axis with the base histogram and with each other.
        const policyEntries = this.policyEvaluationState ? this.policyEvaluationState.entries : [];
        const hiddenPolicyIds = this.expectationViewModel ? this.expectationViewModel.hiddenPolicyIds : new Set();
        const visiblePolicyEntries = policyEntries.filter(e => !hiddenPolicyIds.has(e.id));

        const overlayDatasets = [];
        const markers = [];
        visiblePolicyEntries.forEach(entry => {
            const samples = this._getPolicyHistogramSamples(entry);
            if (!samples) return;
            const color = PolicyChartOverlay.policyColor(entry);
            overlayDatasets.push({
                type: 'line',
                label: entry.name || entry.label,
                data: this._binReturnsInto(samples, bins),
                borderColor: color,
                backgroundColor: ColorUtils.applyAlpha(color, 30),
                borderWidth: 1.5,
                stepped: true,
                fill: true,
                pointRadius: 0
            });
            markers.push({ value: entry.valueAtStart, color, label: entry.name || entry.label });
        });

        // Vertical dashed E[G] marker + name label per visible policy - Chart.js has no built-in
        // annotation support without an extra plugin (none vendored here), same rationale as
        // ConvergenceEndpointPlugin above. Snaps to the containing bin's center rather than a
        // continuous sub-bin pixel position - this chart is already discretized into `binCount`
        // buckets, so bin-level placement is exactly as precise as the histogram itself.
        const histogramMarkerPlugin = {
            id: 'policyHistogramMarkers',
            afterDatasetsDraw(chart) {
                const xScale = chart.scales.x;
                const yScale = chart.scales.y;
                if (!xScale || !yScale || markers.length === 0) return;
                const ctx = chart.ctx;
                markers.forEach(m => {
                    let idx = bins.findIndex(b => m.value >= b.low && m.value <= b.high);
                    if (idx === -1) idx = m.value < bins[0].low ? 0 : bins.length - 1;
                    const x = xScale.getPixelForValue(idx);
                    ctx.save();
                    ctx.strokeStyle = m.color;
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([4, 3]);
                    ctx.beginPath();
                    ctx.moveTo(x, yScale.top);
                    ctx.lineTo(x, yScale.bottom);
                    ctx.stroke();
                    ctx.setLineDash([]);
                    ctx.fillStyle = m.color;
                    ctx.font = '600 10px "IBM Plex Mono", Consolas, monospace';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(m.label, x, yScale.top - 3);
                    ctx.restore();
                });
            }
        };

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        this._chartInstances[1] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: bins.map(b => b.label),
                datasets: [{ data: counts, backgroundColor: bgColors }, ...overlayDatasets]
            },
            plugins: [histogramMarkerPlugin],
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                layout: { padding: { top: markers.length > 0 ? 14 : 0 } },
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        ticks: { font: { size: 8 }, color: AppPalette.text.muted },
                        grid: { display: false },
                        title: { display: true, text: 'Utility', align: 'center', font: { size: 9 }, color: AppPalette.text.muted }
                    },
                    y: {
                        ticks: { font: { size: 9 }, color: AppPalette.text.muted },
                        grid: { color: AppPalette.border.chartGrid },
                        beginAtZero: true,
                        title: { display: true, text: 'Count', align: 'center', font: { size: 9 }, color: AppPalette.text.muted }
                    }
                }
            }
        });
    }

    // Lazily samples + caches 64 discounted returns for one logged policy's histogram overlay
    // (policy-logging.md §4) - computed once per entry, on first reveal, then cached directly on
    // the entry object (entry._histogramSamples) so toggling its chip or scrubbing t never
    // resamples. Uses the entry's OWN frozen (gamma, maxSteps), not whatever's live now - see
    // PolicyEvaluationState.addEntry()'s own comment on why those are stored per-entry.
    _getPolicyHistogramSamples(entry) {
        if (entry._histogramSamples) return entry._histogramSamples;
        if (!this.traceGenerator || !this.traceGenerator.graph) return null;
        const startNode = this.startNodeProvider();
        if (!startNode) return null;

        const samples = PolicyMcSampler.sampleReturns(this.traceGenerator.graph, this.traceGenerator, startNode, {
            policy: entry.policySnapshot,
            policyWeights: entry.policyWeightsSnapshot,
            timeDependentPolicy: entry.timeDependentPolicySnapshot || null,
            maxSteps: entry.maxSteps,
            gamma: entry.gamma,
            numRuns: 64
        });
        entry._histogramSamples = samples;
        return samples;
    }

    // Bins raw returns into caller-supplied bin edges (the live MC histogram's own bins, so every
    // overlay shares one x-axis) - deliberately NOT ChartDataBuilders.buildHistogramData(), which
    // derives its OWN [min,max] range from expectationState's rollouts; a policy overlay needs to
    // land in the SAME buckets the base histogram already drew, not its own independent range.
    _binReturnsInto(returns, bins) {
        const counts = new Array(bins.length).fill(0);
        if (bins.length === 0) return counts;
        const lastIdx = bins.length - 1;
        const low0 = bins[0].low;
        const binWidth = (bins[lastIdx].high - low0) / bins.length || 1;
        returns.forEach(v => {
            let idx = Math.floor((v - low0) / binWidth);
            if (idx < 0) idx = 0;
            if (idx > lastIdx) idx = lastIdx;
            counts[idx]++;
        });
        return counts;
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
