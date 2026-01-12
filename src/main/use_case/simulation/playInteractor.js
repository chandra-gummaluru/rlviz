// Interactor for Play simulation action
class PlayInteractor extends PlayInputBoundary {
    constructor(simulationState, traceGenerator, outputBoundary, startNodeProvider) {
        super();
        this.simulationState = simulationState;
        this.traceGenerator = traceGenerator;
        this.outputBoundary = outputBoundary;
        this.startNodeProvider = startNodeProvider;  // Function that returns current start node

        // Timing constants (in milliseconds)
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
            // First Play click: Run initialization
            this.runInitialization(inputData);
        } else {
            // Toggle play/pause
            if (this.simulationState.isPlaying) {
                // Pause the simulation
                this.simulationState.pause();
                console.log('Simulation paused');
            } else {
                // Start continuous play
                this.simulationState.play();
                console.log('Simulation started');
                this.continuousPlay(inputData);
            }
        }
    }

    /**
     * Initialization sequence (first Play click)
     */
    runInitialization(inputData) {
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
        this.animateInitialization(inputData);
    }

    /**
     * Initialization animation sequence
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

        // Phase 5: COMPLETE - Set initialized and start playing automatically
        this.simulationState.start();
        this.simulationState.play(); // Auto-start continuous play
        this.simulationState.setPhase('idle', 0);
        this.outputBoundary.presentInitializationComplete();

        console.log('Initialization complete, starting continuous play');

        // Start continuous play automatically
        this.continuousPlay(inputData);
    }

    /**
     * Continuous play loop
     */
    async continuousPlay(inputData) {
        while (this.simulationState.isPlaying && this.simulationState.canAdvance()) {
            await this.playNextStep(inputData);
        }

        if (!this.simulationState.canAdvance()) {
            this.simulationState.pause();
            this.outputBoundary.presentTraceEnd();
            console.log('Reached end of trace');
        }
    }

    /**
     * Execute one step to next node (State→Action or Action→State)
     */
    async playNextStep(inputData) {
        // Check if we can advance
        if (!this.simulationState.canAdvance()) {
            return;
        }

        const currentNode = this.simulationState.currentNode;
        const nextNode = this.simulationState.peekNext();

        console.log(`Step: ${currentNode.type} (${currentNode.name}) -> ${nextNode.type} (${nextNode.name})`);

        // Determine transition type and animate
        if (currentNode.type === 'state' && nextNode.type === 'action') {
            await this.animateTransition(currentNode, nextNode, inputData);
        } else if (currentNode.type === 'action' && nextNode.type === 'state') {
            await this.animateTransition(currentNode, nextNode, inputData);
        } else {
            this.outputBoundary.presentError(`Invalid transition: ${currentNode.type} -> ${nextNode.type}`);
        }
    }

    /**
     * Animate transition from current node to next node
     * Shows all outgoing edges, highlights chosen edge, moves to next node
     */
    async animateTransition(fromNode, toNode) {
        this.outputBoundary.presentRoundStart(fromNode, toNode);

        // Phase 1: REVEAL ALL OUTGOING EDGES
        if (fromNode.type === 'state') {
            // Reveal all action nodes connected from this state
            const stateNodeInGraph = this.getNodeFromGraph(fromNode.id);
            if (stateNodeInGraph && stateNodeInGraph.actions) {
                stateNodeInGraph.actions.forEach(actionId => {
                    this.simulationState.revealNode(actionId);
                    this.simulationState.revealEdge(fromNode.id, actionId);
                });
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
    }

    /**
     * Get node from graph by ID
     */
    getNodeFromGraph(nodeId) {
        const startNode = this.startNodeProvider();
        // Traverse up to get the graph - this is a workaround
        // In a better architecture, we'd inject the graph directly
        if (startNode && startNode.constructor && startNode.constructor.name) {
            // Access via traceGenerator which has graph reference
            if (this.traceGenerator && this.traceGenerator.graph) {
                return this.traceGenerator.graph.getNodeById(nodeId);
            }
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
