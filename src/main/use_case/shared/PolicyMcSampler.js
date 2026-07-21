// Samples a fresh, throwaway batch of Monte Carlo rollouts under an arbitrary policy snapshot -
// independent of whatever's currently loaded into ExpectationState/simulationState - and returns
// the mean discounted return. Backs the Policy log's "MC estimate" column: every logged policy
// gets its own sampled estimate, not whichever rollout population happens to be on screen.
const POLICY_MC_SAMPLER_RUNS = 128; // matches RunExpectationInteractor's EXPECTATION_TOTAL_RUNS

class PolicyMcSampler {
    static estimateValue(graph, traceGenerator, startNode, { policy = {}, policyWeights = {}, timeDependentPolicy = null, maxSteps, gamma }) {
        let total = 0;
        for (let i = 0; i < POLICY_MC_SAMPLER_RUNS; i++) {
            const trace = traceGenerator.generate(startNode, maxSteps * 2 + 1, policy, policyWeights, timeDependentPolicy);
            total += PolicyMcSampler._discountedReturn(graph, trace, gamma);
        }
        return total / POLICY_MC_SAMPLER_RUNS;
    }

    // Same sampling loop as estimateValue() above, but returns every individual run's discounted
    // return instead of only their mean - backs the Policy log chart overlays' per-policy
    // return-distribution histogram (policy-logging.md §4's "64 returns sampled under that
    // policy"), which needs the raw distribution, not just its average. Deliberately a separate,
    // smaller-N (default 64, not 128) sample rather than reusing estimateValue()'s own run count -
    // called lazily, only once a policy's chart chip is actually revealed, and its result is
    // cached by the caller (see ExpectationViewModel), so this never runs on every render.
    static sampleReturns(graph, traceGenerator, startNode, { policy = {}, policyWeights = {}, timeDependentPolicy = null, maxSteps, gamma, numRuns = 64 }) {
        const results = [];
        for (let i = 0; i < numRuns; i++) {
            const trace = traceGenerator.generate(startNode, maxSteps * 2 + 1, policy, policyWeights, timeDependentPolicy);
            results.push(PolicyMcSampler._discountedReturn(graph, trace, gamma));
        }
        return results;
    }

    static _discountedReturn(graph, trace, gamma) {
        const numSteps = Math.floor((trace.length - 1) / 2);
        let g = 0;
        for (let k = 0; k < numSteps; k++) {
            const actionEntry = trace[2 * k + 1];
            const nextStateEntry = trace[2 * k + 2];
            const actionNode = graph.getNodeById(actionEntry.id);
            const transition = actionNode ? actionNode.sas.find(t => t.nextState === nextStateEntry.id) : null;
            const reward = transition ? transition.reward : 0;
            g += Math.pow(gamma, k) * reward;
        }
        return g;
    }
}
