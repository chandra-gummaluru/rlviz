# rlviz - MDP Visual Editor & Simulator

Interactive tool for creating and simulating Markov Decision Processes in your browser.

## ✨ Highlights

- **🎨 Professional UI** - Three-section layout with top menu bar, contextual toolbar, and right information panel
- **🔄 Interactive Editing** - Create, resize, move, and connect nodes with visual feedback
- **📊 MDP Information** - Real-time display of state/action space, transition matrices, and editable discount factor
- **🎯 Smart Edge Rendering** - Automatic curved arcs for bidirectional connections with reward-based colors (green/red/gray)
- **💾 Export/Import** - Save MDPs as JSON with both adjacency list and matrix formats (P[s][a][s'], R[s][a][s'])
- **↩️ Full Undo/Redo** - Command pattern implementation with 50-item history stack
- **🎬 Simulation Mode** - Generate and visualize probability-weighted random traces through your MDP
- **🏗️ Clean Architecture** - Well-structured codebase following SOLID principles with MVCP pattern

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, or Edge)
- No installation or build tools required!

### How to Start

#### Option 1: Direct File Opening (Simplest)

1. Navigate to the project folder on your computer
2. Double-click `index.html`
3. The application will open in your default browser

#### Option 2: Using a Local Server (Recommended)

If you have Python installed:

```bash
# Navigate to the project folder
cd "path/to/rlviz"

# Start a local server (Python 3)
python -m http.server 8000

# Or if you have Python 2
python -m SimpleHTTPServer 8000
```

Then open your browser and go to: `http://localhost:8000`

#### Option 3: Using VS Code Live Server

1. Open the project folder in VS Code
2. Install the "Live Server" extension
3. Right-click `index.html` and select "Open with Live Server"

## First Steps

Once the application loads:

### 1. Create Your First MDP

1. Click **"Add State"** button in the toolbar
2. The node appears at the center of your canvas (labeled S0) - click to place it
3. Click **"Add Action"** button in the toolbar
4. The action node appears at center (labeled A0) - click to place it
5. Click the **state node**, then click the **action node** to create a connection
6. Enter a probability (e.g., `0.8`) and reward (e.g., `10`) when prompted

### 2. Run a Simulation

1. Switch to **"Simulate Mode"** using the toggle button on the right side of the toolbar
2. **Double-click** the state node to set it as the start point (turns bright green)
3. Click **"Play"** button to generate and visualize a trace through your MDP
4. Watch as the simulation highlights the path taken

### 3. Save & Export Your Work

1. Click **File → Export** from the top menu bar to download your MDP as JSON
2. File automatically saves as `mdp-graph-[timestamp].json`
3. **Contains two formats**:
   - Adjacency list (for re-importing and editing)
   - Transition matrices P[s][a][s'] and R[s][a][s'] (for RL algorithms)
4. Later, click **File → Import** from the menu to reload it
5. Alternatively: Press **`S`** key to view JSON in browser console

## Quick Reference

### UI Layout

The application uses a three-section layout:

**Row 1 - Top Menu Bar** (40px height)
- Black background (#000000) with white text (#FFFFFF)
- **File**: Import, Export
- **Edit**: Undo (Ctrl+Z), Redo (Ctrl+Shift+Z)
- **View**: Zoom In, Zoom Out, Reset Zoom

**Row 2 - Contextual Toolbar** (50px height)
- Light gray background (#F5F5F5)
- **Edit Mode**: Add State, Add Action, Add Text, Renormalize
- **Simulate Mode**: Play, Step, Rerun
- **Right side**: Edit/Simulate mode toggle

**Main Workspace** (canvas + right panel)
- **Canvas** (left side): Graph visualization and editing
- **Right Panel** (300px width):
  - MDP information (state/action space, transition matrix, discount factor)
  - Node editor (name, image upload, connections, probabilities, rewards)

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Export graph to console |
| `R` | Reset zoom/pan |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected item |

### Mouse Controls

- **Single-click node center**: Select
- **Double-click node**: Rename (editor) / Set start (simulate)
- **Drag node center**: Move it
- **Click + drag node edge**: Resize node (10-100 pixel radius)
- **Drag canvas**: Pan view
- **Mouse wheel**: Zoom in/out
- **Click curved edge**: Select bidirectional edge

## Recent Features

### 🎯 Spinning Arrow Animation ✅ IMPLEMENTED (2026-03-10)
Added a toggleable probability-weighted "roulette wheel" animation at action nodes during simulation:

**Animation Features:**
- **Spinning Arrow**: Orange/red arrow rotates at action node center
- **Probability-Weighted Wheel**: Circle divided by transition probabilities (like a roulette wheel)
- **Dashed Edges**: All outgoing edges become dashed during spinning
- **Edge Highlighting**: Edges highlight as arrow passes over them
- **Probability Labels**: Shows "p=0.50" on each edge during animation
- **Smooth Deceleration**: Ease-out cubic easing for dramatic effect (3 full rotations)
- **Path History**: Previously visited nodes and traversed edges remain visible
- **Clean Visualization**: Only chosen paths persist; unchosen options disappear

**User Controls** (in Right Panel → Animation Settings):
- **Toggle Checkbox**: Enable/disable the animation (default: OFF)
- **Duration Slider**: 800ms to 3000ms (default: 1500ms)
- Real-time configuration during simulation

**How to Use:**
1. Switch to Simulate mode
2. In Right Panel, check "Enable Spinning Arrow Selection"
3. Adjust duration slider (optional)
4. Play or Step through simulation
5. Watch the roulette-style animation at action nodes!

**What You'll See:**
- During spinning: All possible paths shown as dashed edges with probabilities
- After selection: Chosen edge becomes solid and stays visible forever
- Path history: All previously traversed edges remain visible (breadcrumb trail)
- Clean view: Unvisited nodes and untaken paths disappear
- Example: In a loop S0→A0→S1→A1→S0, you'll see the complete cycle path build up as the simulation progresses

**Visualization Intelligence:**
- **Persistent History**: Visited nodes and traversed edges stay visible throughout simulation
- **Breadcrumb Trail**: Complete path taken through the MDP remains visible
- **Smart Hiding**: Unvisited nodes and untaken paths disappear after decision
- **Loop Support**: Perfect for cyclic MDPs - shows which paths were actually taken
- **Stochastic Clarity**: See the exact trajectory of random choices

**Technical Details:**
- Uses probability-weighted segments (edge with p=0.5 gets 180° of wheel)
- Maintains ~60 FPS animation
- Works with both straight and curved edges
- Compatible with Play and Step modes
- Intelligent visibility management preserves simulation history
- See `SPINNING_ARROW_FEATURE.md` for full documentation

### 📈 Simulation Statistics Panel ✅ IMPLEMENTED (2026-03-02)
Added real-time simulation monitoring in the right panel when in simulate mode:

**Displays:**
- **Initial State**: Starting state name
- **Current State**: Current state name (or "Not at a state" when at action node)
- **Total Reward**: Accumulated reward with color coding (dark green/dark red/black)
- **Steps**: Number of state→action→state transitions completed
- **Decision p(a|s)**: When at a state, shows available actions with uniform probability
- **Outcome p(s'|a,s)**: When at an action, shows possible next states with:
  - Transition probabilities
  - Expected rewards
  - Color-coded reward values

**Features:**
- Updates automatically as simulation progresses
- Auto-switches when toggling Edit/Simulate mode
- Color-coded for easy interpretation
- Professional dark color scheme (dark green/dark red/black)

### 🎨 Dark Color Scheme & Draggable Labels ✅ IMPLEMENTED (2026-03-02)
Enhanced edge visualization with professional color palette and repositionable labels:

**Edge Colors:**
- **Black (#000000)**: Zero reward edges
- **Dark Green (RGB: 0, 100, 0)**: Positive reward edges
- **Dark Red (RGB: 139, 0, 0)**: Negative reward edges
- Intensity interpolates from black based on reward magnitude

**Draggable Labels:**
- Click and drag probability/reward labels to reposition them
- Labels persist custom positions (stored in edge data)
- Works with both straight and curved edges
- Hit detection prioritizes labels for easy grabbing

### 📊 Right Information Panel ✅ IMPLEMENTED
Added a comprehensive right panel (300px width) with dual functionality:

**MDP Information Mode** (no node selected):
- **Title**: "Markov Decision Process" with formal tuple notation ⟨S, s₀, A, P, r, γ⟩
- **State Space**: Mathematical notation S = {s₀, s₁, s₂, ...} using LaTeX subscripts
  - Shows first 5 states, then ellipsis (...) if more than 5
- **Action Space**: Mathematical notation A = {a₀, a₁, a₂, ...} using LaTeX subscripts
  - Shows first 5 actions, then ellipsis (...) if more than 5
- **Probability**: Displays P[s][a][s'] = probability with dimensions
- **Reward**: Displays R[s][a][s'] = reward with dimensions
- **Discount Factor**: Editable γ value (0.0 - 1.0) for reinforcement learning algorithms

**Node Editor Mode** (when node selected):
- **Name Editing**: Inline text input with save button
- **Image Upload**: Upload images to nodes (preview, upload, remove)
- **State Nodes**: Shows all available actions from that state
- **Action Nodes**: Shows all transitions with **interactive sliders**:
  - Target state names
  - **Probability slider**: 0.0 - 1.0 range, 0.01 steps, real-time updates
  - **Reward slider**: -100 to 100 range, integer steps, real-time updates
  - Color-coded reward values (dark green/dark red/black)
  - Total probability sum (color-coded: green if 1.0, orange otherwise)

**Features**:
- Auto-updates when selection changes
- Mathematical notation rendered with MathJax
- Clean, professional design with sections and borders
- Scrollable for long content
- Integrates with double-click rename functionality
- Images stored as base64 data URLs
- Scalable display for large MDPs (ellipsis after 5 items)

### ✨ Improved Bidirectional Edge Rendering ✅ IMPLEMENTED
Fixed arrowhead positioning for curved bidirectional edges:

**The Problem:**
- Arrowheads on curved edges were slightly misaligned
- Curves extended all the way to node center, overlapping arrowheads
- Visual inconsistency with straight edge rendering

**The Solution:**
- **Binary search algorithm** finds exact intersection of curve with node circumference
- **Curves stop at arrowhead base** instead of continuing to node center
- **Tangent calculated at intersection point** for perfect arrowhead orientation
- Maintains center-to-center curve geometry for proper shape

**Technical Implementation:**
1. Calculate Bezier curve from center to center (proper curve shape)
2. Binary search finds where curve intersects node circumference (10 iterations)
3. Calculate tangent vector at intersection point
4. Stop curve `arrowSize` pixels before arrowhead tip
5. Draw arrowhead at exact intersection with correct orientation

**Result:** Clean, professional-looking curved edges with pixel-perfect arrowhead alignment.

### 🎨 Complete UI Redesign ✅ IMPLEMENTED
Implemented a clean, modern three-section interface:

**Row 1 - Top Menu Bar (40px)**
- Black background (#000000) with white text (#FFFFFF)
- Professional dropdown menus: File, Edit, View
- Keyboard shortcuts displayed in menu items
- Smooth hover effects and transitions

**Row 2 - Contextual Toolbar (50px)**
- Light gray background (#F5F5F5)
- Mode-dependent button layout
- **Edit Mode**: Add State (green), Add Action (blue), Add Text (gray), Renormalize (orange)
- **Simulate Mode**: Play (green), Step (blue), Rerun (orange)
- Right-side mode toggle (Edit/Simulate)

**Main Workspace (canvas + right panel)**
- Canvas positioned dynamically (window width - 300px for right panel)
- Right panel (300px width) displays MDP information and node editor
- Full integration between all UI components

**Additional Improvements**
- All fonts standardized to Calibri for consistency
- New nodes appear at center of canvas (accounting for viewport zoom/pan)
- Buttons color-coded by function for better UX (green=primary action, blue=secondary, orange=warning)
- Smooth transitions and hover effects throughout
- Professional color scheme: black menu bar, light gray toolbar, white panel

This completes the UI redesign outlined in `ui.md`.

### 🔧 Pixel-Perfect Edge Selection Fix ✅ IMPLEMENTED
Implemented precise click detection based on the actual visible line pixels:

**The Problem:**
- Edges were selectable even when clicking inside node circles
- Selection logic didn't match what users saw on screen
- Invisible parts of edges (covered by nodes) could be selected

**The Solution - Visible Pixels Only:**
- **Straight edges**: Calculated from edge of from-node to edge of to-node (not center-to-center)
- **Curved edges**: Only sample points on the curve that are outside both node circles
- **10px threshold**: Click must be within 10 pixels of the visible line
- **Node circles**: Clicking inside any node circle selects the node, never an edge

**How it works:**
```
Node A ●━━━━━━━━━━━━━━━● Node B
       ↑               ↑
     visible line only
  (excludes node circles)
```

**Benefits:**
- Selection matches visual appearance exactly
- Click on visible line pixels → selects edge
- Click on node circle → selects node
- No ambiguity or unexpected behavior
- Works with any node size (10-100px)
- Handles overlapping nodes gracefully (no selection if nodes overlap)

**Technical details**:
- `isPointNearVisibleLine()`: Calculates start/end points at node circumferences
- `isPointNearVisibleCurve()`: Samples Bezier curve and filters points inside nodes
- Both methods ensure selection only works on the actual rendered pixels

### Core Editing Features ✅ IMPLEMENTED

### 🎨 Node Resizing
Click and drag the **edge** of any node to resize it between 10-100 pixel radius. Perfect for:
- Emphasizing important states
- Creating visual hierarchy
- Improving graph readability

**How to use**: Click within 8 pixels of the node circumference and drag outward/inward.

### 🔄 Curved Bidirectional Edges
When two nodes have edges in **both directions**, they automatically render as curved arcs instead of overlapping lines. Features:
- Clear visual separation of forward/backward transitions
- Automatic detection (no configuration needed)
- Quadratic Bezier curves with 15% offset
- Pixel-perfect arrowhead positioning using binary search algorithm
- Curves stop cleanly at arrowhead base (not node center)
- Arrowheads positioned at exact intersection with node circumference
- Labels positioned at curve midpoint

**Visual improvement**: Bidirectional State ↔ Action connections now show distinct curved paths with professional arrowhead alignment.

### 💾 Export Graph with Transition Matrices
One-click export of your MDP to JSON format with **dual representation**:
- Downloads as `mdp-graph-[timestamp].json`
- **Adjacency list format** - for visualization and editing
- **Transition matrix format** - ready for RL algorithms (NumPy, TensorFlow, PyTorch)
- Can be re-imported for further editing

**Export format includes**:
```json
{
  "nodes": [
    {
      "id": 0,
      "type": "state",
      "name": "S0",
      "actions": [0, 1],
      "size": 30
    },
    {
      "id": 0,
      "type": "action",
      "name": "A0",
      "transitions": [
        { "stateId": 1, "probability": 0.7, "reward": 10 }
      ]
    }
  ],
  "transitionMatrix": {
    "states": [0, 1, 2],
    "stateNames": ["S0", "S1", "S2"],
    "actions": [0, 1],
    "actionNames": ["A0", "A1"],
    "P": [[[0.7, 0.3], [...]], ...],
    "R": [[[10, 5], [...]], ...],
    "description": "P[s][a][s'] = probability of transitioning from state s to state s' via action a"
  }
}
```

**Transition matrix notation**:
- **P[s][a][s']** = Probability of transitioning from state s to state s' via action a
- **R[s][a][s']** = Reward for that transition
- Standard MDP format from Sutton & Barto textbooks

**Ready for algorithms**: Value iteration, policy iteration, Q-learning, and more. See `TRANSITION_MATRIX.md` for Python/JavaScript examples.

### 🎯 Enhanced Edge Selection
Edges are now selectable based on actual visible pixels:
- **Visible line only**: Selection works on the rendered line between node edges, not the full geometric line
- **Straight edges**: Line segment from `from.edge` to `to.edge` with 10px threshold
- **Curved edges**: 20-point Bezier sampling, excluding points inside node circles
- **Node exclusion**: Edge portions covered by nodes are not selectable
- **Dynamic switching**: Bidirectional edges automatically switch from curved to straight after deleting one
- Works seamlessly with delete, highlighting, and reward-colored edges (green/red/gray)

### 🌈 Reward-Based Edge Colors
Edges now display gradient colors based on their reward values:
- **Zero reward (r=0)**: Gray edges
- **Positive rewards**: Green gradient (larger rewards = brighter green)
- **Negative rewards**: Red gradient (larger negative rewards = brighter red)

**How it works**:
- Colors scale dynamically based on all rewards in your graph
- The largest positive reward gets the brightest green
- The largest negative reward gets the brightest red
- Smooth interpolation between gray and colors helps visualize reward magnitude
- Only applies to Action → State edges (State → Action edges remain gray)

## Architecture & Quality

### 🏗️ Clean Architecture Implementation ✅ COMPLETE
The codebase follows Clean Architecture principles with MVCP (Model-View-Controller-Presenter) pattern:
- **Domain Layer**: Pure business logic (Graph, Nodes, Commands)
- **Use Case Layer**: Application workflows (CreateNode, MoveNode, DeleteNode, etc.)
- **Adapter Layer**: ViewModels and Controller (state coordination)
- **View Layer**: UI components (MenuBar, ToolBar, RightPanel, MainView)

**Benefits:**
- Each layer has single responsibility
- Testable in isolation
- Clear dependency flow (outer → inner)
- Easy to maintain and extend

### 🐛 Bug Fixes & Refinements
Fixed several issues during development:
- First node (ID 0) now selectable and draggable (falsy value bug)
- Node selection properly persists after clicking
- Edge creation workflow improved (order of interaction checks)
- Selection cleared after creating edges
- Resize mode no longer gets stuck (state cleanup)
- Panning works correctly on empty canvas

See `DEBUGGING.md` and `REFACTOR_COMPLETE.md` for technical details.

## Troubleshooting

### Application won't load?

**Problem**: Blank screen or security errors
**Solution**: Use a local server (Option 2, 3, or 4 above) instead of opening the file directly. Browsers block some features when files are opened directly due to CORS security policies.

### Buttons not working?

**Problem**: Clicks don't register
**Solution**: Make sure the browser console shows no errors (F12 → Console tab). Try refreshing the page.

### Can't see my graph?

**Problem**: Nodes disappeared
**Solution**: Press `R` to reset the zoom/pan view, or use mouse wheel to zoom out.

## Feature Status

| Feature Category | Features | Status |
|-----------------|----------|---------|
| **UI Components** | Top menu bar (File, Edit, View) | ✅ Complete |
| | Contextual toolbar (mode-dependent) | ✅ Complete |
| | Right information panel | ✅ Complete |
| | Node editor in right panel | ✅ Complete |
| | MDP info display | ✅ Complete |
| **Node Operations** | Create state/action nodes | ✅ Complete |
| | Select, move, resize nodes | ✅ Complete |
| | Rename nodes (double-click) | ✅ Complete |
| | Delete nodes (with undo) | ✅ Complete |
| | Node images (upload/remove) | ✅ Complete |
| **Edge Operations** | Create edges with probability/reward | ✅ Complete |
| | Bidirectional curved edges | ✅ Complete |
| | Reward-based edge colors | ✅ Complete |
| | Pixel-perfect edge selection | ✅ Complete |
| | Delete edges (with undo) | ✅ Complete |
| **Graph Operations** | Zoom in/out/reset | ✅ Complete |
| | Pan canvas | ✅ Complete |
| | Add text labels | ✅ Complete |
| | Renormalize probabilities | ✅ Complete |
| | Undo/Redo (50-item history) | ✅ Complete |
| **Import/Export** | Export to JSON (dual format) | ✅ Complete |
| | Import from JSON | ✅ Complete |
| | Transition matrices (P, R) | ✅ Complete |
| **Simulation** | Set start node | ✅ Complete |
| | Generate random traces | ✅ Complete |
| | Animated playback | ✅ Complete |
| | Play/Step/Rerun controls | ✅ Complete |
| | Spinning arrow animation (toggleable) | ✅ Complete |
| | Simulation statistics panel | ✅ Complete |

## What You Can Do

### Editor Mode
- **Create** State and Action nodes with automatic naming (appear at canvas center)
- **Connect** nodes with probability transitions and rewards
- **Resize** nodes by dragging their edges (10-100 pixel radius)
- **Bidirectional edges** automatically render as curved arcs for clarity
- **Reward visualization** with gradient edge colors (green for positive, red for negative, gray for zero)
- **Renormalize** probabilities with one click (forces all action transitions to sum to exactly 1.0)
- **Move** nodes by dragging from center
- **Rename** nodes with double-click
- **Delete** elements with Delete/Backspace key
- **Add** text labels and annotations
- **Undo/Redo** with full command history (Ctrl+Z / Ctrl+Shift+Z)
- **Export** graphs as JSON via File menu
- **Import** previously saved graphs via File menu
- **Zoom controls** in View menu (In, Out, Reset)

### Simulate Mode
- **Set** a starting state with double-click (bright green highlight)
- **Generate** random execution traces through your MDP
- **Watch** step-by-step animated playback with:
  - Camera following simulation
  - Edge highlighting during transitions
  - Phase-based cinematic animation
  - **NEW:** Optional spinning arrow animation at action nodes (roulette-wheel style)
- **Control** playback with Play/Step/Rerun buttons
- **Configure** spinning arrow animation:
  - Enable/disable toggle in Right Panel
  - Adjustable duration (800ms-3000ms)
  - Probability-weighted segments with edge highlighting
- **Track** complete path history:
  - Previously visited nodes remain visible
  - Traversed edges stay visible (breadcrumb trail)
  - Unvisited nodes/untaken paths disappear after decision
  - Perfect for understanding loops and stochastic exploration
- **Monitor** simulation statistics:
  - Real-time reward tracking
  - Step count and current state
  - Decision probabilities p(a|s) and outcome probabilities p(s'|a,s)
- **Observe** probability-weighted transitions in action
- **Works** seamlessly with curved bidirectional edges

## Project Structure

```
rlviz/
├── index.html          ← Start here!
├── style.css
├── libraries/
│   ├── p5.min.js
│   └── p5.sound.min.js
└── src/main/
    ├── domain/         (Business logic)
    ├── use_case/       (Application workflows)
    ├── adapter/        (View model)
    ├── view/           (UI components)
    └── app/            (Bootstrap)
```

## Technology Stack

- **Framework**: p5.js (Processing for JavaScript) - for canvas rendering and visualization
- **Architecture**: Clean Architecture with MVCP (Model-View-Controller-Presenter) pattern
- **Language**: Vanilla JavaScript ES6+ - no transpilation needed
- **Design Patterns**:
  - Command pattern (undo/redo with 50-item history)
  - State Machine (simulation playback phases)
  - Factory pattern (ViewModel creation)
  - Observer pattern (Presenter → ViewModel updates)
- **No build required**: Runs directly in modern browsers
- **Layer Structure**:
  - Domain: Graph, StateNodes, ActionNodes, Commands
  - Use Cases: 20+ interactors for all operations
  - Adapters: CanvasController + 5 focused ViewModels
  - Views: MenuBar, ToolBar, RightPanel, MainView

## Documentation

For detailed technical documentation, see:

- **`summary.md`** - Complete feature list and architecture overview
- **`RESIZE_FEATURE.md`** - Node resizing implementation details
- **`BIDIRECTIONAL_EDGES.md`** - Curved edge rendering documentation
- **`TRANSITION_MATRIX.md`** - Matrix export format and RL algorithm examples
- **`SPINNING_ARROW_FEATURE.md`** - Spinning arrow animation implementation (NEW)

### Key Features Documented

1. **Node Resizing** - How to implement and customize resizable nodes
2. **Bidirectional Edges** - Mathematical formulas and curve calculations
3. **Transition Matrices** - 3D matrix format (P[s][a][s'], R[s][a][s']) with Python/JavaScript examples
4. **Export System** - Dual representation (adjacency list + matrices) for both visualization and computation
5. **Command Pattern** - 10 reversible command types for undo/redo
6. **Simulation System** - Trace generation and animation phases
7. **Reward-Based Colors** - Dynamic gradient coloring for edge rewards (green/red/gray)
8. **Spinning Arrow Animation** - Probability-weighted roulette wheel with path history tracking:
   - Roulette-style selection at action nodes
   - Intelligent visibility: visited nodes and traversed edges persist
   - Complete breadcrumb trail of simulation trajectory
   - Perfect for understanding stochastic behavior in loops

### Using Exported MDPs in Your Code

**Python Example (Value Iteration)**:
```python
import json
import numpy as np

# Load exported graph
with open('mdp-graph-2026-02-26T16-01-04.json', 'r') as f:
    data = json.load(f)

# Extract matrices
P = np.array(data['transitionMatrix']['P'])  # Transition probabilities
R = np.array(data['transitionMatrix']['R'])  # Rewards
states = data['transitionMatrix']['states']
actions = data['transitionMatrix']['actions']

# Run value iteration
V = np.zeros(len(states))
gamma = 0.9
for _ in range(100):
    for s in range(len(states)):
        V[s] = max([
            sum([P[s][a][s_prime] * (R[s][a][s_prime] + gamma * V[s_prime])
                 for s_prime in range(len(states))])
            for a in range(len(actions))
        ])

print("Optimal values:", V)
```

See **`TRANSITION_MATRIX.md`** for more algorithm examples including policy iteration, Q-learning setup, and matrix validation.

## Contributing

This is an educational project exploring:
- Reinforcement learning and MDP concepts
- Clean Architecture in JavaScript
- Interactive data visualization

Contributions and feedback are welcome!
