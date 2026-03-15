# RLViz - MDP Graph Editor and Simulator

An interactive web-based tool for creating, editing, and simulating Markov Decision Processes (MDPs). Build state-action-state graphs visually and watch animated simulations with trace generation.

## Features

- **Visual MDP Editor**: Create state and action nodes, connect them with probabilistic transitions
- **Interactive Simulation**: Animate MDP executions with configurable visualization options
- **Import/Export**: Save and load graphs, export transition matrices
- **Undo/Redo**: Full command history with 50-level undo stack
- **Graph Analysis**: Automatic probability normalization and transition matrix generation
- **Clean Architecture**: Well-structured codebase following separation of concerns

## Getting Started

### Running the Application

No build process required - this is a vanilla JavaScript application using p5.js:

```bash
# Option 1: Open directly in browser
open index.html

# Option 2: Use a local server (recommended)
python3 -m http.server 8000
# Then navigate to http://localhost:8000
```

### Basic Usage

1. **Editor Mode** (default):
   - Click "State" or "Action" buttons to create nodes
   - Click and drag nodes to move them
   - Click two different node types to create an edge
   - Double-click a node to rename it
   - Select and press Delete/Backspace to remove elements
   - Use Import/Export for saving work

2. **Simulate Mode**:
   - Double-click a state node to set as start node
   - Click "Play" to run continuous simulation
   - Use "Step" to advance one transition at a time
   - Click "Reset" to restart simulation
   - Enable "Spinning Arrow" for visual probability selection

## Architecture

Built with **Clean Architecture** principles:

- **Domain Layer**: MDP entities (nodes, edges, graph, simulation state)
- **Use Case Layer**: Application logic (create, delete, move, simulate)
- **Adapter Layer**: View models and controller
- **View Layer**: p5.js rendering and UI components

See [CLAUDE.md](CLAUDE.md) for detailed architecture documentation.

## MDP Concepts

### Graph Structure

- **State Nodes**: Represent states in the MDP, contain available actions
- **Action Nodes**: Represent actions, contain probabilistic transitions to next states
- **Transitions**: Each action→state transition has a probability and reward
- **Probabilities**: Automatically normalized to sum to 1.0

### Simulation

The simulator generates random traces through the MDP by:
1. Starting at a selected state node
2. Uniformly selecting an available action
3. Sampling next state based on transition probabilities
4. Repeating until no more actions available

## File Structure

```
rlviz/
├── index.html           # Main HTML with script loading order
├── style.css           # Styling
├── libraries/          # p5.js libraries
├── src/main/
│   ├── domain/        # Core entities (Graph, Node, Edge, SimulationState)
│   ├── use_case/      # Application logic (one folder per use case)
│   ├── adapter/       # ViewModels and Controller
│   ├── view/          # UI components (MainView, MenuBar, ToolBar, RightPanel)
│   └── app/           # Bootstrap and dependency injection
└── test_schema/       # Example MDP graphs
```

## Controls

### Keyboard Shortcuts

- `Cmd/Ctrl + Z`: Undo
- `Cmd/Ctrl + Shift + Z`: Redo
- `Delete/Backspace`: Delete selected element
- `R`: Reset zoom to default
- `S`: Export graph to console (for debugging)

### Mouse Controls

- **Left Click**: Select node/edge
- **Click + Drag**: Move node (Editor mode)
- **Double Click**: Rename node (Editor) or set start node (Simulate)
- **Shift + Drag on node edge**: Resize node
- **Mouse Wheel**: Zoom in/out

## Contributing

The codebase follows strict architectural patterns. See [CLAUDE.md](CLAUDE.md) for:
- How to add new use cases
- File organization conventions
- Common development workflows

## License

[Add your license here]
