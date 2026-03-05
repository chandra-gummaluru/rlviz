// Interactor for Step simulation action (advance one transition with animation)
class StepInteractor extends StepInputBoundary {
    constructor(simulationState, traceGenerator, outputBoundary, startNodeProvider) {
        super();
        this.simulationState = simulationState;
        this.traceGenerator = traceGenerator;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;

        // Timing constants (in milliseconds) - same as PlayInteractor
        this.TIMING = {
            PRE_SETUP_PAUSE: 500,
            POST_ERASE_PAUSE: 300,
            CAMERA_CENTER: 600,
            DECISION_PAUSE: 400,
            EDGE_HIGHLIGHT: 600,
            TRANSITION_PAUSE: 300,
            CAMERA_TRANSITION: 600
        };
    }

    execute(inputData) {
        if (!this.simulationState.replayInitialized) {
            // First Step click: Initialize without auto-playing
            this.runInitialization(inputData);
        } else {
            // Subsequent Step clicks: Advance one step with animation
            this.stepWithAnimation(inputData);
        }
    }

    /**
     * Initialization sequence (first Step click)
     */
    async runInitialization(inputData) {
        // 1. Get start node
        const startNode = this.startNodeProvider();

        // 2. Validate start node
        if (!startNode) {
            this.outputBoundary.presentError('Please select a start node first (double-click a state node)');
            return;
        }

        if (startNode.type !== 'state') {
            this.outputBoundary.presentError('Starting node must be a state node');
            return;
        }

        // 3. Generate trace
        console.log('Generating trace from start node:', startNode.getName());
        const visited = this.traceGenerator.generate(startNode, 50);
        this.simulationState.setTrace(visited);

        console.log('Trace generated:', visited.length, 'nodes');

        // 4. Run initialization animation sequence
        await this.animateInitialization(inputData);
    }

    /**
     * Initialization animation sequence (same as PlayInteractor but without auto-play)
     */
    async animateInitialization(inputData) {
        this.outputBoundary.presentInitializationStart();

        // Phase 1: PRE-SETUP PAUSE
        this.simulationState.setPhase('pause', this.TIMING.PRE_SETUP_PAUSE);
        this.outputBoundary.presentPhaseChange('pause', this.TIMING.PRE_SETUP_PAUSE);
        await this.waitForPhase();

        // Phase 2: ERASE / RESET PHASE
        this.simulationState.hideAll();
        this.simulationState.revealStartOnly();
        this.outputBoundary.presentPhaseChange('reveal', 0);

        // Phase 3: POST-ERASE PAUSE
        this.simulationState.setPhase('pause', this.TIMING.POST_ERASE_PAUSE);
        this.outputBoundary.presentPhaseChange('pause', this.TIMING.POST_ERASE_PAUSE);
        await this.waitForPhase();

        // Phase 4: CAMERA CENTERING
        this.simulationState.setPhase('transition', this.TIMING.CAMERA_CENTER);
        this.outputBoundary.presentPhaseChange('center_camera', this.TIMING.CAMERA_CENTER);
        await this.waitForPhase();

        // Phase 5: COMPLETE - Set initialized but DON'T auto-start playing
        this.simulationState.start();
        this.simulationState.pause(); // Keep it paused (different from PlayInteractor)
        this.simulationState.setPhase('idle', 0);

        // Update probabilities for starting node
        this.updateProbabilitiesForCurrentNode();

        this.outputBoundary.presentInitializationComplete();
        console.log('Initialization complete, ready for stepping');
    }

    /**
     * Execute one step with animation (same as PlayInteractor.playNextStep but doesn't loop)
     */
    async stepWithAnimation(inputData) {
        // Ensure simulation is paused
        if (this.simulationState.isPlaying) {
            this.simulationState.pause();
        }

        // Check if we can advance
        if (!this.simulationState.canAdvance()) {
            this.outputBoundary.presentTraceEnd();
            return;
        }

        const currentNode = this.simulationState.currentNode;
        const nextNode = this.simulationState.peekNext();

        console.log(`Step: ${currentNode.type} (${currentNode.name}) -> ${nextNode.type} (${nextNode.name})`);

        // Animate the transition
        await this.animateTransition(currentNode, nextNode);
    }

    /**
     * Animate transition from current node to next node
     * Shows all outgoing edges, highlights chosen edge, moves to next node
     * (Same as PlayInteractor.animateTransition)
     */
    async animateTransition(fromNode, toNode) {
        this.outputBoundary.presentRoundStart(fromNode, toNode);

        // Phase 1: REVEAL ALL OUTGOING EDGES AND UPDATE PROBABILITIES
        if (fromNode.type === 'state') {
            // Reveal all action nodes connected from this state
            const stateNodeInGraph = this.getNodeFromGraph(fromNode.id);
            if (stateNodeInGraph && stateNodeInGraph.actions) {
                stateNodeInGraph.actions.forEach(actionId => {
                    this.simulationState.revealNode(actionId);
                    this.simulationState.revealEdge(fromNode.id, actionId);
                });
            }
            // Update decision probabilities p(a|s)
            if (stateNodeInGraph && this.traceGenerator && this.traceGenerator.graph) {
                this.simulationState.setDecisionProbs(stateNodeInGraph, this.traceGenerator.graph);
            }
        } else if (fromNode.type === 'action') {
            // Reveal all state nodes connected from this action
            const actionNodeInGraph = this.getNodeFromGraph(fromNode.id);
            if (actionNodeInGraph && actionNodeInGraph.sas) {
                actionNodeInGraph.sas.forEach(transition => {
                    this.simulationState.revealNode(transition.nextState);
                    this.simulationState.revealEdge(fromNode.id, transition.nextState);
                });
            }
            // Update outcome probabilities p(s'|a,s) and track reward
            if (actionNodeInGraph && this.traceGenerator && this.traceGenerator.graph) {
                this.simulationState.setOutcomeProbs(actionNodeInGraph, this.traceGenerator.graph);

                // Find the transition that leads to toNode and add its reward
                const transition = actionNodeInGraph.sas.find(t => t.nextState === toNode.id);
                if (transition) {
                    this.simulationState.addReward(transition.reward);
                }
            }
        }

        this.simulationState.setPhase('reveal', this.TIMING.DECISION_PAUSE);
        this.outputBoundary.presentPhaseChange('reveal', this.TIMING.DECISION_PAUSE);
        await this.waitForPhase();

        // Phase 2: HIGHLIGHT CHOSEN EDGE
        this.simulationState.highlightEdge(fromNode.id, toNode.id);
        this.simulationState.setPhase('highlight', this.TIMING.EDGE_HIGHLIGHT);
        this.outputBoundary.presentPhaseChange('edge_highlight', this.TIMING.EDGE_HIGHLIGHT);
        await this.waitForPhase();

        // Phase 3: ADVANCE TO NEXT NODE (before camera move so we center on toNode)
        this.simulationState.advance();
        this.simulationState.clearHighlight();

        // Phase 4: CAMERA TRANSITION TO NEXT NODE (now currentNode is the toNode)
        this.simulationState.setPhase('transition', this.TIMING.CAMERA_TRANSITION);
        this.outputBoundary.presentPhaseChange('camera_move', this.TIMING.CAMERA_TRANSITION);
        await this.waitForPhase();

        // Phase 5: COMPLETE
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentRoundComplete(this.simulationState.currentNode);

        console.log('Step complete, now at:', this.simulationState.currentNode.name);

        // Check if we reached the end
        if (!this.simulationState.canAdvance()) {
            this.outputBoundary.presentTraceEnd();
        }
    }

    /**
     * Update probabilities based on current node
     */
    updateProbabilitiesForCurrentNode() {
        const currentNode = this.simulationState.currentNode;
        const nodeInGraph = this.getNodeFromGraph(currentNode.id);

        if (!nodeInGraph) return;

        if (currentNode.type === 'state') {
            // Update decision probabilities p(a|s)
            this.simulationState.setDecisionProbs(nodeInGraph, this.traceGenerator.graph);
        } else if (currentNode.type === 'action') {
            // Update outcome probabilities p(s'|a,s)
            this.simulationState.setOutcomeProbs(nodeInGraph, this.traceGenerator.graph);
        }
    }

    /**
     * Get node from graph by ID
     */
    getNodeFromGraph(nodeId) {
        if (this.traceGenerator && this.traceGenerator.graph) {
            return this.traceGenerator.graph.getNodeById(nodeId);
        }
        return null;
    }

    /**
     * Wait for current phase to complete
     */
    waitForPhase() {
        return new Promise(resolve => {
            const checkComplete = () => {
                if (this.simulationState.isPhaseComplete()) {
                    resolve();
                } else {
                    setTimeout(checkComplete, 50);  // Check every 50ms
                }
            };
            checkComplete();
        });
    }
}
