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

        // Simulation statistics
        this.initialState = null;  // Starting state node
        this.totalReward = 0;  // Accumulated reward
        this.stepCount = 0;  // Number of state-action-state transitions completed
        this.currentDecisionProbs = [];  // Available actions with uniform probability
        this.currentOutcomeProbs = [];  // Possible next states with their probabilities
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

        // Reset simulation statistics
        this.initialState = visited[0];
        this.totalReward = 0;
        this.stepCount = 0;
        this.currentDecisionProbs = [];
        this.currentOutcomeProbs = [];
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

        // Reset simulation statistics
        this.initialState = null;
        this.totalReward = 0;
        this.stepCount = 0;
        this.currentDecisionProbs = [];
        this.currentOutcomeProbs = [];
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

    // Update decision probabilities when at a state node
    setDecisionProbs(stateNode, graph) {
        this.currentDecisionProbs = [];
        if (!stateNode || stateNode.type !== 'state') return;

        const availableActions = stateNode.actions || [];
        const uniformProb = availableActions.length > 0 ? 1.0 / availableActions.length : 0;

        availableActions.forEach(actionId => {
            const actionNode = graph.getNodeById(actionId);
            if (actionNode) {
                this.currentDecisionProbs.push({
                    actionName: actionNode.name,
                    probability: uniformProb
                });
            }
        });
    }

    // Update outcome probabilities when at an action node
    setOutcomeProbs(actionNode, graph) {
        this.currentOutcomeProbs = [];
        if (!actionNode || actionNode.type !== 'action') return;

        const transitions = actionNode.sas || [];
        transitions.forEach(transition => {
            const stateNode = graph.getNodeById(transition.nextState);
            if (stateNode) {
                this.currentOutcomeProbs.push({
                    stateName: stateNode.name,
                    probability: transition.probability,
                    reward: transition.reward
                });
            }
        });
    }

    // Add reward from a transition and increment step count
    addReward(reward) {
        this.totalReward += reward;
        this.stepCount++;
    }

    // Get current state (for display)
    getCurrentState() {
        if (!this.currentNode || this.currentNode.type !== 'state') {
            return null;
        }
        return this.currentNode;
    }

    // Get simulation statistics for UI
    getSimulationStats() {
        return {
            initialState: this.initialState,
            currentState: this.getCurrentState(),
            totalReward: this.totalReward,
            stepCount: this.stepCount,
            decisionProbs: this.currentDecisionProbs,
            outcomeProbs: this.currentOutcomeProbs
        };
    }
}
