// Pure data-shaping functions for the bottom chart dock. No DOM/Chart.js instantiation here so
// these stay reusable/testable independent of how a chart type actually renders.
const ChartDataBuilders = {
    // Teal VI-history line (value at S0 per sweep, converging to V*) + orange MC running-mean
    // line (of V_hat(S0) up to the current scrubber t). The two lines' x-axes are both simple
    // "step index" counters (VI sweep index / MC timestep) rather than a strictly shared unit —
    // treated as loosely comparable "iteration count" axes converging to the same asymptote.
    buildConvergenceData(expectationState, valueIterationState) {
        const mcMeans = expectationState && expectationState.computed
            ? expectationState.getMeansOverTime().slice(0, expectationState.currentT + 1)
            : [];
        const mcSEs = expectationState && expectationState.computed
            ? expectationState.getSEsOverTime().slice(0, expectationState.currentT + 1)
            : [];
        const mcLabels = mcMeans.map((_, i) => i);

        let viValues = [];
        let vStar = null;
        if (valueIterationState && valueIterationState.initialized && valueIterationState.stateIds.length > 0) {
            const s0 = valueIterationState.stateIds[0];
            // history[k] is now {V, Q, policy, backupDetails, delta} - read V[s0], not col[s0].
            viValues = valueIterationState.history.map(entry => entry.V[s0] ?? 0);
            vStar = viValues.length > 0 ? viValues[viValues.length - 1] : null;
        }
        const viLabels = viValues.map((_, i) => i);

        return { mcMeans, mcSEs, mcLabels, viValues, viLabels, vStar };
    },

    // Bins the current scrubber-t utilities into binCount equal-width bins spanning the actual
    // [min,max] of the sampled returns (not a hardcoded literal range), so it degrades gracefully
    // for graphs with arbitrary/negative reward magnitudes.
    buildHistogramData(expectationState, t, binCount = 6) {
        if (!expectationState || !expectationState.computed) return { bins: [], counts: [] };
        const utils = expectationState.getAllUtilitiesAtT(t).filter(u => typeof u === 'number' && isFinite(u));
        if (utils.length === 0) return { bins: [], counts: [] };

        const min = Math.min(...utils);
        const max = Math.max(...utils);
        const range = max - min || 1;
        const binWidth = range / binCount;
        const counts = new Array(binCount).fill(0);
        const runIndexByBin = Array.from({ length: binCount }, () => []);

        const allUtils = expectationState.getAllUtilitiesAtT(t);
        allUtils.forEach((u, i) => {
            if (typeof u !== 'number' || !isFinite(u)) return;
            let idx = Math.floor((u - min) / binWidth);
            if (idx >= binCount) idx = binCount - 1;
            if (idx < 0) idx = 0;
            counts[idx]++;
            runIndexByBin[idx].push(i);
        });

        const bins = Array.from({ length: binCount }, (_, i) => ({
            label: `${(min + i * binWidth).toFixed(1)}…${(min + (i + 1) * binWidth).toFixed(1)}`,
            low: min + i * binWidth,
            high: min + (i + 1) * binWidth
        }));

        return { bins, counts, runIndexByBin };
    },

    // Reshapes ValueIterationState's already-computed Q-values/best-actions at the final column
    // into a plain { rows: [{stateId, stateName, actions:[{actionId, actionName, qValue, isBest}]}] }
    // structure for a read-only display table (no VI-mode explain-click wiring).
    buildQTableData(valueIterationState) {
        if (!valueIterationState || !valueIterationState.initialized) return { rows: [] };
        const colIdx = valueIterationState.totalSweeps - 1;
        const rows = valueIterationState.stateIds.map(stateId => {
            const actionQs = valueIterationState.getQValues(colIdx, stateId);
            const bestActionId = valueIterationState.getBestAction(colIdx, stateId);
            return {
                stateId,
                stateName: valueIterationState.stateNames[stateId] || `S${stateId}`,
                actions: actionQs.map(aq => ({
                    actionId: aq.actionId,
                    actionName: aq.actionName,
                    qValue: valueIterationState.getEffectiveQValue(stateId, aq.actionId, aq.qValue),
                    isBest: aq.actionId === bestActionId
                }))
            };
        });
        return { rows };
    },

    // Multi-sweep-column shape for ViChartView's "Expected value" table (handoff 2's own
    // redesign) - one column per computed sweep (t = 0..currentSweepIndex, t = 0 all-zero), rows
    // fixed by graph structure (every state x every one of its actions) so a state's row exists
    // before any value has been computed for it. cellsByColumn[t][stateId][actionId] gives the
    // per-cell {qValue, isBest} - isBest resolved per (sweep, state), not globally, since the
    // greedy action can differ sweep to sweep. Pure function, no DOM - same convention as every
    // other builder here; ViChartView owns the collapse-behind-"..." older-column UI state.
    buildQTableColumns(valueIterationState) {
        if (!valueIterationState || !valueIterationState.initialized) return { columns: [], rows: [], cellsByColumn: {} };
        const totalSweeps = valueIterationState.totalSweeps;
        const columns = [];
        for (let t = 0; t < totalSweeps; t++) columns.push(t);

        // The action list per state is a structural graph property, identical at every sweep -
        // sweep 0 alone just happens to carry no Q values yet (ValueIterationState.initialize()'s
        // own Q0[id] = []), so read the row shape from the LATEST sweep (same limitation
        // buildQTableData() already had: before any real sweep has run, there is nothing to show).
        const latestSweep = Math.max(totalSweeps - 1, 0);
        const rows = valueIterationState.stateIds.map(stateId => ({
            stateId,
            stateName: valueIterationState.stateNames[stateId] || `S${stateId}`,
            actions: valueIterationState.getQValues(latestSweep, stateId).map(aq => ({ actionId: aq.actionId, actionName: aq.actionName }))
        }));

        const cellsByColumn = {};
        columns.forEach(t => {
            const byState = {};
            valueIterationState.stateIds.forEach(stateId => {
                const actionQs = valueIterationState.getQValues(t, stateId);
                const bestActionId = valueIterationState.getBestAction(t, stateId);
                const byAction = {};
                actionQs.forEach(aq => {
                    byAction[aq.actionId] = {
                        qValue: valueIterationState.getEffectiveQValue(stateId, aq.actionId, aq.qValue),
                        isBest: aq.actionId === bestActionId
                    };
                });
                byState[stateId] = byAction;
            });
            cellsByColumn[t] = byState;
        });

        return { columns, rows, cellsByColumn };
    },

    // Same per-action row shape buildQTableData() produces, but for exactly one state at an
    // explicit sweep index - powers viEquationView.js's focused Q-table, which needs a specific
    // (possibly non-live, hovered/pinned) sweep rather than always the latest one.
    buildQTableRowForState(valueIterationState, stateId, sweepIndex) {
        if (!valueIterationState || !valueIterationState.initialized) return { rows: [] };
        const actionQs = valueIterationState.getQValues(sweepIndex, stateId);
        const bestActionId = valueIterationState.getBestAction(sweepIndex, stateId);
        const rows = actionQs.map(aq => ({
            actionId: aq.actionId,
            actionName: aq.actionName,
            qValue: valueIterationState.getEffectiveQValue(stateId, aq.actionId, aq.qValue),
            isBest: aq.actionId === bestActionId
        }));
        return { rows };
    },

    // Aggregates the displayed rollouts into a visit-count tree: start state -> first action ->
    // resulting next state, with visit counts and terminal-reward samples per branch.
    buildMCTreeData(expectationState) {
        if (!expectationState || !expectationState.computed) return { startName: '', branches: [] };
        const slice = expectationState.getDisplaySlice();
        const groups = new Map();

        slice.forEach((rollout, runIndex) => {
            const actionEntry = rollout.trace[1];
            const nextStateEntry = rollout.trace[2];
            if (!actionEntry || !nextStateEntry) return;
            const key = `${actionEntry.id}:${nextStateEntry.id}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    actionId: actionEntry.id,
                    actionName: actionEntry.name,
                    nextStateId: nextStateEntry.id,
                    nextStateName: nextStateEntry.name,
                    count: 0,
                    runIndices: [],
                    terminalRewards: []
                });
            }
            const g = groups.get(key);
            g.count++;
            g.runIndices.push(runIndex);
            const lastReward = rollout.rewards && rollout.rewards.length > 0
                ? rollout.rewards[rollout.rewards.length - 1]
                : 0;
            g.terminalRewards.push(lastReward);
        });

        const startEntry = slice[0] ? slice[0].trace[0] : null;
        return { startName: startEntry ? startEntry.name : '', branches: Array.from(groups.values()) };
    }
};
