// ViewModel for Value Iteration visualization
class ValueIterationViewModel {
    constructor() {
        this.reset();
    }

    reset() {
        this.columns = [];          // Array of column data for rendering
        this.activeColumnIndex = -1;
        this.activeStateId = null;
        this.animationPhase = 'idle';
        this.revealedValues = {};   // columnIndex -> Set of stateIds with revealed values
        this.visibleColumnCount = 0; // How many columns are currently shown

        // Layout constants
        this.COLUMN_GAP = 250;
        this.NODE_RADIUS = 30;
        this.VERTICAL_PADDING = 80;
        this.TOP_PADDING = 60;

        // Cached canvas dimensions for relayout
        this._canvasWidth = 0;
        this._canvasHeight = 0;
        this._viState = null;
    }

    /**
     * Compute layout positions for all columns and nodes (data only).
     * No columns are visible yet — call showNextColumn() to reveal them one at a time.
     */
    computeLayout(viState, canvasWidth, canvasHeight) {
        this.columns = [];
        this.revealedValues = {};
        this.visibleColumnCount = 0;
        this._canvasWidth = canvasWidth;
        this._canvasHeight = canvasHeight;
        this._viState = viState;

        const totalColumns = viState.totalColumns;
        const stateCount = viState.stateCount;
        if (totalColumns === 0 || stateCount === 0) return;

        const availableHeight = canvasHeight - this.TOP_PADDING - this.VERTICAL_PADDING;
        const verticalSpacing = stateCount > 1 ? availableHeight / (stateCount - 1) : 0;

        for (let colIdx = 0; colIdx < totalColumns; colIdx++) {
            const timestep = viState.getTimestep(colIdx);
            const values = viState.getValues(colIdx);

            const states = viState.stateIds.map((stateId, stateIdx) => {
                const y = this.TOP_PADDING + (stateCount > 1 ? stateIdx * verticalSpacing : availableHeight / 2);
                return {
                    id: stateId,
                    name: viState.stateNames[stateId],
                    x: 0, // will be set by _recomputeXPositions
                    y: y,
                    value: values[stateId] ?? 0,
                    radius: this.NODE_RADIUS
                };
            });

            this.columns.push({
                columnIndex: colIdx,
                timestep: timestep,
                x: 0,
                states: states
            });

            this.revealedValues[colIdx] = new Set();
        }
    }

    /**
     * Make the next column visible and reposition all visible columns.
     * Column 0 (t=T) appears first, centered. Each subsequent column
     * shifts existing columns right and appears on the left.
     */
    showNextColumn() {
        if (this.visibleColumnCount >= this.columns.length) return;
        this.visibleColumnCount++;
        this._recomputeXPositions();
    }

    /**
     * Recompute x positions so visible columns are centered on canvas.
     * Column 0 (t=T) is rightmost, column N (t=0) is leftmost.
     */
    _recomputeXPositions() {
        const n = this.visibleColumnCount;
        if (n === 0) return;

        const totalWidth = (n - 1) * this.COLUMN_GAP;
        const startX = (this._canvasWidth - totalWidth) / 2;

        for (let i = 0; i < n; i++) {
            const col = this.columns[i];
            // column 0 is rightmost among visible columns
            const screenIdx = n - 1 - i;
            const x = startX + screenIdx * this.COLUMN_GAP;
            col.x = x;
            col.states.forEach(s => { s.x = x; });
        }
    }

    /** Mark a value as revealed (for animation) */
    revealValue(columnIndex, stateId) {
        if (!this.revealedValues[columnIndex]) {
            this.revealedValues[columnIndex] = new Set();
        }
        this.revealedValues[columnIndex].add(stateId);
    }

    /** Check if a value has been revealed */
    isValueRevealed(columnIndex, stateId) {
        return this.revealedValues[columnIndex]?.has(stateId) ?? false;
    }

    /** Reveal all values in a column */
    revealColumn(columnIndex) {
        const col = this.columns[columnIndex];
        if (!col) return;
        col.states.forEach(s => this.revealValue(columnIndex, s.id));
    }

    /** Get column data by index */
    getColumn(columnIndex) {
        return this.columns[columnIndex] || null;
    }
}
