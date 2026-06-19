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
        this.rewardHistory = [];  // Rewards collected at each completed transition
        this.pendingReward = 0;  // Reward awaiting particle animation completion
        this.pendingRewardActionNodeId = null;  // Action node that generated pending reward
        this.currentDecisionProbs = [];  // Available actions with uniform probability
        this.currentOutcomeProbs = [];  // Possible next states with their probabilities

        // Policy settings: stateId -> selected actionId. Missing entries use random action selection.
        this.policy = {};

        // Spinning arrow animation settings
        this.spinningArrowEnabled = true;  // Toggle for spinning arrow animation (on by default)
        this.spinningArrowDuration = 1500;  // Duration in milliseconds (computed dynamically)
        this.spinningArrowTargetIndex = -1;  // Pre-selected edge index to stop at
        this.spinningArrowEdges = [];  // Array of {edgeIndex, probability, targetId}
        this.spinningArrowSequence = [];  // Array of edge indices — the tick order
        this.spinningArrowTickTimestamps = [];  // Cumulative ms timestamps for each tick
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
        this.rewardHistory = [];
        this.pendingReward = 0;
        this.pendingRewardActionNodeId = null;
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

    hideNode(nodeId) {
        this.visibleNodeIds.delete(nodeId);
    }

    hideEdge(fromId, toId) {
        this.visibleEdgeIds.delete(`${fromId}-${toId}`);
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

    // Check if a node has been visited in the trace up to the current position
    hasNodeBeenVisited(nodeId) {
        if (!this.visited || this.currentIndex < 0) return false;

        // Check if the node appears in the trace up to (and including) the current index
        for (let i = 0; i <= this.currentIndex; i++) {
            if (this.visited[i].id === nodeId) {
                return true;
            }
        }
        return false;
    }

    // Check if an edge has been traversed in the trace up to the current position
    hasEdgeBeenTraversed(fromId, toId) {
        if (!this.visited || this.currentIndex < 1) return false;

        // Check if the edge (fromId -> toId) appears in consecutive nodes in the trace
        // up to (and including) the current index
        for (let i = 0; i < this.currentIndex; i++) {
            if (this.visited[i].id === fromId && this.visited[i + 1].id === toId) {
                return true;
            }
        }
        return false;
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
        this.rewardHistory = [];
        this.pendingReward = 0;
        this.pendingRewardActionNodeId = null;
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
    // Reward is stored as pending until particle animation completes
    addReward(reward, actionNodeId) {
        this.pendingReward = reward;
        this.pendingRewardActionNodeId = actionNodeId;
        this.stepCount++;
        this.rewardHistory.push(reward);
    }

    // Commit pending reward to total (called when particles arrive)
    commitReward() {
        this.totalReward += this.pendingReward;
        this.pendingReward = 0;
        this.pendingRewardActionNodeId = null;
    }

    // Check if there is a pending reward awaiting animation
    hasPendingReward() {
        return this.pendingReward !== 0;
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
            rewardHistory: [...this.rewardHistory],
            policy: { ...this.policy },
            decisionProbs: this.currentDecisionProbs,
            outcomeProbs: this.currentOutcomeProbs
        };
    }

    setPolicyAction(stateId, actionId) {
        if (actionId === null || actionId === undefined || actionId === '') {
            delete this.policy[stateId];
            return;
        }
        this.policy[stateId] = actionId;
    }

    getPolicyAction(stateId) {
        return this.policy[stateId] ?? null;
    }

    // Spinning arrow animation methods
    setSpinningArrowEnabled(enabled) {
        this.spinningArrowEnabled = enabled;
    }

    setSpinningArrowDuration(duration) {
        // Clamp duration between 800ms and 3000ms
        this.spinningArrowDuration = Math.max(800, Math.min(3000, duration));
    }

    // Initialize spinning arrow with edges and target selection (discrete tick sequence)
    initSpinningArrow(edges, targetIndex) {
        this.spinningArrowTargetIndex = targetIndex;

        // Store edges (no angle data needed)
        this.spinningArrowEdges = edges.map((edge, index) => ({
            edgeIndex: index,
            probability: edge.probability,
            targetId: edge.targetId
        }));

        // Build tick sequence: cycle through all edge indices 3 times, end on targetIndex
        const numEdges = edges.length;
        const sequence = [];
        for (let cycle = 0; cycle < 3; cycle++) {
            for (let i = 0; i < numEdges; i++) {
                sequence.push(i);
            }
        }
        // Ensure the last element is the target index
        if (sequence.length === 0 || sequence[sequence.length - 1] !== targetIndex) {
            sequence.push(targetIndex);
        }

        this.spinningArrowSequence = sequence;

        // Compute tick durations with quadratic deceleration: 50ms (fast) → 350ms (slow)
        const totalTicks = sequence.length;
        const timestamps = [];
        let cumulative = 0;
        for (let i = 0; i < totalTicks; i++) {
            const t = totalTicks > 1 ? i / (totalTicks - 1) : 1;
            const duration = 50 + (350 - 50) * t * t;  // Quadratic ease: starts fast, slows down
            cumulative += duration;
            timestamps.push(cumulative);
        }

        this.spinningArrowTickTimestamps = timestamps;
        this.spinningArrowDuration = cumulative;

    }

    // Get which edge the arrow is currently pointing at (tick-based)
    getHighlightedEdgeByArrow() {
        if (this.spinningArrowSequence.length === 0) return -1;

        const elapsed = Date.now() - this.phaseStartTime;

        // Find current tick index based on elapsed time vs cumulative timestamps
        for (let i = 0; i < this.spinningArrowTickTimestamps.length; i++) {
            if (elapsed < this.spinningArrowTickTimestamps[i]) {
                return this.spinningArrowSequence[i];
            }
        }

        // Past the end → return final element (the target)
        return this.spinningArrowSequence[this.spinningArrowSequence.length - 1];
    }

    // Clear spinning arrow state
    clearSpinningArrow() {
        this.spinningArrowTargetIndex = -1;
        this.spinningArrowEdges = [];
        this.spinningArrowSequence = [];
        this.spinningArrowTickTimestamps = [];
    }
}
