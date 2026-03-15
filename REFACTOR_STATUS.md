# Refactoring Status: CanvasViewModel → MVCP Architecture

## ✅ Completed Components

### Phase 3: ViewModels (100% Complete)
- ✅ **SelectionViewModel.js** - Manages selection state (27 lines)
- ✅ **ViewportViewModel.js** - Manages zoom/pan state (47 lines)
- ✅ **InteractionViewModel.js** - Manages interaction state (drag, resize, pan) (104 lines)
- ✅ **NodeViewModel.js** - Node presentation logic (65 lines)
- ✅ **EdgeViewModel.js** - Edge presentation logic with reward colors (114 lines)
- ✅ **CanvasViewModel.js** - Refactored coordinator (145 lines, down from 871!)

**Location:** `src/main/adapter/viewmodel/`

### Phase 4: View Helpers (100% Complete)
- ✅ **GeometricHelper.js** - All geometric calculations moved from ViewModel (186 lines)
  - Edge detection (straight and curved)
  - Hit testing
  - Bezier curve calculations
  - Double-click detection

**Location:** `src/main/view/helpers/`

### Phase 2: Use Cases - DeleteNode (100% Complete)
- ✅ `deleteNodeInputBoundary.js`
- ✅ `deleteNodeInputData.js`
- ✅ `deleteNodeInteractor.js`
- ✅ `deleteNodeOutputBoundary.js`
- ✅ `deleteNodePresenter.js`

**Location:** `src/main/use_case/deleteNode/`

---

## 🚧 In Progress / TODO

### Phase 2: Remaining Use Cases (0% Complete)

#### MoveNode Use Case
**Files needed:**
```
src/main/use_case/moveNode/
├── moveNodeInputBoundary.js
├── moveNodeInputData.js
├── moveNodeInteractor.js
├── moveNodeOutputBoundary.js
└── moveNodePresenter.js
```

#### RenameNode Use Case
**Files needed:**
```
src/main/use_case/renameNode/
├── renameNodeInputBoundary.js
├── renameNodeInputData.js
├── renameNodeInteractor.js
├── renameNodeOutputBoundary.js
└── renameNodePresenter.js
```

#### SelectNode Use Case
**Files needed:**
```
src/main/use_case/selectNode/
├── selectNodeInputBoundary.js
├── selectNodeInputData.js
├── selectNodeInteractor.js
├── selectNodeOutputBoundary.js
└── selectNodePresenter.js
```

#### CreateTextLabel Use Case
**Files needed:**
```
src/main/use_case/createTextLabel/
├── createTextLabelInputBoundary.js
├── createTextLabelInputData.js
├── createTextLabelInteractor.js
├── createTextLabelOutputBoundary.js
└── createTextLabelPresenter.js
```

### Phase 1: CanvasController (0% Complete)

**File needed:** `src/main/adapter/controller/CanvasController.js` (~400-500 lines)

**Responsibilities:**
- Handle all mouse/keyboard input
- Translate events to use case input data
- Delegate to appropriate interactors
- Manage interaction state machine

**Key methods:**
- `handleMousePress(screenX, screenY)`
- `handleMouseDrag(screenX, screenY)`
- `handleMouseRelease(screenX, screenY)`
- `handleKeyPress(key)`
- `deleteSelected()`
- `startNodePlacement(type)`
- `createEdge(fromId, toId, probability, reward)`

### Phase 5: MainView Updates (0% Complete)

**File:** `src/main/view/mainView.js`

**Changes needed:**
1. Accept Controller in constructor
2. Update `draw()` to use ViewModels:
   ```javascript
   const nodeVM = this.viewModel.createNodeViewModel(node);
   fill(nodeVM.color);
   ```
3. Delegate input to Controller:
   ```javascript
   mousePressed() {
       this.controller.handleMousePress(mouseX, mouseY);
       redraw();
   }
   ```
4. Handle UI prompts (rename, text label creation)

### Phase 6: main.js Wiring (0% Complete)

**File:** `src/main/app/main.js`

**Changes needed:**
1. Remove interactors from CanvasViewModel constructor
2. Create all new use case interactors and presenters
3. Create CanvasController with all interactors
4. Pass Controller to MainView
5. Remove CommandHistory from CanvasViewModel

**New wiring pattern:**
```javascript
// Domain
const graph = new Graph();
const commandHistory = new CommandHistory(50);
const simulationState = new SimulationState();

// ViewModel (NO interactors!)
const canvasViewModel = new CanvasViewModel(graph, simulationState);

// Presenters
const deleteNodePresenter = new DeleteNodePresenter(canvasViewModel.selection);
// ... all other presenters

// Interactors
const deleteNodeInteractor = new DeleteNodeInteractor(graph, commandHistory, deleteNodePresenter);
// ... all other interactors

// Controller
const canvasController = new CanvasController(canvasViewModel, {
    deleteNode: deleteNodeInteractor,
    // ... all interactors
});

// Views
const mainView = new MainView(canvasViewModel, canvasController, sideBar);
```

### Phase 7: index.html Updates (0% Complete)

**File:** `index.html`

**Changes needed:**
Add all new script tags in correct order:
1. ViewModels (before CanvasViewModel)
2. GeometricHelper (before MainView)
3. New use case files (5 files each × 4 use cases = 20 files)
4. CanvasController (after ViewModels, before MainView)

---

## 📁 Directory Structure

```
src/main/
├── adapter/
│   ├── controller/
│   │   └── CanvasController.js          ← TODO
│   ├── viewmodel/
│   │   ├── CanvasViewModel.js           ← ✅ DONE
│   │   ├── SelectionViewModel.js        ← ✅ DONE
│   │   ├── ViewportViewModel.js         ← ✅ DONE
│   │   ├── InteractionViewModel.js      ← ✅ DONE
│   │   ├── NodeViewModel.js             ← ✅ DONE
│   │   └── EdgeViewModel.js             ← ✅ DONE
│   └── canvasViewModel.js.backup        ← Original backup
├── use_case/
│   ├── deleteNode/                      ← ✅ DONE (5 files)
│   ├── moveNode/                        ← TODO (5 files)
│   ├── renameNode/                      ← TODO (5 files)
│   ├── selectNode/                      ← TODO (5 files)
│   └── createTextLabel/                 ← TODO (5 files)
└── view/
    └── helpers/
        └── GeometricHelper.js           ← ✅ DONE
```

---

## 🔨 Next Steps to Complete Implementation

### Immediate Priority (Critical Path)

1. **Create CanvasController** (1-2 hours)
   - Extract all input handling from backup CanvasViewModel
   - Use GeometricHelper for hit detection
   - Delegate to interactors

2. **Create Remaining Use Cases** (2-3 hours)
   - Use DeleteNode as template
   - MoveNode, RenameNode, SelectNode, CreateTextLabel
   - Each follows same 5-file pattern

3. **Update main.js** (30 minutes)
   - Wire all new components
   - Remove old CanvasViewModel references
   - Create Controller with all interactors

4. **Update index.html** (15 minutes)
   - Add script tags for:
     - 5 ViewModels
     - 1 GeometricHelper
     - 20 use case files
     - 1 Controller

5. **Update MainView** (1 hour)
   - Accept Controller
   - Use ViewModels in draw()
   - Delegate input to Controller
   - Handle UI prompts

6. **Testing** (2-3 hours)
   - Test each feature systematically
   - Fix any wiring issues
   - Verify undo/redo still works

**Total estimate:** 7-10 hours to complete

---

## 🎯 Benefits Achieved So Far

### Code Reduction
- **Before:** CanvasViewModel = 871 lines (monolithic)
- **After:**
  - CanvasViewModel = 145 lines (coordinator)
  - 5 focused ViewModels = 357 lines total
  - GeometricHelper = 186 lines
  - **Total:** 688 lines, better organized!

### Separation of Concerns
- ✅ Presentation logic → ViewModels (NodeViewModel, EdgeViewModel)
- ✅ Geometric calculations → GeometricHelper (View layer)
- ✅ Business logic → Use Case Interactors (DeleteNode done, 4 more to go)
- ✅ State management → Focused ViewModels (Selection, Viewport, Interaction)

### Clean Architecture Compliance
- ✅ ViewModel no longer has CommandHistory (was Domain object in Adapter)
- ✅ Color calculations in ViewModels (presentation layer)
- ✅ Geometric algorithms in View helpers (presentation layer)
- ⏳ Still need: Controller to handle input, remaining use cases

---

---

## ✅ REFACTORING COMPLETE (2026-03-02)

**Status:** All planned refactoring completed successfully!

### What Was Completed
- ✅ All 5 ViewModels created and integrated
- ✅ GeometricHelper extracted
- ✅ All 5 new use cases implemented (DeleteNode, MoveNode, RenameNode, SelectNode, CreateTextLabel)
- ✅ CanvasController created and wired
- ✅ MainView updated to use Controller
- ✅ All dependencies wired in main.js
- ✅ Testing completed - all core features working

### Post-Refactoring Debugging
After the refactoring, several runtime issues were discovered and fixed:
1. Duplicate MoveNodeInputData class
2. Falsy ID check bug (ID = 0)
3. Node selection persistence
4. Edge creation workflow
5. Selection clearing after edge creation
6. Resize state clearing

See `DEBUGGING.md` and `REFACTOR_COMPLETE.md` for detailed information.

### Final Status
- **Application:** Fully functional
- **Architecture:** Clean Architecture compliant
- **Code Quality:** Improved separation of concerns
- **Maintainability:** Significantly enhanced

---

## 📋 Quick Start Script for Remaining Work

```bash
#!/bin/bash

# Run this from project root to create remaining use case files

for uc in moveNode renameNode selectNode createTextLabel; do
    mkdir -p "src/main/use_case/$uc"

    # Create empty files (you'll need to populate them)
    touch "src/main/use_case/$uc/${uc}InputBoundary.js"
    touch "src/main/use_case/$uc/${uc}InputData.js"
    touch "src/main/use_case/$uc/${uc}Interactor.js"
    touch "src/main/use_case/$uc/${uc}OutputBoundary.js"
    touch "src/main/use_case/$uc/${uc}Presenter.js"
done

# Create Controller
touch "src/main/adapter/controller/CanvasController.js"

echo "Files created! Now populate them following the DeleteNode pattern."
```

---

## 🔍 Testing Checklist (When Complete)

- [ ] Node creation (state, action)
- [ ] Node deletion (with undo)
- [ ] Node movement (with undo)
- [ ] Node resizing (with undo)
- [ ] Node renaming
- [ ] Node selection
- [ ] Edge creation
- [ ] Edge deletion (with undo)
- [ ] Edge selection
- [ ] Text label creation
- [ ] Text label deletion
- [ ] Text label movement
- [ ] Zoom in/out
- [ ] Pan
- [ ] Mode switching (editor ↔ simulate)
- [ ] Simulation start node selection
- [ ] Simulation playback
- [ ] Undo/Redo for all operations
- [ ] Import graph
- [ ] Export graph

---

## 📝 Notes

### Why Partial Implementation?
The refactoring is substantial (871 lines → multiple focused files). Completed portions demonstrate the architecture:
- **ViewModels:** Show proper separation of presentation state
- **GeometricHelper:** Shows how to extract view-layer calculations
- **DeleteNode:** Template for remaining use cases

### How to Continue?
1. Use `deleteNode` as template for remaining use cases
2. Extract input handling from `canvasViewModel.js.backup` to Controller
3. Wire everything in `main.js`
4. Update `index.html` with new scripts
5. Update `MainView` to use Controller + ViewModels
6. Test thoroughly

### Backup Safety
Original CanvasViewModel saved as `canvasViewModel.js.backup` - can revert if needed.
