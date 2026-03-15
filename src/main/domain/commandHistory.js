// CommandHistory manages undo/redo stacks
class CommandHistory {
    constructor(maxHistorySize = 50) {
        this.undoStack = [];
        this.redoStack = [];
        this.maxHistorySize = maxHistorySize;
    }

    // Execute a command and add it to history
    execute(command) {
        command.execute();
        this.undoStack.push(command);

        // Clear redo stack when new command is executed
        this.redoStack = [];

        // Limit history size
        if (this.undoStack.length > this.maxHistorySize) {
            this.undoStack.shift();
        }
    }

    // Undo the last command
    undo() {
        if (this.undoStack.length === 0) {
            return false;
        }

        const command = this.undoStack.pop();
        command.undo();
        this.redoStack.push(command);

        return true;
    }

    // Redo the last undone command
    redo() {
        if (this.redoStack.length === 0) {
            return false;
        }

        const command = this.redoStack.pop();
        command.execute();
        this.undoStack.push(command);

        return true;
    }

    // Check if undo is available
    canUndo() {
        return this.undoStack.length > 0;
    }

    // Check if redo is available
    canRedo() {
        return this.redoStack.length > 0;
    }

    // Get description of next undo operation
    getUndoDescription() {
        if (this.undoStack.length === 0) {
            return null;
        }
        return this.undoStack[this.undoStack.length - 1].getDescription();
    }

    // Get description of next redo operation
    getRedoDescription() {
        if (this.redoStack.length === 0) {
            return null;
        }
        return this.redoStack[this.redoStack.length - 1].getDescription();
    }

    // Clear all history
    clear() {
        this.undoStack = [];
        this.redoStack = [];
    }

    // Get current history size
    getHistorySize() {
        return {
            undo: this.undoStack.length,
            redo: this.redoStack.length
        };
    }
}
