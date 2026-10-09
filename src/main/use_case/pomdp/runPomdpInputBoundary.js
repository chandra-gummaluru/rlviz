// DEPRECATED — partial observability is IN DEVELOPMENT. This file is kept but is no longer
// reachable from the UI (inDevelopmentCard.js is shown instead; main.js's VI handlers no-op while
// observability === 'partial'). See CLAUDE.md "Partial observability (in development)".
// Input boundary for Run POMDP use case (also backs Step, with episodeCount: 1).
class RunPomdpInputBoundary {
    execute(inputData) { throw new Error('Not implemented'); }
}
