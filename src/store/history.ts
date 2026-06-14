// @ts-nocheck
// ─── Shared Undo/Redo history helpers ─────────────────────────────────────────
// Pulled out of store/index.ts so the camera slice (and any other slice) can
// push history entries too, without creating a circular import.

export const MAX_HISTORY = 50;

// Returns the partial state update needed to record `state.project` as a new
// undo entry. Pushing a new entry always clears the redo stack, since the
// redo history is only valid for the branch of edits it was created from.
export function pushHistory(state) {
  const snapshot = JSON.stringify(state.project);
  const newUndo = [...state.undoStack, snapshot].slice(-MAX_HISTORY);
  return { undoStack: newUndo, redoStack: [] };
}
