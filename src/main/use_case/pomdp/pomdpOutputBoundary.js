// DEPRECATED — partial observability is IN DEVELOPMENT. This file is kept but is no longer
// reachable from the UI (inDevelopmentCard.js is shown instead; main.js's VI handlers no-op while
// observability === 'partial'). See CLAUDE.md "Partial observability (in development)".
// Output boundary interface for POMDP (PO Q-Learning) use cases.
class PomdpOutputBoundary {
    presentComplete(response) { throw new Error('Not implemented'); }
    presentError(message) { throw new Error('Not implemented'); }
}
