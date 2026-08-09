// MCTreeView — renders the MC prefix tree on the p5 canvas inside the mc-panel area.
//
// Called from ExpectationView.draw() when vm.leftView === 'tree'.
// Uses its own pan/zoom (vm.treePanX, vm.treePanY, vm.treeZoom), NOT the main viewport.
//
// Leaf value cards are DOM overlays (<div class="mc-tree-leaf-card">) appended to document.body
// and repositioned on every draw().

class MCTreeView {
    constructor(expectationState, graph, expectationViewModel) {
        this._state = expectationState;
        this._graph = graph;
        this._vm = expectationViewModel;
        this._leafCards = []; // active DOM leaf card elements
        this._imageCache = new Map(); // nodeId:src → HTMLImageElement
    }

    // ── Public API ───────────────────────────────────────────────────────────────────────────

    // Called from ExpectationView.draw() when vm.leftView === 'tree'.
    // panelBounds: { x, y, w, h } in canvas coordinates (the mc-panel area).
    draw(canvasW, canvasH, panelBounds) {
        const vm = this._vm;
        const state = this._state;

        if (!panelBounds) {
            this._clearLeafCards();
            return;
        }

        if (!state.computed || !state.rollouts || state.rollouts.length === 0) {
            this._clearLeafCards();
            this._drawEmptyState(panelBounds);
            return;
        }

        const tree = vm.getOrBuildTree(state.rollouts, this._graph, state.currentT);
        if (!tree) {
            this._clearLeafCards();
            this._drawEmptyState(panelBounds);
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

        // Draw edges first (behind nodes)
        this._drawEdges(tree);

        // Draw nodes
        this._drawNodes(tree);

        pop();
        drawingContext.restore();

        // Position leaf DOM cards after the transform so we can compute screen coords
        this._updateLeafCards(tree, panelBounds, vm);
    }

    // Remove leaf card DOM elements and stop any intervals.
    teardown() {
        this._clearLeafCards();
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

    _drawEdges(tree) {
        const edgeColor = AppPalette.expectation.treeEdge;
        for (const edge of tree.edges) {
            const from = edge.from;
            const to = edge.to;
            const alpha = Math.round(255 * (0.2 + 0.7 * edge.share));
            const weight = (1 + 5 * edge.share) / (this._vm.treeZoom || 1);

            const col = ColorUtils.applyAlpha(edgeColor, alpha);

            drawingContext.save();
            drawingContext.strokeStyle = col;
            drawingContext.lineWidth = weight;
            drawingContext.beginPath();
            drawingContext.moveTo(from.x, from.y);
            drawingContext.lineTo(to.x, to.y);
            drawingContext.stroke();
            drawingContext.restore();

            // ×n chip at edge midpoint
            this._drawEdgeChip(from, to, edge, edgeColor, alpha);
        }
    }

    _drawEdgeChip(from, to, edge, edgeColor, edgeAlpha) {
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

        // Background: treeEdge color at 20% opacity
        const bgCol = ColorUtils.applyAlpha(edgeColor, Math.round(255 * 0.2));
        fill(bgCol);
        noStroke();
        rect(chipX, chipY, chipW, chipH, 4);

        // Text: use edgeColor at edgeAlpha
        fill(ColorUtils.applyAlpha(edgeColor, edgeAlpha));
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

    _drawStateNode(node) {
        const R = 24; // radius in tree space (before zoom)
        const color = AppPalette.node.state;

        push();
        noStroke();
        fill(color);
        circle(node.x, node.y, R * 2);

        // Circle-clip image if present
        if (node.image) {
            const img = this._getImage(node);
            if (img && img !== 'failed' && img.complete && img.naturalWidth > 0) {
                drawingContext.save();
                drawingContext.beginPath();
                drawingContext.arc(node.x, node.y, R * 0.95, 0, Math.PI * 2);
                drawingContext.clip();
                drawingContext.drawImage(img, node.x - R, node.y - R, R * 2, R * 2);
                drawingContext.restore();
            }
        }

        // Name text above node
        const hasVisibleImage = node.image && (() => {
            const img = this._getImage(node);
            return img && img !== 'failed' && img.complete && img.naturalWidth > 0;
        })();

        if (!hasVisibleImage) {
            fill(AppPalette.text.muted);
            noStroke();
            textSize(11);
            textAlign(CENTER, BOTTOM);
            textFont(Typography.sans());
            const label = node.name && node.name.length > 6 ? node.name.slice(0, 5) + '…' : (node.name || '');
            text(label, node.x, node.y - R - 4);
        }

        pop();
    }

    _drawActionNode(node) {
        const R = 14; // radius in tree space (before zoom)
        const color = AppPalette.node.action;

        push();
        noStroke();
        fill(color);
        circle(node.x, node.y, R * 2);

        // Name inside
        fill(AppPalette.text.inverse);
        noStroke();
        textSize(10);
        textAlign(CENTER, CENTER);
        textFont(Typography.mono());
        const label = node.name && node.name.length > 4 ? node.name.slice(0, 3) + '…' : (node.name || '');
        text(label, node.x, node.y);

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

    // Convert a tree-local coordinate to canvas screen space, then to page space.
    // Tree local → canvas: translate by (panelBounds.x + treePanX, panelBounds.y + treePanY), scale by treeZoom
    // Canvas → page: canvas is positioned below the topbar; p5 canvas element's getBoundingClientRect().top
    _treeToPage(treeX, treeY, panelBounds, vm) {
        const canvasX = panelBounds.x + vm.treePanX + treeX * vm.treeZoom;
        const canvasY = panelBounds.y + vm.treePanY + treeY * vm.treeZoom;
        // Get the p5 canvas element's position on the page
        let canvasTop = 0;
        let canvasLeft = 0;
        const cnv = document.querySelector('canvas');
        if (cnv) {
            const rect = cnv.getBoundingClientRect();
            canvasTop = rect.top + window.scrollY;
            canvasLeft = rect.left + window.scrollX;
        }
        return {
            x: canvasLeft + canvasX,
            y: canvasTop + canvasY
        };
    }

    _updateLeafCards(tree, panelBounds, vm) {
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
                document.body.appendChild(card);
                this._leafCards.push(card);
            }
        }

        // Update positions and content
        for (let i = 0; i < leaves.length; i++) {
            const leaf = leaves[i];
            const card = this._leafCards[i];
            if (!card) continue;

            const R = 24; // state node radius
            const pos = this._treeToPage(leaf.x + R + 6, leaf.y - 20, panelBounds, vm);
            card.style.left = `${Math.round(pos.x)}px`;
            card.style.top = `${Math.round(pos.y)}px`;

            // Update content in case currentT changed
            this._refreshLeafCard(card, leaf);
        }
    }

    _buildLeafCard(leaf) {
        const card = document.createElement('div');
        card.className = 'mc-tree-leaf-card';
        this._refreshLeafCard(card, leaf);
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
