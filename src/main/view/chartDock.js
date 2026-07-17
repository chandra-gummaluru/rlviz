const CHART_DOCK_MIN_H = 64;
const CHART_DOCK_MAX_H = 340;
const CHART_DOCK_DRAG_THRESHOLD = 3;

const CHART_TYPE_LABELS = {
    convergence: 'Convergence',
    histogram: 'Histogram',
    qtable: 'Q-table',
    mctree: 'MC tree',
    sweephistory: 'Sweep history'
};

const CHART_TYPE_ACCENT = {
    convergence: 'accent-teal',
    histogram: 'accent-orange',
    qtable: 'accent-cyan',
    mctree: 'accent-purple',
    sweephistory: 'accent-teal'
};

// Bottom chart dock for Values mode: a drag-resizable strip with two chart slots (Convergence,
// Histogram, Q-table, MC tree — user-selectable per slot). Only visible while in Values mode;
// mounted/shown/hidden by the mode-lifecycle hooks in main.js.
class ChartDock {
    constructor(canvasViewModel, expectationState, expectationViewModel, valueIterationState) {
        this.viewModel = canvasViewModel;
        this.expectationState = expectationState;
        this.expectationViewModel = expectationViewModel;
        this.valueIterationState = valueIterationState;

        this.containerEl = null;
        this.handleEl = null;
        this.slotsEl = null;
        this.slotBodyEls = [null, null];
        this.slotCaptionEls = [null, null];
        this.slotPickerEls = [null, null];
        this.slotChartInstances = [null, null]; // Chart.js instances (convergence/histogram only)

        this._bounds = { x: 0, width: 0 };

        this._dragging = false;
        this._dragMoved = false;
        this._dragStartY = 0;
        this._dragStartHeight = 0;

        this._boundMove = this._onPointerMove.bind(this);
        this._boundUp = this._onPointerUp.bind(this);
    }

    setup() {
        if (this.containerEl) return;

        const container = document.createElement('div');
        container.className = 'chart-dock';
        document.body.appendChild(container);
        this.containerEl = container;

        const handle = document.createElement('div');
        handle.className = 'chart-dock-handle';
        handle.innerHTML = '<span>&#8964;</span><span class="chart-dock-handle-dots">&#8942;</span><span>&#8964;</span>';
        handle.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        container.appendChild(handle);
        this.handleEl = handle;

        const slots = document.createElement('div');
        slots.className = 'chart-dock-slots';
        container.appendChild(slots);
        this.slotsEl = slots;

        const defaults = [
            this.viewModel.dockState.slot1Chart || 'convergence',
            this.viewModel.dockState.slot2Chart || 'histogram'
        ];

        for (let i = 0; i < 2; i++) {
            const slot = document.createElement('div');
            slot.className = 'chart-dock-slot';

            const header = document.createElement('div');
            header.className = 'chart-dock-slot-header';

            const picker = document.createElement('select');
            picker.className = 'chart-dock-picker';
            Object.keys(CHART_TYPE_LABELS).forEach(type => {
                const opt = document.createElement('option');
                opt.value = type;
                opt.textContent = CHART_TYPE_LABELS[type];
                picker.appendChild(opt);
            });
            picker.value = defaults[i];
            picker.addEventListener('change', () => {
                if (i === 0) this.viewModel.dockState.slot1Chart = picker.value;
                else this.viewModel.dockState.slot2Chart = picker.value;
                this._renderSlot(i);
            });
            header.appendChild(picker);

            const caption = document.createElement('span');
            caption.className = 'chart-dock-caption';
            header.appendChild(caption);

            slot.appendChild(header);

            const body = document.createElement('div');
            body.className = 'chart-dock-slot-body';
            slot.appendChild(body);

            slots.appendChild(slot);
            this.slotBodyEls[i] = body;
            this.slotCaptionEls[i] = caption;
            this.slotPickerEls[i] = picker;
        }

        this.viewModel.dockState.slot1Chart = defaults[0];
        this.viewModel.dockState.slot2Chart = defaults[1];

        this._applyLayout();
        this.hide();
    }

    updateBounds(x, width) {
        this._bounds = { x, width };
        this._applyLayout();
    }

    show() {
        if (!this.containerEl) return;
        this.viewModel.dockState.open = true;
        if (!this.viewModel.dockState.heightPx) {
            this.viewModel.dockState.heightPx = this.viewModel.dockState.preferredHeightPx || 132;
        }
        this.containerEl.style.display = '';
        this._applyLayout();
        this.refresh();
    }

    hide() {
        if (!this.containerEl) return;
        this.containerEl.style.display = 'none';
    }

    // Effective reserved height for canvas layout math: 0 while collapsed-to-handle or closed.
    getReservedHeight() {
        if (!this.viewModel.dockState.open) return 0;
        return this.viewModel.dockState.collapsed ? 16 : this.viewModel.dockState.heightPx;
    }

    _applyLayout() {
        if (!this.containerEl) return;
        const { x, width } = this._bounds;
        const h = this.getReservedHeight();
        this.containerEl.style.left = x + 'px';
        this.containerEl.style.width = width + 'px';
        this.containerEl.style.top = (windowHeight - h) + 'px';
        this.containerEl.style.height = h + 'px';
        if (this.slotsEl) this.slotsEl.style.display = this.viewModel.dockState.collapsed ? 'none' : 'flex';
    }

    refresh() {
        if (!this.containerEl || !this.viewModel.dockState.open || this.viewModel.dockState.collapsed) return;
        this._renderSlot(0);
        this._renderSlot(1);
    }

    _renderSlot(i) {
        const body = this.slotBodyEls[i];
        const picker = this.slotPickerEls[i];
        const caption = this.slotCaptionEls[i];
        if (!body || !picker) return;
        const type = picker.value;

        if (this.slotChartInstances[i]) {
            this.slotChartInstances[i].destroy();
            this.slotChartInstances[i] = null;
        }
        body.innerHTML = '';

        if (type === 'convergence') {
            this._renderConvergence(body, caption);
        } else if (type === 'histogram') {
            this._renderHistogram(body, caption, i);
        } else if (type === 'qtable') {
            this._renderQTable(body, caption);
        } else if (type === 'mctree') {
            this._renderMCTree(body, caption);
        } else if (type === 'sweephistory') {
            this._renderSweepHistory(body, caption);
        }
    }

    // One row per state, one column per sweep 0..T. Cells fill left-to-right as sweeps actually
    // run; unreached sweep columns show "·". The current sweep's column is tinted with the
    // method's accent color.
    _renderSweepHistory(body, caption) {
        caption.textContent = 'V(s) per sweep';
        const vi = this.valueIterationState;
        if (!vi || !vi.initialized || vi.stateIds.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chart-dock-empty';
            empty.textContent = 'Run Value Iteration to populate.';
            body.appendChild(empty);
            return;
        }

        const accentHex = AppPalette.accent[
            ValuesMethodMatrix.resolve(this.viewModel.modelKnown, this.viewModel.observability).accent
        ];
        const current = vi.currentSweepIndex;
        const lastComputed = vi.totalSweeps - 1;

        const table = document.createElement('table');
        table.className = 'chart-dock-qtable';

        // Header: state | k=0 | k=1 | ... | k=T
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const thS = document.createElement('th');
        thS.textContent = 's';
        headRow.appendChild(thS);
        for (let k = 0; k <= vi.T; k++) {
            const th = document.createElement('th');
            th.textContent = `k=${k}`;
            if (k === current) th.style.color = accentHex;
            headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        vi.stateIds.forEach(stateId => {
            const tr = document.createElement('tr');
            const tdS = document.createElement('td');
            tdS.textContent = vi.stateNames[stateId] || `S${stateId}`;
            tdS.className = 'chart-dock-qtable-state';
            tr.appendChild(tdS);

            for (let k = 0; k <= vi.T; k++) {
                const td = document.createElement('td');
                if (k <= lastComputed) {
                    const v = vi.getValues(k)[stateId] ?? 0;
                    td.textContent = v.toFixed(2);
                } else {
                    td.textContent = '·';
                }
                if (k === current) {
                    td.style.color = accentHex;
                    td.style.fontWeight = '700';
                }
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
    }

    _renderConvergence(body, caption) {
        caption.textContent = 'V̂(S₀) vs V*';
        if (typeof Chart === 'undefined') return;
        const { mcMeans, mcSEs, mcLabels, viValues, viLabels, vStar } = ChartDataBuilders.buildConvergenceData(
            this.expectationState, this.valueIterationState);

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        const maxLen = Math.max(mcLabels.length, viLabels.length, 1);

        // All datasets use explicit {x,y} points on a shared linear x-axis (rather than a
        // category axis) so the hover marker below can place a vertical line at an arbitrary x.
        const datasets = [];

        // +-SE shaded band around the MC line, drawn first so the solid mean line (pushed below)
        // renders on top of it. Chart.js fills the area between consecutive datasets via the
        // "-1" relative fill target, so the lower bound (no visible line) must be pushed
        // immediately before the upper bound (fill: '-1').
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
                label: 'E[G] (MC)',
                data: mcMeans.map((y, x) => ({ x, y })),
                borderColor: AppPalette.accent.orange,
                borderWidth: 1.5, pointRadius: 1, tension: 0.3
            });
        }
        if (vStar !== null) {
            datasets.push({
                label: 'V*',
                data: [{ x: 0, y: vStar }, { x: maxLen - 1, y: vStar }],
                borderColor: AppPalette.text.muted,
                borderDash: [4, 4], borderWidth: 1, pointRadius: 0
            });
        }

        // Live-linking: hovering a run card marks the current scrubber t on this chart's own
        // time axis (a dashed vertical yellow line), connecting "which run" to "where we are".
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

        this.slotChartInstances[0] = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { type: 'linear', ticks: { font: { size: 9 }, color: AppPalette.text.muted, stepSize: 1 }, grid: { color: AppPalette.border.chartGrid } },
                    y: { ticks: { font: { size: 9 }, color: AppPalette.text.muted }, grid: { color: AppPalette.border.chartGrid } }
                }
            }
        });
    }

    _renderHistogram(body, caption, slotIndex) {
        caption.textContent = 'Return distribution';
        if (typeof Chart === 'undefined') return;
        const t = this.expectationState.currentT;
        const { bins, counts } = ChartDataBuilders.buildHistogramData(this.expectationState, t);
        if (bins.length === 0) return;

        const highlightedRun = this.expectationViewModel ? this.expectationViewModel.highlightedRun : null;
        const highlightedBinIdx = highlightedRun !== null
            ? this._binIndexForRun(highlightedRun, t)
            : null;

        const bgColors = bins.map((_, i) => {
            if (highlightedBinIdx !== null) {
                return i === highlightedBinIdx ? AppPalette.accent.yellow : ColorUtils.applyAlpha(AppPalette.text.muted, 40);
            }
            return i < bins.length / 2 ? AppPalette.accent.red : AppPalette.accent.orange;
        });

        const canvas = document.createElement('canvas');
        body.appendChild(canvas);
        this.slotChartInstances[slotIndex] = new Chart(canvas.getContext('2d'), {
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

    _binIndexForRun(runIndex, t) {
        const { runIndexByBin } = ChartDataBuilders.buildHistogramData(this.expectationState, t);
        if (!runIndexByBin) return null;
        for (let i = 0; i < runIndexByBin.length; i++) {
            if (runIndexByBin[i].includes(runIndex)) return i;
        }
        return null;
    }

    _renderQTable(body, caption) {
        caption.textContent = 'Greedy action ★';
        const { rows } = ChartDataBuilders.buildQTableData(this.valueIterationState);
        const table = document.createElement('table');
        table.className = 'chart-dock-qtable';
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chart-dock-empty';
            empty.textContent = 'Run Value Iteration to populate.';
            body.appendChild(empty);
            return;
        }
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

    _renderMCTree(body, caption) {
        caption.textContent = 'Visit counts';
        const { startName, branches } = ChartDataBuilders.buildMCTreeData(this.expectationState);
        if (branches.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'chart-dock-empty';
            empty.textContent = 'No rollouts yet.';
            body.appendChild(empty);
            return;
        }

        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 440 92');
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.classList.add('chart-dock-mctree');

        const startX = 20, startY = 46;
        const actionX = 160;
        const stepY = 92 / (branches.length + 1);

        const startCircle = document.createElementNS(svgNS, 'circle');
        startCircle.setAttribute('cx', startX);
        startCircle.setAttribute('cy', startY);
        startCircle.setAttribute('r', 4);
        startCircle.setAttribute('fill', AppPalette.accent.cyan);
        svg.appendChild(startCircle);

        const highlightedRun = this.expectationViewModel ? this.expectationViewModel.highlightedRun : null;

        branches.forEach((branch, i) => {
            const isHovered = highlightedRun !== null && branch.runIndices.includes(highlightedRun);
            const strokeColor = isHovered ? AppPalette.accent.yellow : AppPalette.edge.default;
            const strokeWidth = isHovered ? '2.5' : '1';

            const y = stepY * (i + 1);
            const line1 = document.createElementNS(svgNS, 'line');
            line1.setAttribute('x1', startX); line1.setAttribute('y1', startY);
            line1.setAttribute('x2', actionX); line1.setAttribute('y2', y);
            line1.setAttribute('stroke', strokeColor);
            line1.setAttribute('stroke-width', strokeWidth);
            svg.appendChild(line1);

            const label1 = document.createElementNS(svgNS, 'text');
            label1.setAttribute('x', (startX + actionX) / 2);
            label1.setAttribute('y', (startY + y) / 2 - 3);
            label1.setAttribute('font-size', '7');
            label1.setAttribute('fill', AppPalette.text.muted);
            label1.setAttribute('text-anchor', 'middle');
            label1.textContent = `${branch.actionName} (${branch.count}×)`;
            svg.appendChild(label1);

            const nextX = 340;
            const line2 = document.createElementNS(svgNS, 'line');
            line2.setAttribute('x1', actionX); line2.setAttribute('y1', y);
            line2.setAttribute('x2', nextX); line2.setAttribute('y2', y);
            line2.setAttribute('stroke', strokeColor);
            line2.setAttribute('stroke-width', strokeWidth);
            svg.appendChild(line2);

            const dot = document.createElementNS(svgNS, 'circle');
            dot.setAttribute('cx', nextX); dot.setAttribute('cy', y);
            dot.setAttribute('r', 3);
            dot.setAttribute('fill', AppPalette.accent.purple);
            svg.appendChild(dot);

            const meanReward = branch.terminalRewards.reduce((a, b) => a + b, 0) / branch.terminalRewards.length;
            const rewardLabel = document.createElementNS(svgNS, 'text');
            rewardLabel.setAttribute('x', nextX + 8);
            rewardLabel.setAttribute('y', y + 3);
            rewardLabel.setAttribute('font-size', '7');
            rewardLabel.setAttribute('fill', meanReward >= 0 ? AppPalette.reward.positive : AppPalette.reward.negative);
            rewardLabel.textContent = `${branch.nextStateName} ${meanReward >= 0 ? '+' : ''}${meanReward.toFixed(1)}`;
            svg.appendChild(rewardLabel);
        });

        body.appendChild(svg);
    }

    _onPointerDown(e) {
        this._dragging = true;
        this._dragMoved = false;
        this._dragStartY = e.clientY;
        this._dragStartHeight = this.viewModel.dockState.heightPx || this.viewModel.dockState.preferredHeightPx;
        this.handleEl.setPointerCapture(e.pointerId);
        this.handleEl.addEventListener('pointermove', this._boundMove);
        this.handleEl.addEventListener('pointerup', this._boundUp);
        this.handleEl.addEventListener('pointercancel', this._boundUp);
    }

    _onPointerMove(e) {
        if (!this._dragging) return;
        const dy = e.clientY - this._dragStartY;
        if (Math.abs(dy) > CHART_DOCK_DRAG_THRESHOLD) this._dragMoved = true;
        if (!this._dragMoved) return;

        if (this.viewModel.dockState.collapsed) this.viewModel.dockState.collapsed = false;
        const newHeight = Math.max(CHART_DOCK_MIN_H, Math.min(CHART_DOCK_MAX_H, this._dragStartHeight - dy));
        this.viewModel.dockState.heightPx = newHeight;
        this.viewModel.dockState.preferredHeightPx = newHeight;
        this._applyLayout();
        if (this.onResize) this.onResize();
    }

    _onPointerUp(e) {
        if (!this._dragging) return;
        this._dragging = false;
        this.handleEl.removeEventListener('pointermove', this._boundMove);
        this.handleEl.removeEventListener('pointerup', this._boundUp);
        this.handleEl.removeEventListener('pointercancel', this._boundUp);

        if (!this._dragMoved) {
            // Click without drag: toggle collapse to just the handle strip.
            this.viewModel.dockState.collapsed = !this.viewModel.dockState.collapsed;
            this._applyLayout();
            if (!this.viewModel.dockState.collapsed) this.refresh();
            if (this.onResize) this.onResize();
        }
    }

    teardown() {
        if (this.slotChartInstances[0]) { this.slotChartInstances[0].destroy(); this.slotChartInstances[0] = null; }
        if (this.slotChartInstances[1]) { this.slotChartInstances[1].destroy(); this.slotChartInstances[1] = null; }
        if (this.containerEl) {
            this.containerEl.remove();
            this.containerEl = null;
        }
    }
}
