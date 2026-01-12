// Domain entity for managing simulation replay state
class SimulationState {
    constructor() {
        // Trace data
        this.visited = [];  // Array of {id, type, name, meta} representing the path
        this.currentIndex = -1;  // Current position in visited array (-1 = not started)
        this.currentNode = null;  // Reference to current node object

        // State flags
        this.replayInitialized = false;  // Has initialization animation completed?
        this.phase = 'idle';  // Current phase: 'idle', 'pause', 'highlight', 'transition'
        this.isPlaying = false;  // Is continuous play active?

        // Animation timing
        this.phaseStartTime = 0;  // When current phase started
        this.phaseDuration = 0;  // How long current phase should last

        // Visual state
        this.highlightedEdge = null;  // Currently highlighted edge {fromId, toId}
        this.visibleNodeIds = new Set();  // Set of node IDs that should be visible
        this.visibleEdgeIds = new Set();  // Set of edge IDs (fromId-toId) that should be visible
    }

    // Initialize with a generated trace
    setTrace(visited) {
        if (!visited || visited.length === 0) {
            throw new Error('Trace must contain at least one node');
        }
        if (visited[0].type !== 'state') {
            throw new Error('First node in trace must be a state node');
        }
        this.visited = visited;
        this.currentIndex = -1;
        this.currentNode = null;
        this.replayInitialized = false;
        this.clearVisualState();
    }

    // Start the replay (after initialization)
    start() {
        if (this.visited.length === 0) {
            throw new Error('Cannot start replay without a trace');
        }
        this.currentIndex = 0;
        this.currentNode = this.visited[0];
        this.replayInitialized = true;
        this.phase = 'idle';
    }

    // Advance to next node in trace
    advance() {
        if (this.currentIndex < this.visited.length - 1) {
            this.currentIndex++;
            this.currentNode = this.visited[this.currentIndex];
            return true;
        }
        return false;  // Reached end of trace
    }

    // Check if we can advance further
    canAdvance() {
        return this.currentIndex < this.visited.length - 1;
    }

    // Get next node without advancing
    peekNext() {
        if (this.canAdvance()) {
            return this.visited[this.currentIndex + 1];
        }
        return null;
    }

    // Get current node's type
    getCurrentType() {
        return this.currentNode ? this.currentNode.type : null;
    }

    // Get next node's type
    getNextType() {
        const next = this.peekNext();
        return next ? next.type : null;
    }

    // Set animation phase
    setPhase(phase, duration = 0) {
        this.phase = phase;
        this.phaseStartTime = Date.now();
        this.phaseDuration = duration;
    }

    // Check if current phase is complete
    isPhaseComplete() {
        if (this.phaseDuration === 0) return true;
        return Date.now() - this.phaseStartTime >= this.phaseDuration;
    }

    // Get remaining time in current phase
    getPhaseRemainingTime() {
        if (this.phaseDuration === 0) return 0;
        const elapsed = Date.now() - this.phaseStartTime;
        return Math.max(0, this.phaseDuration - elapsed);
    }

    // Visual state management
    revealNode(nodeId) {
        this.visibleNodeIds.add(nodeId);
    }

    revealEdge(fromId, toId) {
        this.visibleEdgeIds.add(`${fromId}-${toId}`);
    }

    highlightEdge(fromId, toId) {
        this.highlightedEdge = { fromId, toId };
    }

    clearHighlight() {
        this.highlightedEdge = null;
    }

    isNodeVisible(nodeId) {
        return this.visibleNodeIds.has(nodeId);
    }

    isEdgeVisible(fromId, toId) {
        return this.visibleEdgeIds.has(`${fromId}-${toId}`);
    }

    isEdgeHighlighted(fromId, toId) {
        if (!this.highlightedEdge) return false;
        return this.highlightedEdge.fromId === fromId &&
               this.highlightedEdge.toId === toId;
    }

    clearVisualState() {
        this.highlightedEdge = null;
        this.visibleNodeIds.clear();
        this.visibleEdgeIds.clear();
    }

    // Hide all nodes and edges (for initialization animation)
    hideAll() {
        this.clearVisualState();
    }

    // Reveal only the starting node
    revealStartOnly() {
        this.clearVisualState();
        if (this.visited.length > 0) {
            this.revealNode(this.visited[0].id);
        }
    }

    // Reset to initial state
    reset() {
        this.visited = [];
        this.currentIndex = -1;
        this.currentNode = null;
        this.replayInitialized = false;
        this.phase = 'idle';
        this.isPlaying = false;
        this.phaseStartTime = 0;
        this.phaseDuration = 0;
        this.clearVisualState();
    }

    // Play/Pause controls
    play() {
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
    }

    // Get status for debugging/UI
    getStatus() {
        return {
            initialized: this.replayInitialized,
            phase: this.phase,
            currentIndex: this.currentIndex,
            traceLength: this.visited.length,
            canAdvance: this.canAdvance(),
            currentType: this.getCurrentType(),
            nextType: this.getNextType()
        };
    }
}
