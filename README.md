# rlviz

Interactive Markov Decision Process (MDP) Graph Editor and Simulator built with p5.js.

## Overview

rlviz is a visual editor for creating and simulating Markov Decision Processes. It provides an intuitive canvas-based interface for building state-action graphs with probability transitions and rewards.

## Features

### Editor Mode
Create and modify MDP graphs with full editing capabilities:

- **Node Creation**: Add State and Action nodes to the canvas
- **Edge Creation**: Connect nodes with probability and reward values
- **Node Renaming**: Double-click any node to rename it
- **Drag & Drop**: Move nodes around the canvas freely
- **Edge Selection & Deletion**: Click edges to select and delete them
- **Text Labels**: Add annotations and labels to your graph
- **Import/Export**: Save and load graphs as JSON files
- **Undo/Redo**: Full command history with Ctrl+Z / Ctrl+Shift+Z

### Simulate Mode
Interactive simulation interface (in development):

- **Start Node Selection**: Single-click to select a start node (highlighted in bright green)
- **Camera Centering**: Double-click any node to center the view on it
- **Visual Feedback**: Clear distinction between selected start node and regular nodes

### Navigation & View Controls
- **Zoom**: Mouse wheel, pinch gestures, or zoom buttons (10% - 500%)
- **Pan**: Drag empty canvas areas to pan the view
- **Reset View**: Press 'R' to reset zoom and pan to defaults
- **Zoom Indicator**: Real-time display of current zoom level

### MDP Features
- **Adjacency List Model**: Proper State→Action and Action→State relationships
- **Probability Renormalization**: Automatic normalization when probabilities exceed 1.0
- **Connection Rules**: Enforces valid MDP connections (State↔Action only)
- **Graph Serialization**: Export complete graph structure with adjacency lists

## Usage

### Getting Started

1. Open `index.html` in a web browser
2. The application starts in **Editor Mode**

### Editor Mode

**Creating Nodes:**
1. Click "Add State" or "Add Action" button
2. Click on the canvas to place the node
3. Node follows cursor until placed

**Creating Edges:**
1. Click a State node to select it (turns yellow)
2. Click an Action node to create an edge
3. Enter probability [0-1] and reward values
4. Edge appears with thickness based on probability

**Renaming Nodes:**
- Double-click any node
- Enter new name in prompt dialog

**Deleting Items:**
- Select a node/edge/text and press Delete or Backspace
- Node deletion automatically removes connected edges

**Adding Text Labels:**
1. Click "Add Text" button
2. Enter text in prompt
3. Click canvas to place label

**Keyboard Shortcuts:**
- `S`: Serialize graph to console (JSON output)
- `R`: Reset zoom/pan to defaults
- `Ctrl+Z`: Undo last operation
- `Ctrl+Shift+Z`: Redo undone operation
- `Delete`/`Backspace`: Delete selected item (Editor Mode only)

### Simulate Mode

**Selecting Start Node:**
1. Switch to "Simulate Mode" using dropdown
2. Single-click any node to select as start node
3. Start node highlighted in bright green
4. Only one start node active at a time

**Camera Controls:**
- Double-click any node to center view on it
- Zoom and pan work the same as Editor Mode

## Installation

No installation required! Simply open `index.html` in a modern web browser.

**Recommended Browsers:**
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Architecture

rlviz follows **Clean Architecture** principles:

```
src/
├── main/
│   ├── domain/          # Core business logic
│   │   ├── stateNodes.js
│   │   ├── actionNodes.js
│   │   ├── edgeObj.js
│   │   ├── graphObj.js
│   │   └── command.js   # Command pattern for undo/redo
│   ├── usecase/         # Application use cases
│   ├── adapter/         # View models
│   │   └── canvasViewModel.js
│   ├── view/            # UI components
│   │   ├── mainView.js
│   │   ├── sideBar.js
│   │   └── buttons/
│   └── app/             # Application bootstrap
│       └── main.js
```

### Key Design Patterns

- **Clean Architecture**: Separation of concerns across layers
- **Command Pattern**: Undo/redo functionality
- **Observer Pattern**: View model updates trigger redraws
- **Adjacency List Model**: Efficient MDP graph representation

## MDP Data Model

### StateNode
```javascript
{
    id: number,
    type: 'state',
    name: string,
    x: number,
    y: number,
    actions: number[]  // List of connected action IDs
}
```

### ActionNode
```javascript
{
    id: number,
    type: 'action',
    name: string,
    x: number,
    y: number,
    sas: [{           // State-Action-State transitions
        sasName: string,
        probability: number,  // [0, 1]
        nextState: number,    // Target state ID
        reward: number
    }]
}
```

### Probability Renormalization

When creating edges from an Action node, if the sum of all transition probabilities exceeds 1.0, the system automatically renormalizes them while preserving relative ratios:

```
Example:
- Action A → State 1: p=0.6
- Action A → State 2: p=0.7
- Total = 1.3 > 1.0

Renormalized:
- Action A → State 1: p=0.462 (0.6/1.3)
- Action A → State 2: p=0.538 (0.7/1.3)
- New total = 1.0
```

Probabilities summing to less than 1.0 remain unchanged (representing implicit termination or incomplete transitions).

## Recent Updates

### January 7, 2026
- ✅ **Simulate Mode Start Node Selection**: Single-click to select start node, double-click to center camera
- ✅ **Probability Renormalization Fix**: Now only renormalizes when sum > 1 (not when sum ≠ 1)
- ✅ **Adjacency List Fixes**: Bidirectional updates on edge creation/deletion
- ✅ **Node Deletion Cleanup**: Proper removal of references from adjacency lists
- ✅ **EdgeObj Source of Truth**: getProbability() now reads from ActionNode.sas[] for accurate values

### January 6, 2026
- ✅ **Pan Functionality**: Drag empty canvas to pan (no space bar required)
- ✅ **Undo/Redo System**: Complete command pattern with 50-operation history
- ✅ **UI Reorganization**: Moved navigation controls to top of sidebar

### January 5, 2026
- ✅ **Zoom Feature**: Mouse wheel, pinch gestures, zoom buttons (10%-500%)
- ✅ **Editor/Simulate Mode**: Toggle between editing and simulation
- ✅ **Text Labels**: Add draggable annotations to canvas
- ✅ **Node Renaming**: Double-click to rename nodes
- ✅ **Delete Functionality**: Delete nodes, edges, and text labels

## Known Limitations

1. **Simulation Execution**: Not yet implemented (only start node selection available)
2. **Edge Editing**: Cannot edit existing edge probability/reward (must delete and recreate)
3. **Multi-Select**: Cannot select multiple items at once
4. **Grid Snap**: No automatic alignment to grid

## Future Enhancements

- Complete simulation execution logic
- Policy visualization
- Value function display
- Step-by-step simulation playback
- Auto-layout algorithms
- Graph validation and analysis tools
- Export to common MDP formats

## Contributing

This is an educational project for learning reinforcement learning and MDP visualization.

## License

MIT License

## Documentation

For detailed implementation notes and feature history, see:
- `feature_summary_editor_simulate.md` - Comprehensive feature documentation

## Technical Details

**Framework**: p5.js (Processing for JavaScript)
**Architecture**: Clean Architecture with Command Pattern
**Language**: JavaScript (ES6+)
**No Build Step**: Pure vanilla JavaScript, no compilation required

---

**Author**: Oscar Yasunaga
**Last Updated**: January 7, 2026
