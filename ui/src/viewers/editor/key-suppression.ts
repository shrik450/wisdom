import { StateEffect, StateField } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

type EditorMode = "normal" | "insert" | "visual";

export const setEditorMode = StateEffect.define<EditorMode>();

export const editorModeField = StateField.define<EditorMode>({
  create: () => "normal",
  update(mode, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setEditorMode)) {
        return effect.value;
      }
    }
    return mode;
  },
});

export const keySuppression = EditorView.domEventHandlers({
  keydown(event, view) {
    const mode = view.state.field(editorModeField);
    if (mode === "insert") {
      return false;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    const isEditing =
      event.key.length === 1 ||
      event.key === "Backspace" ||
      event.key === "Delete" ||
      event.key === "Enter" ||
      event.key === "Tab";

    if (isEditing) {
      event.preventDefault();
      return true;
    }

    return false;
  },
});

export type { EditorMode };
