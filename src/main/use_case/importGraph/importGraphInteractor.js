
/**
 * Interactor for ImportGraph use case
 * Contains the business logic for importing a graph from JSON
 */
class ImportGraphInteractor extends ImportGraphInputBoundary {
    /**
     * @param {Graph} graph - The graph domain object to populate
     * @param {ImportGraphOutputBoundary} outputBoundary - The output boundary for presenting results
     */
    constructor(graph, outputBoundary) {
        super();
        if (!graph) {
            throw new Error("Graph is required");
        }
        if (!outputBoundary) {
            throw new Error("OutputBoundary is required");
        }
        this.graph = graph;
        this.outputBoundary = outputBoundary;
    }

    /**
     * Execute the import graph operation
     * @param {ImportGraphInputData} inputData - The input data containing JSON
     * @returns {void}
     */
    execute(inputData) {
        // Validate input data
        if (!inputData || !inputData.jsonData) {
            const responseModel = {
                success: false,
                error: "JSON data is required",
                graph: null
            };
            this.outputBoundary.present(responseModel);
            return;
        }

        try {
            // Parse JSON
            const data = JSON.parse(inputData.jsonData);

            // Validate required structure
            if (!data.nodes || !Array.isArray(data.nodes)) {
                throw new Error("Invalid graph format: nodes array is required");
            }

            // Clear existing graph
            this.graph.nodes = [];
            this.graph.edges = [];
            this.graph.textLabels = [];

            // Import nodes
            const nodeMap = new Map(); // Track nodes by ID for edge creation
            for (const nodeData of data.nodes) {
                if (nodeData.id === undefined || nodeData.id === null || !nodeData.type || !nodeData.name) {
                    throw new Error("Invalid node format: id, type, and name are required");
                }

                const x = nodeData.x !== undefined ? nodeData.x : Math.random() * 600 + 100;
                const y = nodeData.y !== undefined ? nodeData.y : Math.random() * 400 + 100;
                const size = nodeData.size !== undefined ? nodeData.size : 30;

                let node;
                if (nodeData.type === 'state') {
                    node = new StateNode(nodeData.name, x, y, size);
                    node.id = nodeData.id;
                    node.actions = nodeData.actions || [];
                } else {
                    node = new ActionNode(nodeData.name, x, y, size);
                    node.id = nodeData.id;
                    if (nodeData.transitions) {
                        nodeData.transitions.forEach(t => {
                            node.addSAS(
                                nodeData.id + '->' + t.stateId,
                                t.probability,
                                t.stateId,
                                t.reward || 0
                            );
                        });
                    }
                }

                this.graph.addNode(node);
                nodeMap.set(nodeData.id, node);
            }

            // Import edges if present
            if (data.edges && Array.isArray(data.edges)) {
                for (const edgeData of data.edges) {
                    if (edgeData.from === undefined || edgeData.from === null ||
                        edgeData.to === undefined || edgeData.to === null) {
                        throw new Error("Invalid edge format: from and to are required");
                    }

                    const fromNode = nodeMap.get(edgeData.from);
                    const toNode = nodeMap.get(edgeData.to);

                    if (!fromNode || !toNode) {
                        const msg = "Invalid edge: references non-existent nodes " + edgeData.from + " -> " + edgeData.to;
                        throw new Error(msg);
                    }

                    const probability = edgeData.probability !== undefined ? edgeData.probability : 1.0;
                    const reward = edgeData.reward !== undefined ? edgeData.reward : 0;

                    const edge = new EdgeObj(fromNode, toNode, probability, reward);
                    if (edgeData.labelOffset) {
                        edge.setLabelOffset(edgeData.labelOffset.x, edgeData.labelOffset.y);
                    }
                    this.graph.addEdge(edge);
                }
            }

            // Import text labels if present
            if (data.textLabels && Array.isArray(data.textLabels)) {
                for (const labelData of data.textLabels) {
                    if (!labelData.text || labelData.x === undefined || labelData.y === undefined) {
                        continue; // Skip invalid labels
                    }

                    const randomId = 'label_' + new Date().getTime() + '_' + Math.random();
                    const textLabel = {
                        id: labelData.id || randomId,
                        text: labelData.text,
                        x: labelData.x,
                        y: labelData.y,
                        fontSize: labelData.fontSize || 16
                    };

                    this.graph.textLabels.push(textLabel);
                }
            }

            // Prepare success response
            const responseModel = {
                success: true,
                error: null,
                graph: this.graph,
                nodeCount: this.graph.nodes.length,
                edgeCount: this.graph.edges.length,
                textLabelCount: this.graph.textLabels ? this.graph.textLabels.length : 0
            };

            // Present the results
            this.outputBoundary.present(responseModel);

        } catch (error) {
            // Handle parsing or validation errors
            const responseModel = {
                success: false,
                error: "Failed to import graph: " + error.message,
                graph: null
            };
            this.outputBoundary.present(responseModel);
        }
    }
}
