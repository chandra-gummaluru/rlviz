// Inline Q-table + Convergence charts for Iteration's left pane "Chart" view (Phase 3b
// follow-on) - a real DOM component (like expectationChartView.js, not a p5-canvas overlay),
// layered over the canvas region mainView.js's VI draw dispatch leaves for the left pane when
// leftView === 'chart'. Fixed layout (Q-table on top, Convergence below), matching
// ExpectationChartView's own established simplification (no per-slot picker). Reuses
// ChartDataBuilders' existing pure functions verbatim - no new chart math here, only a new
// render target. Applies to all 3 split quadrants (unlike the States view's backup diagram,
// which is known:full-only) - Q-table and convergence data are equally real for Belief
// Iteration and PO Q-Learning.
class ViChartView {
    constructor(canvasViewModel, valueIterationState, expectationState) {
        this.viewModel = canvasViewModel;
        this.viState = valueIterationState;
        this.expectationState = expectationState;

        this.containerEl = null;
        this._qtableBodyEl = null;
        this._convergenceBodyEl = null;
        this._convergenceChartInstance = null;
        this._bounds = null;
    }

    // Builds one card (header row + body) - mirrors expectationChartView.js's own slot markup
    // exactly, so both Chart views share the same box treatment.
    _buildSlot(container, captionText) {
        const slot = document.createElement('div');
        slot.className = 'vi-chart-view-slot';

        const header = document.createElement('div');
        header.className = 'vi-chart-view-header';

        const caption = document.createElement('span');
        caption.className = 'vi-chart-view-caption';
        caption.textContent = captionText;
        header.appendChild(caption);

        const stat = document.createElement('span');
        stat.className = 'vi-chart-view-stat';
        header.appendChild(stat);

        slot.appendChild(header);

        const body = document.createElement('div');
        body.className = 'vi-chart-view-body';
        slot.appendChild(body);

        container.appendChild(slot);
        return { body, stat };
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'vi-chart-view';
        document.body.appendChild(container);
        this.containerEl = container;

        const qtable = this._buildSlot(container, 'Greedy action ★');
        this._qtableBodyEl = qtable.body;

        const convergence = this._buildSlot(container, 'V̂(S₀) vs V*');
        this._convergenceBodyEl = convergence.body;

        this.hide();
    }

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
        this._renderQTable();
        this._renderConvergence();
    }

    _renderQTable() {
        const body = this._qtableBodyEl;
        if (!body) return;
        body.innerHTML = '';

        const { rows } = ChartDataBuilders.buildQTableData(this.viState);
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chart-dock-empty';
            empty.textContent = 'Run Value Iteration to populate.';
            body.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.className = 'chart-dock-qtable';
        rows.forEach(row => {
            row.actions.forEach((a, ai) => {
                const tr = document.createElement('tr');
                if (ai === 0) {
                    const tdS = document.createElement('td');
                    tdS.textContent = row.stateName;
                    tdS.rowSpan = row.actions.length;
                    tdS.className = 'chart-dock-qtable-state';
                    tr.appendChild(tdS);
                }
                const tdA = document.createElement('td');
                tdA.textContent = a.actionName;
                tr.appendChild(tdA);
                const tdQ = document.createElement('td');
                tdQ.textContent = a.qValue.toFixed(2) + (a.isBest ? ' ★' : '');
                if (a.isBest) tdQ.classList.add('chart-dock-qtable-best');
                tr.appendChild(tdQ);
                table.appendChild(tr);
            });
        });
        body.appendChild(table);
    }

    _renderConvergence() {
        const body = this._convergenceBodyEl;
        if (!body) return;
        if (this._convergenceChartInstance) {
            this._convergenceChartInstance.destroy();
            this._convergenceChartInstance = null;
        }
        body.innerHTML = '';
        if (typeof Chart === 'undefined') return;

        const { mcMeans, mcSEs, viValues, vStar } = ChartDataBuilders.buildConvergenceData(
            this.expectationState, this.viState);

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(mcMeans.length, viValues.length, 1);

        const datasets = [];
        if (mcMeans.length > 0 && mcSEs.length === mcMeans.length) {
            datasets.push({
                label: 'E[G] − SE',
                data: mcMeans.map((y, x) => ({ x, y: y - (mcSEs[x] || 0) })),
                borderColor: 'transparent', pointRadius: 0, fill: false
            });
            datasets.push({
                label: 'E[G] ± SE',
                data: mcMeans.map((y, x) => ({ x, y: y + (mcSEs[x] || 0) })),
                borderColor: 'transparent', pointRadius: 0, fill: '-1',
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

        // Draws a solid dot + the numeric value next to the final point of whichever dataset(s)
        // are flagged `_labelEndpoint: true` - see expectationChartView.js's identical plugin
        // (this is a small, per-chart-instance copy, not a shared module, matching this
        // codebase's existing one-file-per-view convention for these Chart views).
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

        this._convergenceChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            plugins: [endpointPlugin],
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                layout: { padding: { right: 36 } },
                plugins: {
                    legend: {
                        display: true, position: 'top', align: 'end',
                        labels: {
                            boxWidth: 16, boxHeight: 2, font: { size: 10 }, color: AppPalette.text.muted,
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

    show() {
        if (!this.containerEl) return;
        this.containerEl.style.display = '';
        this.refresh();
    }

    hide() {
        if (this.containerEl) this.containerEl.style.display = 'none';
    }
}
