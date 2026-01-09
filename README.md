# rlviz - MDP Visual Editor & Simulator

Interactive tool for creating and simulating Markov Decision Processes in your browser.

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

1. Click **"Add State"** button
2. Click on the canvas to place a state node (labeled S0)
3. Click **"Add Action"** button
4. Click on the canvas to place an action node (labeled A0)
5. Click the **state node**, then click the **action node** to create a connection
6. Enter a probability (e.g., `0.8`) and reward (e.g., `10`) when prompted

### 2. Run a Simulation

1. Switch to **"Simulate Mode"** from the dropdown
2. **Double-click** the state node to set it as the start point (turns bright green)
3. Click **"Play"** button to generate and visualize a trace through your MDP
4. Watch as the simulation highlights the path taken

### 3. Save Your Work

1. Press **`S`** key to serialize your graph to the browser console
2. Copy the JSON output
3. Save it to a `.json` file
4. Later, click **"Import Graph"** to reload it

## Quick Reference

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Export graph to console |
| `R` | Reset zoom/pan |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Delete` | Delete selected item |

### Mouse Controls

- **Single-click node**: Select
- **Double-click node**: Rename (editor) / Set start (simulate)
- **Drag node**: Move it
- **Drag canvas**: Pan view
- **Mouse wheel**: Zoom in/out

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

## What You Can Do

### Editor Mode
- Create State and Action nodes
- Connect them with probability transitions
- Add text labels and annotations
- Move, rename, and delete elements
- Undo/redo your changes
- Import/export graphs as JSON

### Simulate Mode
- Set a starting state
- Generate random execution traces
- Watch step-by-step animated playback
- Observe probability-weighted transitions
- Reset and try different random traces

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

## Technology

- **Framework**: p5.js (Processing for JavaScript)
- **Architecture**: Clean Architecture
- **Language**: Vanilla JavaScript ES6+
- **No build required**: Runs directly in browser
