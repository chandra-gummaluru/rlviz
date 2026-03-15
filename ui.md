# UI Layout Specification

**Implementation Status:**
- ✅ Row 1 (Top Menu Bar) - Implemented
- ✅ Row 2 (Contextual Toolbar) - Implemented
- ✅ Row 3 (Right Panel) - Implemented with MDP info and node editor

## Overall Layout Structure

The UI is vertically divided into three main sections:

[ Row 1 ]  Top Menu Bar
[ Row 2 ]  Contextual Toolbar (mode dependent)
[ Row 3 ]  Main Workspace Area

When in Simulate mode, a right-side simulation panel appears within Row 3.

---

# Row 1 — Top Menu Bar

**Status:** ✅ Implemented (2026-03-02)
**File:** `src/main/view/menuBar.js`

## Purpose

Global application controls.

## Layout

- Full width (40px height)
- Horizontal bar
- Left-aligned menus
- Black background (#000000)
- White text (#FFFFFF)

## Menus and Items

### File
- Import (imports graph JSON)
- Export (downloads graph JSON with timestamp)

### Edit
- Undo (keyboard shortcut: Ctrl+Z)
- Redo (keyboard shortcut: Ctrl+Shift+Z)

### View
- Zoom In
- Zoom Out
- Reset Zoom

## Behavior

- These are global commands.
- They remain visible in all modes.
- They do not change based on Edit or Simulate mode.
- Dropdown menus close when clicking on canvas
- Hover effects on menu items (#333333 background)
- Canvas positioned 40px below menu bar

## Implementation Notes

- Uses p5.js DOM elements (createDiv, createSpan)
- Callbacks wired to existing use case interactors
- Window resize updates menu bar width
- Keyboard shortcuts displayed in menu items (gray text)  

---

# Row 2 — Contextual Toolbar (Mode Dependent)

**Status:** ✅ Implemented
**File:** `src/main/view/toolBar.js`

This row changes depending on the current mode:

- Edit Mode
- Simulate Mode  

---

## Right Side: Mode Toggle (Always Visible)

On the right side of Row 2, include a toggle:

[ Edit | Simulate ]

### Behavior

- Default mode: Edit  
- Clicking Simulate switches the UI into Simulate mode.  
- Clicking Edit switches back to Edit mode.  
- The toolbar buttons update immediately when mode changes.  

---

## Left Side (Edit Mode)

When mode = Edit, show the following left-aligned buttons:

- Add State  
- Add Action  
- Add Text  
- Renormalize  

### Behavior

- These buttons modify the graph structure.  
- Editing interactions are enabled.  
- Nodes and labels can be added or modified.  

---

## Left Side (Simulate Mode)

When mode = Simulate, replace the Edit buttons with:

- Play  
- Step  
- Rerun  

### Behavior

- Structural editing is disabled.  
- Simulation controls become active.  
- The buttons operate on the simulation state.  

---

# Row 3 — Main Workspace Area

**Status:** ✅ Implemented
**File:** `src/main/view/rightPanel.js`

This row contains the canvas and a right information panel.

---

## Layout (All Modes)

Row 3 splits horizontally:

[ Canvas | Right Panel ]

### Layout

- Canvas: window width - 300px (dynamic)
- Right Panel: 300px fixed width
- The right panel is always visible in both Edit and Simulate modes

---

## Right Panel Contents

**Status:** ✅ Implemented with dual functionality

### When No Node Selected (MDP Information Mode)

Displays comprehensive MDP information:

- **Title**: "Markov Decision Process" with LaTeX tuple notation ⟨S, s₀, A, P, r, γ⟩
- **State Space**: S = {s₀, s₁, s₂, s₃, s₄, ...}
  - Mathematical notation with subscripts
  - Shows first 5 states, then ellipsis if more
  - Rendered with MathJax
- **Action Space**: A = {a₀, a₁, a₂, a₃, a₄, ...}
  - Mathematical notation with subscripts
  - Shows first 5 actions, then ellipsis if more
  - Rendered with MathJax
- **Probability**: P[s][a][s'] = probability
  - Shows matrix dimensions (states × actions × states)
  - LaTeX formatted notation
- **Reward**: R[s][a][s'] = reward
  - Shows matrix dimensions (states × actions × states)
  - LaTeX formatted notation
- **Discount Factor (γ)**: Editable input field
  - Range: 0.0 - 1.0
  - Used for reinforcement learning algorithms

### When Node Selected (Node Editor Mode)

Displays node editing interface:

- **Name**: Editable text input with save button
  - Integrates with double-click rename functionality
- **Image**: Upload/remove functionality
  - Image preview when uploaded
  - Stored as base64 data URLs
- **State Nodes**: List of available actions
- **Action Nodes**: List of transitions
  - Target state names
  - Probability values (3 decimal precision)
  - Reward values (2 decimal precision)
  - Total probability sum (color-coded: green if 1.0, orange otherwise)

## Behavior

- Auto-updates when selection changes
- Scrollable for long content
- Professional styling with sections and borders
- White background (#FFFFFF)
- 1px border separator from canvas
- Mathematical notation properly rendered with MathJax
- Scalable display for large MDPs (ellipsis after 5 items)  

---

# Mode Transition Behavior

## Switching Edit → Simulate

1. Lock structural editing.  
2. Replace Row 2 buttons with simulation controls.  
3. Render the right-side simulation panel.  
4. Initialize simulation state.  

## Switching Simulate → Edit

1. Stop simulation if running.  
2. Remove simulation panel.  
3. Restore Edit buttons.  
4. Re-enable structural editing.  

---

# Visual Hierarchy Summary

┌────────────────────────────────────────────┐  
│ File  Edit  View                          │  ← Row 1  
├────────────────────────────────────────────┤  
│ [Add State][Add Action][Add Text][Renorm] │  
│                                 [Edit|Sim]│  ← Row 2  
├────────────────────────────────────────────┤  
│                                            │  
│              Canvas                        │  ← Row 3  
│                                            │  
│                              [Sim Panel]   │  (Sim mode only)  
└────────────────────────────────────────────┘  

---

# UX Intent

- Edit mode = model construction  
- Simulate mode = execution environment  
- Clear separation between building and running  
- No mixed interaction states  
- No ambiguous controls  