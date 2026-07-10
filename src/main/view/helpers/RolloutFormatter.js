// Formats a Monte Carlo rollout's trajectory-so-far as a short human-readable string, e.g.
// "S0 →Hun→ S1 →Eat→ S2 (+5.00)". Pure JS, no p5.js calls, so it can be reused from both
// canvas-drawing code (expectationView.js's mini-panel cards) and plain DOM code (a later
// "Selected Run" right-panel section).
class RolloutFormatter {
    // graph: the Graph aggregate (for node name lookup via getNodeById).
    // rollout: one entry from ExpectationState.rollouts - { trace, rewards, utilities, numSteps }.
    //   trace alternates state/action/state/... entries ({id, type, name}); rewards[k] is the
    //   reward earned on hop k (trace[2k] --trace[2k+1]--> trace[2k+2]).
    // uptoT: the current scrub position (may be fractional while dragging).
    // Returns "" if the rollout hasn't taken any steps yet, or if graph/rollout data is missing -
    // never throws.
    static formatTrajectory(graph, rollout, uptoT) {
        if (!graph || !rollout || !rollout.trace || !rollout.trace.length) return '';

        const effectiveT = Math.floor(Math.min(uptoT, rollout.numSteps));
        if (!(effectiveT > 0)) return '';

        const visitedSlice = rollout.trace.slice(0, 2 * effectiveT + 1);

        const parts = [];
        for (let k = 0; k < visitedSlice.length; k++) {
            const entry = visitedSlice[k];
            const node = graph.getNodeById(entry.id);
            const name = node ? node.name : entry.name;
            const label = RolloutFormatter._abbreviate(name);
            if (k % 2 === 0) {
                // State node
                parts.push(label);
            } else {
                // Action node, rendered as an inline arrow: " →name→ "
                parts.push(`→${label}→`);
            }
        }

        const lastReward = rollout.rewards[effectiveT - 1];
        const rewardStr = isFinite(lastReward)
            ? ` (${lastReward >= 0 ? '+' : '−'}${Math.abs(lastReward).toFixed(2)})`
            : '';

        return parts.join(' ') + rewardStr;
    }

    // Mirrors the exact node-name abbreviation rule used on-canvas by
    // ExpectationView._drawNode(): truncate to 3 chars + ellipsis if longer than 4 chars.
    static _abbreviate(name) {
        return name && name.length > 4 ? name.slice(0, 3) + '…' : (name || '');
    }
}
