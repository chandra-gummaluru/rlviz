// Presenter for edge creation
class CreateEdgePresenter extends CreateEdgeOutputBoundary {
    constructor(viewModel) {
        super();
        this.viewModel = viewModel;
    }

    presentEdgeCreated(edge) {
        // Edge is already added to graph, no additional view model updates needed
        // The edge will be rendered in the next draw cycle
        const from = edge.getFromNode();
        const to = edge.getToNode();
        console.log(`Edge created: ${from.name} -> ${to.name} (p=${edge.getProbability()}, r=${edge.getReward()})`);
    }

    presentError(message) {
        console.error(`Create edge error: ${message}`);
        alert(`Error creating edge: ${message}`);
    }
}
