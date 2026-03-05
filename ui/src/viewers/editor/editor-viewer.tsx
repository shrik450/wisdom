import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  cursorCharLeft,
  cursorCharRight,
  cursorGroupBackward,
  cursorGroupForward,
  cursorLineDown,
  cursorLineEnd,
  cursorLineStart,
  cursorLineUp,
  deleteCharForward,
  redo,
  undo,
} from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";
import { useLocation } from "wouter";
import { useActions, type ActionSpec } from "../../actions/action-registry";
import { writeFile } from "../../api/fs";
import {
  isLikelyTextFallback,
  isTextContentType,
} from "../../content-type-utils";
import { useFileContent } from "../../hooks/use-fs";
import { useWorkspaceMutated } from "../../hooks/use-workspace-mutated";
import type { KeyBindingDef } from "../../keyboard/keybind-state-machine";
import { useKeyboardNavContext } from "../../keyboard/keyboard-nav";
import { buildWorkspaceHref } from "../../path-utils";
import { type ViewerProps, type ViewerRoute } from "../registry";
import { languageDisplayName } from "./language";
import {
  moveDocBoundary,
  moveToFirstNonBlank,
  moveToWordEnd,
  moveWithCommand,
  withView,
} from "./motions";
import { useCodemirror } from "./use-codemirror";

const FORM_INPUT_SELECTOR = "input, textarea, select";

export const defaultKeybinds: KeyBindingDef[] = [
  { mode: "normal", keys: "h", action: "editor.move-left", scope: "editor" },
  { mode: "normal", keys: "j", action: "editor.move-down", scope: "editor" },
  { mode: "normal", keys: "k", action: "editor.move-up", scope: "editor" },
  {
    mode: "normal",
    keys: "l",
    action: "editor.move-right",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "w",
    action: "editor.move-word-forward",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "b",
    action: "editor.move-word-backward",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "e",
    action: "editor.move-word-end",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "0",
    action: "editor.move-line-start",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "$",
    action: "editor.move-line-end",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "^",
    action: "editor.move-first-non-blank",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "g g",
    action: "editor.move-doc-start",
    scope: "editor",
  },
  { mode: "normal", keys: "G", action: "editor.move-doc-end", scope: "editor" },
  {
    mode: "normal",
    keys: "i",
    action: "editor.enter-insert",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "a",
    action: "editor.enter-insert-after",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "A",
    action: "editor.enter-insert-eol",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "I",
    action: "editor.enter-insert-bol",
    scope: "editor",
  },
  { mode: "normal", keys: "o", action: "editor.open-below", scope: "editor" },
  { mode: "normal", keys: "O", action: "editor.open-above", scope: "editor" },
  { mode: "normal", keys: "u", action: "editor.undo", scope: "editor" },
  { mode: "normal", keys: "Ctrl+r", action: "editor.redo", scope: "editor" },
  {
    mode: "normal",
    keys: "x",
    action: "editor.delete-char",
    scope: "editor",
  },
  {
    mode: "insert",
    keys: "Escape",
    action: "editor.exit-insert",
    scope: "editor",
  },
];

function EditorViewer({ path, entry }: ViewerProps) {
  const { data, loading, error } = useFileContent(path);
  const notifyMutated = useWorkspaceMutated();
  const [, navigate] = useLocation();
  const { pushMode, popMode } = useKeyboardNavContext();

  const containerRef = useRef<HTMLDivElement>(null);
  const insertPushedRef = useRef(false);
  const viewRef = useRef<EditorView | null>(null);

  const cmResult = useCodemirror({
    containerRef,
    initialDoc: data,
    extension: entry.extension,
    contentType: entry.contentType,
  });

  useEffect(() => {
    viewRef.current = cmResult.view;
  }, [cmResult.view]);

  useEffect(() => {
    return () => {
      if (insertPushedRef.current) {
        insertPushedRef.current = false;
        popMode();
      }
    };
  }, [popMode]);

  const enterInsertMode = useCallback(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (!insertPushedRef.current) {
      insertPushedRef.current = true;
      pushMode("insert");
    }
    cmResult.setMode("insert");
    view.focus();
  }, [cmResult, pushMode]);

  const exitInsertMode = useCallback(() => {
    if (insertPushedRef.current) {
      insertPushedRef.current = false;
      popMode();
    }
    cmResult.setMode("normal");
  }, [cmResult, popMode]);

  const handleSave = useCallback(async () => {
    if (!cmResult.view) {
      return;
    }

    const content = cmResult.getDoc();
    await writeFile(path, content);
    cmResult.markClean();
    notifyMutated();
  }, [cmResult, notifyMutated, path]);

  const handleQuit = useCallback(() => {
    navigate(buildWorkspaceHref(entry.parentPath));
  }, [entry.parentPath, navigate]);

  const handleSaveAndQuit = useCallback(async () => {
    await handleSave();
    handleQuit();
  }, [handleQuit, handleSave]);

  const handleCopy = useCallback(
    (count: number | null) => {
      void count;
      if (!cmResult.view) {
        return;
      }
      void navigator.clipboard.writeText(cmResult.getDoc());
    },
    [cmResult],
  );

  useActions(
    useMemo<readonly ActionSpec[]>(
      () => [
        {
          kind: "command",
          id: "editor.save",
          label: "Save",
          aliases: ["w", "write"],
          headerDisplay: "inline",
          disabled: !cmResult.dirty,
          onSelect: (count) => {
            void count;
            void handleSave();
          },
        },
        {
          kind: "command",
          id: "editor.save-and-quit",
          label: "Save and Quit",
          aliases: ["wq"],
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            void handleSaveAndQuit();
          },
        },
        {
          kind: "command",
          id: "editor.quit",
          label: "Quit",
          aliases: ["q", "quit"],
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            handleQuit();
          },
        },
        {
          kind: "command",
          id: "editor.toggle-wrap",
          label: "Toggle Word Wrap",
          aliases: ["wrap"],
          headerDisplay: "overflow",
          onSelect: (count) => {
            void count;
            cmResult.toggleWrap();
          },
        },
        {
          kind: "command",
          id: "editor.toggle-line-numbers",
          label: "Toggle Line Numbers",
          aliases: ["lines"],
          headerDisplay: "overflow",
          onSelect: (count) => {
            void count;
            cmResult.toggleLineNumbers();
          },
        },
        {
          kind: "command",
          id: "text.copy",
          label: "Copy File Content",
          headerDisplay: "palette-only",
          onSelect: handleCopy,
        },
        {
          kind: "motion",
          id: "editor.move-left",
          label: "Move Left",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorCharLeft),
        },
        {
          kind: "motion",
          id: "editor.move-down",
          label: "Move Down",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorLineDown),
        },
        {
          kind: "motion",
          id: "editor.move-up",
          label: "Move Up",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorLineUp),
        },
        {
          kind: "motion",
          id: "editor.move-right",
          label: "Move Right",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorCharRight),
        },
        {
          kind: "motion",
          id: "editor.move-word-forward",
          label: "Move Word Forward",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorGroupForward),
        },
        {
          kind: "motion",
          id: "editor.move-word-backward",
          label: "Move Word Backward",
          headerDisplay: "palette-only",
          range: (count) =>
            moveWithCommand(viewRef, count, cursorGroupBackward),
        },
        {
          kind: "motion",
          id: "editor.move-word-end",
          label: "Move Word End",
          headerDisplay: "palette-only",
          range: (count) => moveToWordEnd(viewRef, count),
        },
        {
          kind: "motion",
          id: "editor.move-line-start",
          label: "Move Line Start",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorLineStart),
        },
        {
          kind: "motion",
          id: "editor.move-line-end",
          label: "Move Line End",
          headerDisplay: "palette-only",
          range: (count) => moveWithCommand(viewRef, count, cursorLineEnd),
        },
        {
          kind: "motion",
          id: "editor.move-first-non-blank",
          label: "Move First Non-Blank",
          headerDisplay: "palette-only",
          range: () => moveToFirstNonBlank(viewRef),
        },
        {
          kind: "motion",
          id: "editor.move-doc-start",
          label: "Move Document Start",
          headerDisplay: "palette-only",
          range: (count) => moveDocBoundary(viewRef, count, "start"),
        },
        {
          kind: "motion",
          id: "editor.move-doc-end",
          label: "Move Document End",
          headerDisplay: "palette-only",
          range: (count) => moveDocBoundary(viewRef, count, "end"),
        },
        {
          kind: "command",
          id: "editor.enter-insert",
          label: "Enter Insert Mode",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            enterInsertMode();
          },
        },
        {
          kind: "command",
          id: "editor.enter-insert-after",
          label: "Append",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            withView(viewRef, (view) => {
              const pos = view.state.selection.main.head;
              const line = view.state.doc.lineAt(pos);
              const next = Math.min(line.to, pos + 1);
              view.dispatch({ selection: { anchor: next } });
            });
            enterInsertMode();
          },
        },
        {
          kind: "command",
          id: "editor.enter-insert-eol",
          label: "Append End of Line",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            withView(viewRef, (view) => {
              const line = view.state.doc.lineAt(
                view.state.selection.main.head,
              );
              view.dispatch({ selection: { anchor: line.to } });
            });
            enterInsertMode();
          },
        },
        {
          kind: "command",
          id: "editor.enter-insert-bol",
          label: "Insert Line Start",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            moveToFirstNonBlank(viewRef);
            enterInsertMode();
          },
        },
        {
          kind: "command",
          id: "editor.open-below",
          label: "Open Line Below",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            withView(viewRef, (view) => {
              const line = view.state.doc.lineAt(
                view.state.selection.main.head,
              );
              view.dispatch({
                changes: { from: line.to, insert: "\n" },
                selection: { anchor: line.to + 1 },
              });
            });
            enterInsertMode();
          },
        },
        {
          kind: "command",
          id: "editor.open-above",
          label: "Open Line Above",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;
            withView(viewRef, (view) => {
              const line = view.state.doc.lineAt(
                view.state.selection.main.head,
              );
              view.dispatch({
                changes: { from: line.from, insert: "\n" },
                selection: { anchor: line.from },
              });
            });
            enterInsertMode();
          },
        },
        {
          kind: "command",
          id: "editor.exit-insert",
          label: "Exit Insert Mode",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            void count;

            if (cmResult.view?.hasFocus) {
              exitInsertMode();
              return;
            }

            const active = document.activeElement;
            if (
              active instanceof HTMLElement &&
              active.matches(FORM_INPUT_SELECTOR)
            ) {
              active.blur();
              return;
            }

            if (insertPushedRef.current) {
              exitInsertMode();
            }
          },
        },
        {
          kind: "command",
          id: "editor.undo",
          label: "Undo",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            withView(viewRef, (view) => {
              const n = count ?? 1;
              for (let i = 0; i < n; i += 1) {
                undo(view);
              }
            });
          },
        },
        {
          kind: "command",
          id: "editor.redo",
          label: "Redo",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            withView(viewRef, (view) => {
              const n = count ?? 1;
              for (let i = 0; i < n; i += 1) {
                redo(view);
              }
            });
          },
        },
        {
          kind: "command",
          id: "editor.delete-char",
          label: "Delete Character",
          headerDisplay: "palette-only",
          onSelect: (count) => {
            withView(viewRef, (view) => {
              const n = count ?? 1;
              for (let i = 0; i < n; i += 1) {
                deleteCharForward(view);
              }
            });
          },
        },
      ],
      [
        cmResult,
        enterInsertMode,
        exitInsertMode,
        handleCopy,
        handleQuit,
        handleSave,
        handleSaveAndQuit,
      ],
    ),
  );

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading...</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-txt-muted">Failed to load file.</p>;
  }

  if (data === null) {
    return null;
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={containerRef} className="min-h-0 flex-1" />
      <div className="flex items-center border-t border-bdr px-3 py-1 text-xs text-txt-muted">
        {cmResult.dirty && <span className="mr-3 text-accent">[+]</span>}
        <span>
          Ln {cmResult.cursorLine}, Col {cmResult.cursorCol}
        </span>
        <span className="ml-3">
          {languageDisplayName(entry.extension, entry.contentType)}
        </span>
      </div>
    </div>
  );
}

export const editorViewerRoute: ViewerRoute = {
  name: "Editor",
  scope: "editor",
  match: (entry) =>
    entry.kind === "file" &&
    (isTextContentType(entry.contentType) ||
      isLikelyTextFallback(entry.contentType, entry.extension)),
  priority: 10,
  component: EditorViewer,
};
