// MCTreeView — renders the MC prefix tree on the p5 canvas inside the mc-panel area.
//
// Called from ExpectationView.draw() when vm.leftView === 'tree'.
// Uses its own pan/zoom (vm.treePanX, vm.treePanY, vm.treeZoom), NOT the main viewport.
//
// Leaf value cards are DOM children of the MC panel so its overflow clip constrains them to the
// same overlay as the canvas-rendered tree.

const MC_TREE_MIN_ZOOM = 0.25;
const MC_TREE_MAX_ZOOM = 2.5;

// Reveal animation (Task 9) — nodes/edges/chips pop in the first time their pathKey is drawn,
// timed off of when each element's reveal-state entry was first created (see _getRevealStart).
const MC_TREE_EDGE_FADE_MS = 400;   // edge grows from its source node to its target over this long
const MC_TREE_NODE_DELAY_MS = 100;  // node pop starts this long after its edge starts drawing
const MC_TREE_NODE_DURATION_MS = 300;
const MC_TREE_CHIP_DELAY_MS = 200;  // ×n chip fade starts this long after its edge starts drawing
const MC_TREE_CHIP_DURATION_MS = 250;
const MC_TREE_EDGE_ALPHA_FLOOR = 0.35; // was 0.2 — low-share branches read as barely-there yellow
const MC_TREE_EDGE_ALPHA_RANGE = 0.65; // 0.35 + 0.65*share tops out at 1.0, same as before

class MCTreeView {
    constructor(expectationState, graph, expectationViewModel) {
        this._state = expectationState;
        this._graph = graph;
        this._vm = expectationViewModel;
        this._leafCards = []; // active DOM leaf card elements
        this._imageCache = new Map(); // nodeId:src → HTMLImageElement
        // Task 9 — reveal-animation timestamps, keyed by a stable "n:"/"e:"/"c:" + pathKey string
        // so tweens survive re-renders (only cleared on leaving/tearing down the tree view).
        this._revealState = new Map();
        this._revealAnimating = false;

        // Task 9 — panel element reference (set via setPanelEl)
        this._panelEl = null;
        // Track whether draw() was called in the previous frame (used to detect re-entry
        // into tree view so we can re-enable auto-follow).
        this._wasDrawing = false;
        // Auto-follow interval
        this._followInterval = null;
        // Header DOM element (appended inside _panelEl)
        this._headerEl = null;
        // Drag state
        this._dragStart = null;
        // Bound event handlers (stored so we can remove them on teardown)
        this._onPointerDown = this._handlePointerDown.bind(this);
        this._onPointerMove = this._handlePointerMove.bind(this);
        this._onPointerUp = this._handlePointerUp.bind(this);
        this._onWheel = this._handleWheel.bind(this);
        // Cached panel bounds for auto-follow tick (set in draw())
        this._lastPanelBounds = null;
    }

    // ── Public API ───────────────────────────────────────────────────────────────────────────

    // Called from ExpectationView._createPanel() and _destroyPanel().
    // When el is non-null, attaches pointer/wheel events and builds the header.
    // When el is null, cleans up and detaches.
    setPanelEl(el) {
        // Clean up old element first
        if (this._panelEl) {
            this._panelEl.removeEventListener('pointerdown', this._onPointerDown);
            this._panelEl.removeEventListener('pointermove', this._onPointerMove);
            this._panelEl.removeEventListener('pointerup', this._onPointerUp);
            this._panelEl.removeEventListener('pointercancel', this._onPointerUp);
            this._panelEl.removeEventListener('wheel', this._onWheel);
            // Remove header from old panel
            if (this._headerEl && this._headerEl.parentNode === this._panelEl) {
                this._panelEl.removeChild(this._headerEl);
            }
        }

        this._panelEl = el;

        if (el) {
            // Enable pointer-events on the panel (it's normally pointer-events:none, but we
            // need pointer capture for drag-to-pan). The panel will selectively re-enable
            // pointer-events only when leftView === 'tree' via the cursor style logic below.
            // NOTE: The panel already sets pointer-events:none in CSS for grid/chart mode,
            // so we toggle it here depending on context in the event handlers.
            el.addEventListener('pointerdown', this._onPointerDown);
            el.addEventListener('pointermove', this._onPointerMove);
            el.addEventListener('pointerup', this._onPointerUp);
            el.addEventListener('pointercancel', this._onPointerUp);
            el.addEventListener('wheel', this._onWheel, { passive: false });

            // Build header DOM
            this._headerEl = this._buildHeader();
            el.insertBefore(this._headerEl, el.firstChild);
        } else {
            this._headerEl = null;
        }
    }

    // Called by ExpectationView.draw() when leftView is NOT 'tree', so MCTreeView can
    // reset its re-entry detection flag and stop the auto-follow interval while idle.
    notifyLeftTreeView() {
        this._wasDrawing = false;
        this.stopAutoFollow();
        this._clearLeafCards();
        this._revealState.clear();
        if (this._headerEl) this._headerEl.style.display = 'none';
    }

    // Called from ExpectationView.draw() when vm.leftView === 'tree'.
    // panelBounds: { x, y, w, h } in canvas coordinates (the mc-panel area).
    draw(canvasW, canvasH, panelBounds) {
        const vm = this._vm;
        const state = this._state;

        // Cache panel bounds for auto-follow tick
        this._lastPanelBounds = panelBounds;

        // Re-enable auto-follow on re-entry into tree view (coming from grid/chart).
        if (!this._wasDrawing) {
            vm.autoFollow = true;
        }
        this._wasDrawing = true;

        // Start auto-follow interval on first draw() call while in tree view
        if (this._followInterval === null) {
            this.startAutoFollow();
        }

        // Show header when entering tree view (may have been hidden in notifyLeftTreeView)
        if (this._headerEl) this._headerEl.style.display = '';

        // Keep cursor style in sync and ensure pointer-events are active in tree mode
        if (this._panelEl) {
            this._panelEl.style.pointerEvents = 'auto';
            if (!this._dragStart) {
                this._panelEl.style.cursor = 'grab';
            }
        }

        if (!panelBounds) {
            this._clearLeafCards();
            return;
        }

        if (!state.computed || !state.rollouts || state.rollouts.length === 0) {
            this._clearLeafCards();
            this._drawEmptyState(panelBounds);
            this._updateHeader(state, vm);
            return;
        }

        const tree = vm.getOrBuildTree(state.rollouts, this._graph, state.currentT);
        if (!tree) {
            this._clearLeafCards();
            this._drawEmptyState(panelBounds);
            this._updateHeader(state, vm);
            return;
        }

        // Clip to panel bounds
        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(panelBounds.x, panelBounds.y, panelBounds.w, panelBounds.h);
        drawingContext.clip();

        push();
        translate(panelBounds.x + vm.treePanX, panelBounds.y + vm.treePanY);
        scale(vm.treeZoom);

        // Draw column headers (t = 0, 1, 2, ...)
        this._drawColumnHeaders(tree);

        // Reset before this frame's edge/node/chip draws — each sets it back to true if its own
        // reveal tween (Task 9) hasn't finished yet, so we know whether to keep animating below.
        this._revealAnimating = false;

        // Draw edges first (behind nodes)
        this._drawEdges(tree);

        // Draw nodes
        this._drawNodes(tree);

        pop();
        drawingContext.restore();

        // Keep redrawing while any node/edge/chip reveal tween is still in progress (Task 9).
        if (this._revealAnimating && typeof redraw === 'function') {
            requestAnimationFrame(() => redraw());
        }

        // Position leaf DOM cards after the transform so we can compute screen coords
        this._updateLeafCards(tree, panelBounds, vm);

        // Update header stat text and zoom readout
        this._updateHeader(state, vm);
    }

    // Remove leaf card DOM elements and stop any intervals.
    teardown() {
        this.stopAutoFollow();
        // Remove header
        if (this._headerEl && this._headerEl.parentNode) {
            this._headerEl.parentNode.removeChild(this._headerEl);
        }
        this._headerEl = null;
        // Detach event listeners and clear panel ref
        if (this._panelEl) {
            this._panelEl.removeEventListener('pointerdown', this._onPointerDown);
            this._panelEl.removeEventListener('pointermove', this._onPointerMove);
            this._panelEl.removeEventListener('pointerup', this._onPointerUp);
            this._panelEl.removeEventListener('pointercancel', this._onPointerUp);
            this._panelEl.removeEventListener('wheel', this._onWheel);
            this._panelEl = null;
        }
        this._clearLeafCards();
        this._revealState.clear();
        this._wasDrawing = false;
        this._dragStart = null;
        this._lastPanelBounds = null;
    }

    // ── Auto-follow ──────────────────────────────────────────────────────────────────────────

    startAutoFollow() {
        if (this._followInterval !== null) return;
        this._followInterval = setInterval(() => this._tickAutoFollow(), 16);
    }

    stopAutoFollow() {
        if (this._followInterval !== null) {
            clearInterval(this._followInterval);
            this._followInterval = null;
        }
    }

    _tickAutoFollow() {
        const vm = this._vm;
        if (!vm.autoFollow) return;
        if (vm.leftView !== 'tree') return;

        const panelBounds = this._lastPanelBounds;
        if (!panelBounds) return;

        const state = this._state;
        if (!state.computed || !state.rollouts || state.rollouts.length === 0) return;

        // Get the current tree
        const tree = vm.getOrBuildTree(state.rollouts, this._graph, state.currentT);
        if (!tree) return;

        // Find the "growth frontier": the rightmost visible column at currentT.
        // State nodes at depth d have t = d/2; the rightmost revealed depth is currentT*2.
        const frontierDepth = state.currentT * 2; // state nodes at this depth
        const frontierNodes = [];
        MCPrefixTree._forEach(tree.root, node => {
            if (node.depth === frontierDepth && node.type === 'state') {
                frontierNodes.push(node);
            }
        });

        // Fallback: root node if no frontier found
        if (frontierNodes.length === 0) return;

        const frontierX = frontierNodes[0].x; // all nodes in same depth column share x
        const frontierMeanY = frontierNodes.reduce((sum, n) => sum + n.y, 0) / frontierNodes.length;

        // Target pan so frontier sits at 60% of panel width horizontally and vertically centered
        const targetX = panelBounds.w * 0.6 - frontierX * vm.treeZoom;
        const targetY = panelBounds.h * 0.5 - frontierMeanY * vm.treeZoom;

        // Ease toward target (lerp ~0.05 per 16ms ≈ cubic ease-out over ~500ms)
        const prevX = vm.treePanX;
        const prevY = vm.treePanY;
        vm.treePanX += (targetX - vm.treePanX) * 0.05;
        vm.treePanY += (targetY - vm.treePanY) * 0.05;

        // Snap to target when within 1px on both axes
        if (Math.abs(targetX - vm.treePanX) < 1 && Math.abs(targetY - vm.treePanY) < 1) {
            vm.treePanX = targetX;
            vm.treePanY = targetY;
        }

        const moved = Math.abs(vm.treePanX - prevX) > 0.01 || Math.abs(vm.treePanY - prevY) > 0.01;
        if (moved && typeof redraw === 'function') {
            redraw();
        }
    }

    // ── Pointer event handlers (drag-to-pan) ─────────────────────────────────────────────────

    _handlePointerDown(e) {
        const vm = this._vm;
        if (vm.leftView !== 'tree') return;
        this._dragStart = {
            x: e.clientX,
            y: e.clientY,
            panX: vm.treePanX,
            panY: vm.treePanY
        };
        if (this._panelEl) {
            this._panelEl.style.cursor = 'grabbing';
        }
        try { e.target.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
    }

    _handlePointerMove(e) {
        const vm = this._vm;
        if (!this._dragStart || vm.leftView !== 'tree') return;
        vm.treePanX = this._dragStart.panX + (e.clientX - this._dragStart.x);
        vm.treePanY = this._dragStart.panY + (e.clientY - this._dragStart.y);
        vm.autoFollow = false;
        if (typeof redraw === 'function') redraw();
    }

    _handlePointerUp(e) {
        this._dragStart = null;
        if (this._panelEl) {
            this._panelEl.style.cursor = 'grab';
        }
    }

    // ── Wheel event handler (zoom) ────────────────────────────────────────────────────────────

    _handleWheel(e) {
        const vm = this._vm;
        if (vm.leftView !== 'tree') return;
        e.preventDefault();

        const zoomFactor = Math.pow(1.12, -e.deltaY / 100);
        const newZoom = Math.min(MC_TREE_MAX_ZOOM,
            Math.max(MC_TREE_MIN_ZOOM, vm.treeZoom * zoomFactor));

        // Anchor zoom at cursor position
        const rect = this._panelEl.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;

        // World point under cursor before zoom
        const wx = (cx - vm.treePanX) / vm.treeZoom;
        const wy = (cy - vm.treePanY) / vm.treeZoom;

        vm.treeZoom = newZoom;
        vm.treePanX = cx - wx * newZoom;
        vm.treePanY = cy - wy * newZoom;

        vm.autoFollow = false;
        this._updateZoomReadout();
        if (typeof redraw === 'function') redraw();
    }

    // ── Header DOM ───────────────────────────────────────────────────────────────────────────

    _buildHeader() {
        const header = document.createElement('div');
        header.className = 'mc-tree-header';

        const title = document.createElement('span');
        title.className = 'mc-tree-header-title';
        title.textContent = 'Rollout tree from s₀'; // s₀

        const stat = document.createElement('span');
        stat.className = 'mc-tree-header-stat';
        this._headerStatEl = stat;

        const zoomWrap = document.createElement('span');
        zoomWrap.className = 'mc-tree-header-zoom';

        const zoomOut = document.createElement('button');
        zoomOut.className = 'mc-tree-zoom-btn';
        zoomOut.id = 'mc-zoom-out';
        zoomOut.textContent = '−'; // −
        zoomOut.addEventListener('click', (e) => {
            e.stopPropagation();
            this._stepZoom(-1);
        });

        const zoomReadout = document.createElement('span');
        zoomReadout.className = 'mc-tree-zoom-readout';
        this._zoomReadoutEl = zoomReadout;

        const zoomIn = document.createElement('button');
        zoomIn.className = 'mc-tree-zoom-btn';
        zoomIn.id = 'mc-zoom-in';
        zoomIn.textContent = '+';
        zoomIn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._stepZoom(1);
        });

        zoomWrap.appendChild(zoomOut);
        zoomWrap.appendChild(zoomReadout);
        zoomWrap.appendChild(zoomIn);

        header.appendChild(title);
        header.appendChild(stat);
        header.appendChild(zoomWrap);

        this._updateHeaderContent(null, this._vm);
        return header;
    }

    _stepZoom(direction) {
        const vm = this._vm;
        const panelBounds = this._lastPanelBounds;
        const factor = direction > 0 ? 1.12 : (1 / 1.12);
        const newZoom = Math.min(MC_TREE_MAX_ZOOM,
            Math.max(MC_TREE_MIN_ZOOM, vm.treeZoom * factor));

        if (panelBounds) {
            // Anchor zoom at panel center
            const cx = panelBounds.w / 2;
            const cy = panelBounds.h / 2;
            const wx = (cx - vm.treePanX) / vm.treeZoom;
            const wy = (cy - vm.treePanY) / vm.treeZoom;
            vm.treeZoom = newZoom;
            vm.treePanX = cx - wx * newZoom;
            vm.treePanY = cy - wy * newZoom;
        } else {
            vm.treeZoom = newZoom;
        }

        vm.autoFollow = false;
        this._updateZoomReadout();
        if (typeof redraw === 'function') redraw();
    }

    _updateZoomReadout() {
        if (this._zoomReadoutEl) {
            this._zoomReadoutEl.textContent = `${Math.round(this._vm.treeZoom * 100)}%`;
        }
    }

    _updateHeader(state, vm) {
        this._updateHeaderContent(state, vm);
        this._updateZoomReadout();
    }

    _updateHeaderContent(state, vm) {
        if (this._headerStatEl) {
            if (state && state.computed && state.rollouts) {
                const N = state.rollouts.length;
                const H = state.maxSteps || state.maxT || 0;
                const t = state.currentT || 0;
                this._headerStatEl.textContent = `${N} rollouts · horizon ${H} · revealed to t = ${t}`;
            } else {
                this._headerStatEl.textContent = '';
            }
        }
        this._updateZoomReadout();
    }

    // ── Private helpers ──────────────────────────────────────────────────────────────────────

    _drawEmptyState(panelBounds) {
        fill(AppPalette.text.muted);
        noStroke();
        textSize(12);
        textAlign(CENTER, CENTER);
        textFont(Typography.sans());
        text('No rollouts to display.', panelBounds.x + panelBounds.w / 2, panelBounds.y + panelBounds.h / 2);
    }

    _drawColumnHeaders(tree) {
        // Depth in the tree: 0 = root state, 1 = first action, 2 = second state, etc.
        // "t" label: t = depth / 2 (integer divisions)
        // We only label state-depth columns (even depths).
        const maxDepth = tree.maxDepth;
        const labelY = -30; // above the tree in tree-local space

        fill(AppPalette.text.muted);
        noStroke();
        textSize(11);
        textAlign(CENTER, BOTTOM);
        textFont(Typography.mono());

        for (let d = 0; d <= maxDepth; d += 2) {
            const x = d * MCPrefixTree.COLUMN_GAP;
            const t = d / 2;
            text(`t = ${t}`, x, labelY);
        }
    }

    // Returns the timestamp a reveal key first appeared (creating the entry on first sight), so
    // every consumer of that key computes progress off the same "just revealed" instant.
    _getRevealStart(key, now) {
        let start = this._revealState.get(key);
        if (start === undefined) {
            start = now;
            this._revealState.set(key, start);
        }
        return start;
    }

    _drawEdges(tree) {
        const edgeColor = AppPalette.expectation.treeEdge;
        const now = performance.now();
        for (const edge of tree.edges) {
            const from = edge.from;
            const to = edge.to;
            const edgeKey = `e:${from.id}|${to.id}`;
            const edgeStart = this._getRevealStart(edgeKey, now);
            const rawT = (now - edgeStart) / MC_TREE_EDGE_FADE_MS;
            const growT = Math.max(0, Math.min(1, rawT));
            if (growT < 1) this._revealAnimating = true;
            const eased = EasingUtils.easeOut(growT);

            const alpha = Math.round(255 * (MC_TREE_EDGE_ALPHA_FLOOR + MC_TREE_EDGE_ALPHA_RANGE * edge.share));
            const weight = (1 + 5 * edge.share) / (this._vm.treeZoom || 1);

            const col = ColorUtils.applyAlpha(edgeColor, alpha);

            // Grow the edge from its source toward its target rather than popping in at full
            // length (Task 9's stroke-dashoffset draw-in, adapted to a canvas 2D context).
            const curX = from.x + (to.x - from.x) * eased;
            const curY = from.y + (to.y - from.y) * eased;

            drawingContext.save();
            drawingContext.strokeStyle = col;
            drawingContext.lineWidth = weight;
            drawingContext.beginPath();
            drawingContext.moveTo(from.x, from.y);
            drawingContext.lineTo(curX, curY);
            drawingContext.stroke();
            drawingContext.restore();

            // ×n chip at edge midpoint — fades in after a delay relative to the edge's own start.
            this._drawEdgeChip(from, to, edge, edgeColor, alpha, edgeStart, now);
        }
    }

    _drawEdgeChip(from, to, edge, edgeColor, edgeAlpha, edgeStart, now) {
        const chipT = Math.max(0, Math.min(1, (now - edgeStart - MC_TREE_CHIP_DELAY_MS) / MC_TREE_CHIP_DURATION_MS));
        if (chipT < 1) this._revealAnimating = true;
        if (chipT <= 0) return; // not revealed yet — nothing to draw
        const chipAlphaMul = EasingUtils.easeOut(chipT);

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const label = `\xD7${edge.count}`; // ×n

        const fontSize = 9;
        textFont(Typography.mono());
        textSize(fontSize);
        const textW = textWidth(label);
        const padX = 5;
        const padY = 3;
        const chipW = textW + padX * 2;
        const chipH = fontSize + padY * 2;
        const chipX = midX - chipW / 2;
        const chipY = midY - chipH / 2;

        // Background: treeEdge color at 28% opacity (scaled by the chip's own fade-in progress)
        const bgCol = ColorUtils.applyAlpha(edgeColor, Math.round(255 * 0.28 * chipAlphaMul));
        fill(bgCol);
        noStroke();
        rect(chipX, chipY, chipW, chipH, 4);

        // Text: use edgeColor at edgeAlpha, scaled by the same fade-in progress
        fill(ColorUtils.applyAlpha(edgeColor, Math.round(edgeAlpha * chipAlphaMul)));
        noStroke();
        textAlign(CENTER, CENTER);
        textFont(Typography.mono());
        textSize(fontSize);
        text(label, midX, midY);
    }

    _drawNodes(tree) {
        MCPrefixTree._forEach(tree.root, node => {
            this._drawNode(node);
        });
    }

    _drawNode(node) {
        if (node.type === 'state') {
            this._drawStateNode(node);
        } else {
            this._drawActionNode(node);
        }
    }

    // Reveal (Task 9): pop-in scale (spring, delayed after the incoming edge starts drawing) +
    // linear fade, keyed by the node's own pathKey so tweens are stable across re-renders.
    _nodeReveal(node) {
        const now = performance.now();
        const key = `n:${node.id}`;
        const start = this._getRevealStart(key, now);
        const elapsed = now - start - MC_TREE_NODE_DELAY_MS;
        if (elapsed <= 0) {
            this._revealAnimating = true;
            return { scale: 0, alpha: 0 };
        }
        const t = Math.min(1, elapsed / MC_TREE_NODE_DURATION_MS);
        if (t < 1) this._revealAnimating = true;
        return { scale: EasingUtils.easeOutBack(t), alpha: EasingUtils.easeOut(t) };
    }

    _drawStateNode(node) {
        const R = 24; // radius in tree space (before zoom)
        const color = AppPalette.node.state;
        const { scale: s, alpha: revealAlpha } = this._nodeReveal(node);
        if (revealAlpha <= 0) return; // not revealed yet — nothing to draw

        push();
        translate(node.x, node.y);
        scale(Math.max(0.001, s));
        noStroke();
        fill(ColorUtils.applyAlpha(color, Math.round(255 * revealAlpha)));
        circle(0, 0, R * 2);

        // Circle-clip image if present
        if (node.image) {
            const img = this._getImage(node);
            if (img && img !== 'failed' && img.complete && img.naturalWidth > 0) {
                drawingContext.save();
                drawingContext.globalAlpha = revealAlpha;
                drawingContext.beginPath();
                drawingContext.arc(0, 0, R * 0.95, 0, Math.PI * 2);
                drawingContext.clip();
                drawingContext.drawImage(img, -R, -R, R * 2, R * 2);
                drawingContext.restore();
            }
        }

        // Name text above node (always visible, even with image)
        fill(ColorUtils.applyAlpha(AppPalette.text.muted, Math.round(255 * revealAlpha)));
        noStroke();
        textSize(11);
        textAlign(CENTER, BOTTOM);
        textFont(Typography.sans());
        const label = node.name && node.name.length > 6 ? node.name.slice(0, 5) + '…' : (node.name || '');
        text(label, 0, -R - 4);

        pop();
    }

    _drawActionNode(node) {
        const R = 14; // radius in tree space (before zoom)
        const color = AppPalette.node.action;
        const { scale: s, alpha: revealAlpha } = this._nodeReveal(node);
        if (revealAlpha <= 0) return; // not revealed yet — nothing to draw

        push();
        translate(node.x, node.y);
        scale(Math.max(0.001, s));
        noStroke();
        fill(ColorUtils.applyAlpha(color, Math.round(255 * revealAlpha)));
        circle(0, 0, R * 2);

        // Name inside
        fill(ColorUtils.applyAlpha(AppPalette.text.inverse, Math.round(255 * revealAlpha)));
        noStroke();
        textSize(10);
        textAlign(CENTER, CENTER);
        textFont(Typography.mono());
        const label = node.name && node.name.length > 4 ? node.name.slice(0, 3) + '…' : (node.name || '');
        text(label, 0, 0);

        pop();
    }

    // ── Image caching ────────────────────────────────────────────────────────────────────────

    _getImage(node) {
        if (!node.image) return null;
        const key = `${node.nodeId}:${node.image}`;
        if (this._imageCache.has(key)) return this._imageCache.get(key);
        const img = new Image();
        img.onload = () => { if (typeof redraw === 'function') redraw(); };
        img.onerror = () => { this._imageCache.set(key, 'failed'); };
        this._imageCache.set(key, img);
        img.src = node.image;
        return img;
    }

    // ── Leaf value DOM cards ─────────────────────────────────────────────────────────────────

    _clearLeafCards() {
        for (const card of this._leafCards) {
            if (card.parentNode) card.parentNode.removeChild(card);
        }
        this._leafCards = [];
    }

    // Convert tree-local coords to panel-local coords (top-left of _panelEl = 0,0).
    // Cards appended to _panelEl use these directly as left/top.
    _treeToPanelLocal(treeX, treeY, vm) {
        return {
            x: Math.round(vm.treePanX + treeX * vm.treeZoom),
            y: Math.round(vm.treePanY + treeY * vm.treeZoom)
        };
    }

    _updateLeafCards(tree, panelBounds, vm) {
        const container = this._panelEl || document.body;

        // Collect leaf nodes
        const leaves = [];
        MCPrefixTree._forEach(tree.root, node => {
            if (node.isLeaf) leaves.push(node);
        });

        // Rebuild cards if count changed, otherwise update positions
        if (this._leafCards.length !== leaves.length) {
            this._clearLeafCards();
            for (const leaf of leaves) {
                const card = this._buildLeafCard(leaf);
                container.appendChild(card);
                this._leafCards.push(card);
            }
        }

        // Update positions and content
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            const card = this._leafCards[i];
            if (!card) continue;

            const R = 24; // state node radius
            if (this._panelEl) {
                // Panel-local positioning — panel's overflow:hidden clips the cards automatically
                const pos = this._treeToPanelLocal(leaf.x + R + 6, leaf.y - 20, vm);
                card.style.left = `${pos.x}px`;
                card.style.top = `${pos.y}px`;
            } else {
                // Fallback: page-absolute positioning when panel isn't available
                const canvasX = panelBounds.x + vm.treePanX + (leaf.x + R + 6) * vm.treeZoom;
                const canvasY = panelBounds.y + vm.treePanY + (leaf.y - 20) * vm.treeZoom;
                const cnv = document.querySelector('canvas');
                const cr = cnv ? cnv.getBoundingClientRect() : { left: 0, top: 0 };
                card.style.left = `${Math.round(cr.left + canvasX)}px`;
                card.style.top = `${Math.round(cr.top + canvasY)}px`;
            }

            this._refreshLeafCard(card, leaf);
        }
    }

    _buildLeafCard(leaf) {
        const card = document.createElement('div');
        card.className = 'mc-tree-leaf-card';
        this._refreshLeafCard(card, leaf);
        // Fade in (Task 9) — starts at opacity 0, then flips to 1 on the next frame so the
        // CSS `transition` on .mc-tree-leaf-card actually animates instead of snapping in.
        card.style.opacity = '0';
        requestAnimationFrame(() => { card.style.opacity = '1'; });
        return card;
    }

    _refreshLeafCard(card, leaf) {
        const meanReturn = leaf.meanReturn;
        const count = leaf.count;
        const minReturn = leaf.minReturn;
        const maxReturn = leaf.maxReturn;
        const isTruncated = leaf.isTruncated;

        let html = '';

        if (meanReturn !== null && meanReturn !== undefined) {
            const sign = meanReturn >= 0 ? '+' : '−';
            const color = meanReturn >= 0
                ? AppPalette.reward.positiveCss
                : AppPalette.reward.negativeCss;
            const absVal = Math.abs(meanReturn).toFixed(1);
            html += `<div class="mc-tree-leaf-card__mean" style="color:${color}">Ḡ = ${sign}${absVal}</div>`;
        }

        let subLine = '';
        if (count !== undefined) subLine += `\xD7${count}`;
        if (minReturn !== null && minReturn !== undefined && maxReturn !== null && maxReturn !== undefined) {
            subLine += ` [${minReturn.toFixed(1)}, ${maxReturn.toFixed(1)}]`;
        }
        if (subLine) {
            html += `<div class="mc-tree-leaf-card__sub">${subLine}</div>`;
        }

        if (isTruncated) {
            html += `<div class="mc-tree-leaf-card__truncated">⋯</div>`;
        }

        card.innerHTML = html;
    }
}
