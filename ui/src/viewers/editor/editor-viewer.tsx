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
  deleteCharBackward,
  deleteCharForward,
  deleteGroupBackward,
  deleteToLineStart,
  indentLess,
  indentMore,
  redo,
  selectCharLeft,
  selectCharRight,
  selectGroupBackward,
  selectGroupForward,
  selectLineDown,
  selectLineEnd,
  selectLineStart,
  selectLineUp,
  undo,
} from "@codemirror/commands";
import { EditorSelection, type SelectionRange } from "@codemirror/state";
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
const WRAP_WIDTH = 80;

type VisualSubMode = "char" | "line" | "block";

function adjustToLinewise(view: EditorView, anchorLine: number): void {
  const sel = view.state.selection.main;
  const head = sel.head;
  const headLine = view.state.doc.lineAt(head);
  const aLine = view.state.doc.line(anchorLine);

  const from = Math.min(aLine.from, headLine.from);
  const to = Math.max(aLine.to, headLine.to);

  if (headLine.number >= anchorLine) {
    view.dispatch({ selection: EditorSelection.single(from, to) });
  } else {
    view.dispatch({ selection: EditorSelection.single(to, from) });
  }
}

function blockSelection(
  view: EditorView,
  anchorLine: number,
  anchorCol: number,
  headLine: number,
  headCol: number,
): EditorSelection {
  const doc = view.state.doc;
  const startLine = Math.min(anchorLine, headLine);
  const endLine = Math.max(anchorLine, headLine);
  const startCol = Math.min(anchorCol, headCol);
  const endCol = Math.max(anchorCol, headCol);

  const ranges: SelectionRange[] = [];
  for (let ln = startLine; ln <= endLine; ln++) {
    const line = doc.line(ln);
    const from = Math.min(line.from + startCol, line.to);
    const to = Math.min(line.from + endCol, line.to);
    ranges.push(EditorSelection.range(from, to));
  }

  return EditorSelection.create(ranges);
}

function toggleCase(text: string): string {
  let result = "";
  for (const ch of text) {
    if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
      result += ch.toLowerCase();
    } else if (ch === ch.toLowerCase() && ch !== ch.toUpperCase()) {
      result += ch.toUpperCase();
    } else {
      result += ch;
    }
  }
  return result;
}

function reflowText(text: string, width: number): string {
  const trailingNewline = text.endsWith("\n");
  const parts = text.split(/(\n{2,})/);

  const reflowParagraph = (para: string): string => {
    const indentMatch = para.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : "";
    const words = para.replace(/\n/g, " ").trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === "")) {
      return "";
    }

    const lines: string[] = [];
    let currentLine = indent + words[0];

    for (let i = 1; i < words.length; i++) {
      const candidate = currentLine + " " + words[i];
      if (candidate.length > width) {
        lines.push(currentLine);
        currentLine = indent + words[i];
      } else {
        currentLine = candidate;
      }
    }
    lines.push(currentLine);
    return lines.join("\n");
  };

  let result = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      result += reflowParagraph(parts[i]);
    } else {
      result += parts[i];
    }
  }
  if (trailingNewline && !result.endsWith("\n")) {
    result += "\n";
  }
  return result;
}

type TextTransformOp = "toggle-case" | "lowercase" | "uppercase" | "wrap-text";

type OperatorOp =
  | "delete"
  | "yank"
  | "change"
  | "indent"
  | "dedent"
  | TextTransformOp;

const textTransforms: Record<TextTransformOp, (text: string) => string> = {
  "toggle-case": toggleCase,
  lowercase: (text) => text.toLowerCase(),
  uppercase: (text) => text.toUpperCase(),
  "wrap-text": (text) => reflowText(text, WRAP_WIDTH),
};

function isTextTransform(op: string): op is TextTransformOp {
  return op in textTransforms;
}

function applyTextTransform(
  view: EditorView,
  from: number,
  to: number,
  op: TextTransformOp,
): void {
  const text = view.state.sliceDoc(from, to);
  view.dispatch({
    changes: { from, to, insert: textTransforms[op](text) },
  });
}

function applyTextTransformRanges(
  view: EditorView,
  ranges: readonly SelectionRange[],
  op: TextTransformOp,
): void {
  const transform = textTransforms[op];
  view.dispatch({
    changes: ranges.map((r) => ({
      from: r.from,
      to: r.to,
      insert: transform(view.state.sliceDoc(r.from, r.to)),
    })),
  });
}

export const defaultKeybinds: KeyBindingDef[] = [
  // -- Normal mode: motions --
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

  // -- Normal mode: insert entry --
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

  // -- Normal mode: visual entry --
  {
    mode: "normal",
    keys: "v",
    action: "editor.enter-visual",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "V",
    action: "editor.enter-visual-line",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "Ctrl+v",
    action: "editor.enter-visual-block",
    scope: "editor",
  },

  // -- Normal mode: operators --
  { mode: "normal", keys: "d", action: "editor.delete", scope: "editor" },
  { mode: "normal", keys: "y", action: "editor.yank", scope: "editor" },
  { mode: "normal", keys: "c", action: "editor.change", scope: "editor" },
  { mode: "normal", keys: ">", action: "editor.indent", scope: "editor" },
  { mode: "normal", keys: "<", action: "editor.dedent", scope: "editor" },
  {
    mode: "normal",
    keys: "g ~",
    action: "editor.toggle-case",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "g u",
    action: "editor.lowercase",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "g U",
    action: "editor.uppercase",
    scope: "editor",
  },
  {
    mode: "normal",
    keys: "g w",
    action: "editor.wrap-text",
    scope: "editor",
  },

  // -- Visual mode: motions --
  { mode: "visual", keys: "h", action: "editor.move-left", scope: "editor" },
  { mode: "visual", keys: "j", action: "editor.move-down", scope: "editor" },
  { mode: "visual", keys: "k", action: "editor.move-up", scope: "editor" },
  { mode: "visual", keys: "l", action: "editor.move-right", scope: "editor" },
  {
    mode: "visual",
    keys: "w",
    action: "editor.move-word-forward",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "b",
    action: "editor.move-word-backward",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "e",
    action: "editor.move-word-end",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "0",
    action: "editor.move-line-start",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "$",
    action: "editor.move-line-end",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "^",
    action: "editor.move-first-non-blank",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "g g",
    action: "editor.move-doc-start",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "G",
    action: "editor.move-doc-end",
    scope: "editor",
  },

  // -- Visual mode: sub-mode switching and exit --
  {
    mode: "visual",
    keys: "v",
    action: "editor.toggle-visual-char",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "V",
    action: "editor.toggle-visual-line",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "Ctrl+v",
    action: "editor.toggle-visual-block",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "Escape",
    action: "editor.exit-visual",
    scope: "editor",
  },

  // -- Visual mode: operators --
  {
    mode: "visual",
    keys: "x",
    action: "editor.visual-delete",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "d",
    action: "editor.visual-delete",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "y",
    action: "editor.visual-yank",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "c",
    action: "editor.visual-change",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: ">",
    action: "editor.visual-indent",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "<",
    action: "editor.visual-dedent",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "~",
    action: "editor.visual-toggle-case",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "u",
    action: "editor.visual-lowercase",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "U",
    action: "editor.visual-uppercase",
    scope: "editor",
  },
  {
    mode: "visual",
    keys: "g w",
    action: "editor.visual-wrap-text",
    scope: "editor",
  },

  // -- Insert mode --
  {
    mode: "insert",
    keys: "Escape",
    action: "editor.exit-insert",
    scope: "editor",
  },
  {
    mode: "insert",
    keys: "Ctrl+w",
    action: "editor.delete-word-backward",
    scope: "editor",
  },
  {
    mode: "insert",
    keys: "Ctrl+h",
    action: "editor.delete-char-backward",
    scope: "editor",
  },
  {
    mode: "insert",
    keys: "Ctrl+u",
    action: "editor.delete-to-line-start",
    scope: "editor",
  },
  {
    mode: "insert",
    keys: "Ctrl+a",
    action: "editor.move-line-start-insert",
    scope: "editor",
  },
  {
    mode: "insert",
    keys: "Ctrl+e",
    action: "editor.move-line-end-insert",
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
  const visualPushedRef = useRef(false);
  const viewRef = useRef<EditorView | null>(null);

  const visualSubModeRef = useRef<VisualSubMode | null>(null);
  const visualAnchorLineRef = useRef<number>(1);
  const blockAnchorLineRef = useRef<number>(1);
  const blockAnchorColRef = useRef<number>(0);

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
      if (visualPushedRef.current) {
        visualPushedRef.current = false;
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

  const exitVisualMode = useCallback(() => {
    const view = viewRef.current;
    if (view) {
      const head = view.state.selection.main.head;
      view.dispatch({ selection: { anchor: head } });
    }
    visualSubModeRef.current = null;
    if (visualPushedRef.current) {
      visualPushedRef.current = false;
      popMode();
    }
    cmResult.setMode("normal");
  }, [cmResult, popMode]);

  const exitVisualToInsert = useCallback(() => {
    visualSubModeRef.current = null;
    if (visualPushedRef.current) {
      visualPushedRef.current = false;
      popMode();
    }
    enterInsertMode();
  }, [enterInsertMode, popMode]);

  const enterVisualChar = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const cursor = view.state.selection.main.head;
    const line = view.state.doc.lineAt(cursor);
    const charEnd = Math.min(cursor + 1, line.to);
    view.dispatch({
      selection: EditorSelection.single(cursor, charEnd),
    });
    visualSubModeRef.current = "char";
    if (!visualPushedRef.current) {
      visualPushedRef.current = true;
      pushMode("visual");
    }
    cmResult.setMode("visual");
  }, [cmResult, pushMode]);

  const enterVisualLine = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    visualAnchorLineRef.current = line.number;
    view.dispatch({
      selection: EditorSelection.single(line.from, line.to),
    });
    visualSubModeRef.current = "line";
    if (!visualPushedRef.current) {
      visualPushedRef.current = true;
      pushMode("visual");
    }
    cmResult.setMode("visual");
  }, [cmResult, pushMode]);

  const enterVisualBlock = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    const col = head - line.from;
    blockAnchorLineRef.current = line.number;
    blockAnchorColRef.current = col;
    view.dispatch({
      selection: EditorSelection.single(head, head),
    });
    visualSubModeRef.current = "block";
    if (!visualPushedRef.current) {
      visualPushedRef.current = true;
      pushMode("visual");
    }
    cmResult.setMode("visual");
  }, [cmResult, pushMode]);

  const isBlock = useCallback(
    (): boolean => visualSubModeRef.current === "block",
    [],
  );

  const dispatchBlock = useCallback((view: EditorView, headPos: number) => {
    const headLine = view.state.doc.lineAt(headPos);
    const headCol = headPos - headLine.from;
    const sel = blockSelection(
      view,
      blockAnchorLineRef.current,
      blockAnchorColRef.current,
      headLine.number,
      headCol,
    );
    view.dispatch({ selection: sel });
  }, []);

  const visualPostMotion = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    const subMode = visualSubModeRef.current;
    if (subMode === "line") {
      adjustToLinewise(view, visualAnchorLineRef.current);
    } else if (subMode === "block") {
      const head = view.state.selection.main.head;
      const headLine = view.state.doc.lineAt(head);
      const headCol = head - headLine.from;
      const sel = blockSelection(
        view,
        blockAnchorLineRef.current,
        blockAnchorColRef.current,
        headLine.number,
        headCol,
      );
      view.dispatch({ selection: sel });
    }
  }, []);

  const isVisual = (): boolean => visualSubModeRef.current !== null;

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

  const applyOperator = useCallback(
    (op: OperatorOp, range: { from: number; to: number }) => {
      const view = viewRef.current;
      if (!view) return;

      const from = Math.min(range.from, range.to);
      const to = Math.max(range.from, range.to);
      if (from === to && op !== "indent" && op !== "dedent") return;

      switch (op) {
        case "delete":
          view.dispatch({
            changes: { from, to },
            selection: { anchor: from },
          });
          break;
        case "yank":
          void navigator.clipboard.writeText(view.state.sliceDoc(from, to));
          view.dispatch({ selection: { anchor: from } });
          break;
        case "change":
          view.dispatch({
            changes: { from, to },
            selection: { anchor: from },
          });
          enterInsertMode();
          break;
        case "indent": {
          view.dispatch({
            selection: EditorSelection.single(from, to),
          });
          indentMore(view);
          const indentLine = view.state.doc.lineAt(from);
          const indentOffset = indentLine.text.search(/\S/);
          const indentPos =
            indentOffset === -1
              ? indentLine.from
              : indentLine.from + indentOffset;
          view.dispatch({ selection: { anchor: indentPos } });
          break;
        }
        case "dedent": {
          view.dispatch({
            selection: EditorSelection.single(from, to),
          });
          indentLess(view);
          const dedentLine = view.state.doc.lineAt(from);
          const dedentOffset = dedentLine.text.search(/\S/);
          const dedentPos =
            dedentOffset === -1
              ? dedentLine.from
              : dedentLine.from + dedentOffset;
          view.dispatch({ selection: { anchor: dedentPos } });
          break;
        }
        default:
          if (isTextTransform(op)) {
            applyTextTransform(view, from, to, op);
          }
          break;
      }
    },
    [enterInsertMode],
  );

  const applyOperatorLine = useCallback(
    (op: OperatorOp, count: number | null) => {
      const view = viewRef.current;
      if (!view) return;

      const head = view.state.selection.main.head;
      const startLine = view.state.doc.lineAt(head);
      const n = count ?? 1;
      const endLineNumber = Math.min(
        startLine.number + n - 1,
        view.state.doc.lines,
      );
      const endLine = view.state.doc.line(endLineNumber);
      const from = startLine.from;
      const to = Math.min(endLine.to + 1, view.state.doc.length);
      applyOperator(op, { from, to });
    },
    [applyOperator],
  );

  const applyVisualOperator = useCallback(
    (op: OperatorOp) => {
      const view = viewRef.current;
      if (!view) return;

      const subMode = visualSubModeRef.current;
      const sel = view.state.selection;

      if (subMode === "block") {
        const ranges = sel.ranges;
        switch (op) {
          case "yank": {
            const text = ranges
              .map((r) => view.state.sliceDoc(r.from, r.to))
              .join("\n");
            void navigator.clipboard.writeText(text);
            exitVisualMode();
            return;
          }
          case "delete": {
            view.dispatch({
              changes: ranges.map((r) => ({ from: r.from, to: r.to })),
              selection: { anchor: ranges[0].from },
            });
            exitVisualMode();
            return;
          }
          case "change": {
            view.dispatch({
              changes: ranges.map((r) => ({ from: r.from, to: r.to })),
              selection: { anchor: ranges[0].from },
            });
            exitVisualToInsert();
            return;
          }
          case "indent": {
            const blockFrom = ranges[0].from;
            const blockTo = ranges[ranges.length - 1].to;
            view.dispatch({
              selection: EditorSelection.single(blockFrom, blockTo),
            });
            indentMore(view);
            const biLine = view.state.doc.lineAt(blockFrom);
            const biOff = biLine.text.search(/\S/);
            view.dispatch({
              selection: {
                anchor: biOff === -1 ? biLine.from : biLine.from + biOff,
              },
            });
            exitVisualMode();
            return;
          }
          case "dedent": {
            const blockFrom = ranges[0].from;
            const blockTo = ranges[ranges.length - 1].to;
            view.dispatch({
              selection: EditorSelection.single(blockFrom, blockTo),
            });
            indentLess(view);
            const bdLine = view.state.doc.lineAt(blockFrom);
            const bdOff = bdLine.text.search(/\S/);
            view.dispatch({
              selection: {
                anchor: bdOff === -1 ? bdLine.from : bdLine.from + bdOff,
              },
            });
            exitVisualMode();
            return;
          }
          default:
            if (isTextTransform(op)) {
              applyTextTransformRanges(view, ranges, op);
              exitVisualMode();
              return;
            }
            break;
        }
      }

      const main = sel.main;
      let from = Math.min(main.anchor, main.head);
      let to = Math.max(main.anchor, main.head);

      if (
        subMode === "line" &&
        (op === "delete" || op === "yank" || op === "change")
      ) {
        if (to < view.state.doc.length) {
          to += 1;
        } else if (from > 0) {
          from -= 1;
        }
      }

      switch (op) {
        case "delete":
          view.dispatch({
            changes: { from, to },
            selection: { anchor: from },
          });
          exitVisualMode();
          break;
        case "yank":
          void navigator.clipboard.writeText(view.state.sliceDoc(from, to));
          exitVisualMode();
          break;
        case "change":
          view.dispatch({
            changes: { from, to },
            selection: { anchor: from },
          });
          exitVisualToInsert();
          break;
        case "indent": {
          view.dispatch({
            selection: EditorSelection.single(from, to),
          });
          indentMore(view);
          const viLine = view.state.doc.lineAt(from);
          const viOff = viLine.text.search(/\S/);
          view.dispatch({
            selection: {
              anchor: viOff === -1 ? viLine.from : viLine.from + viOff,
            },
          });
          exitVisualMode();
          break;
        }
        case "dedent": {
          view.dispatch({
            selection: EditorSelection.single(from, to),
          });
          indentLess(view);
          const vdLine = view.state.doc.lineAt(from);
          const vdOff = vdLine.text.search(/\S/);
          view.dispatch({
            selection: {
              anchor: vdOff === -1 ? vdLine.from : vdLine.from + vdOff,
            },
          });
          exitVisualMode();
          break;
        }
        default:
          if (isTextTransform(op)) {
            applyTextTransform(view, from, to, op);
            exitVisualMode();
          }
          break;
      }
    },
    [exitVisualMode, exitVisualToInsert],
  );

  useActions(
    useMemo<readonly ActionSpec[]>(
      () => [
        // -- UI commands --
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

        // -- Motions (mode-aware: normal uses cursor*, visual uses select*) --
        {
          kind: "motion",
          id: "editor.move-left",
          label: "Move Left",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const from = head;
                  const line = view.state.doc.lineAt(head);
                  const col = head - line.from;
                  const n = count ?? 1;
                  const newCol = Math.max(0, col - n);
                  const newHead = line.from + newCol;
                  dispatchBlock(view, newHead);
                  return { from, to: newHead };
                }) ?? { from: 0, to: 0 }
              );
            }
            const cmd = isVisual() ? selectCharLeft : cursorCharLeft;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-down",
          label: "Move Down",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const from = head;
                  const line = view.state.doc.lineAt(head);
                  const col = head - line.from;
                  const n = count ?? 1;
                  const targetLineNum = Math.min(
                    view.state.doc.lines,
                    line.number + n,
                  );
                  const targetLine = view.state.doc.line(targetLineNum);
                  const newHead = Math.min(
                    targetLine.from + col,
                    targetLine.to,
                  );
                  dispatchBlock(view, newHead);
                  return { from, to: newHead };
                }) ?? { from: 0, to: 0 }
              );
            }
            const cmd = isVisual() ? selectLineDown : cursorLineDown;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-up",
          label: "Move Up",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const from = head;
                  const line = view.state.doc.lineAt(head);
                  const col = head - line.from;
                  const n = count ?? 1;
                  const targetLineNum = Math.max(1, line.number - n);
                  const targetLine = view.state.doc.line(targetLineNum);
                  const newHead = Math.min(
                    targetLine.from + col,
                    targetLine.to,
                  );
                  dispatchBlock(view, newHead);
                  return { from, to: newHead };
                }) ?? { from: 0, to: 0 }
              );
            }
            const cmd = isVisual() ? selectLineUp : cursorLineUp;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-right",
          label: "Move Right",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const from = head;
                  const line = view.state.doc.lineAt(head);
                  const col = head - line.from;
                  const n = count ?? 1;
                  const newCol = Math.min(line.to - line.from, col + n);
                  const newHead = line.from + newCol;
                  dispatchBlock(view, newHead);
                  return { from, to: newHead };
                }) ?? { from: 0, to: 0 }
              );
            }
            const cmd = isVisual() ? selectCharRight : cursorCharRight;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-word-forward",
          label: "Move Word Forward",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              const result = moveWithCommand(
                viewRef,
                count,
                cursorGroupForward,
              );
              const view = viewRef.current;
              if (view) dispatchBlock(view, view.state.selection.main.head);
              return result;
            }
            const cmd = isVisual() ? selectGroupForward : cursorGroupForward;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-word-backward",
          label: "Move Word Backward",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              const result = moveWithCommand(
                viewRef,
                count,
                cursorGroupBackward,
              );
              const view = viewRef.current;
              if (view) dispatchBlock(view, view.state.selection.main.head);
              return result;
            }
            const cmd = isVisual() ? selectGroupBackward : cursorGroupBackward;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-word-end",
          label: "Move Word End",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              const result = moveToWordEnd(viewRef, count, false);
              const view = viewRef.current;
              if (view) dispatchBlock(view, view.state.selection.main.head);
              return result;
            }
            const result = moveToWordEnd(viewRef, count, isVisual());
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-line-start",
          label: "Move Line Start",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const line = view.state.doc.lineAt(head);
                  dispatchBlock(view, line.from);
                  return { from: head, to: line.from };
                }) ?? { from: 0, to: 0 }
              );
            }
            const cmd = isVisual() ? selectLineStart : cursorLineStart;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-line-end",
          label: "Move Line End",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const line = view.state.doc.lineAt(head);
                  dispatchBlock(view, line.to);
                  return { from: head, to: line.to };
                }) ?? { from: 0, to: 0 }
              );
            }
            const cmd = isVisual() ? selectLineEnd : cursorLineEnd;
            const result = moveWithCommand(viewRef, count, cmd);
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-first-non-blank",
          label: "Move First Non-Blank",
          headerDisplay: "palette-only",
          range: () => {
            if (isBlock()) {
              return (
                withView(viewRef, (view) => {
                  const head = view.state.selection.main.head;
                  const line = view.state.doc.lineAt(head);
                  const offset = line.text.search(/\S/);
                  const newHead =
                    offset === -1 ? line.from : line.from + offset;
                  dispatchBlock(view, newHead);
                  return { from: head, to: newHead };
                }) ?? { from: 0, to: 0 }
              );
            }
            const result = moveToFirstNonBlank(viewRef, isVisual());
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-doc-start",
          label: "Move Document Start",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              const result = moveDocBoundary(viewRef, count, "start", false);
              const view = viewRef.current;
              if (view) dispatchBlock(view, view.state.selection.main.head);
              return result;
            }
            const result = moveDocBoundary(viewRef, count, "start", isVisual());
            if (isVisual()) visualPostMotion();
            return result;
          },
        },
        {
          kind: "motion",
          id: "editor.move-doc-end",
          label: "Move Document End",
          headerDisplay: "palette-only",
          range: (count) => {
            if (isBlock()) {
              const result = moveDocBoundary(viewRef, count, "end", false);
              const view = viewRef.current;
              if (view) dispatchBlock(view, view.state.selection.main.head);
              return result;
            }
            const result = moveDocBoundary(viewRef, count, "end", isVisual());
            if (isVisual()) visualPostMotion();
            return result;
          },
        },

        // -- Insert mode entry/exit --
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

        // -- Insert mode Ctrl bindings --
        {
          kind: "command",
          id: "editor.delete-word-backward",
          label: "Delete Word Backward",
          headerDisplay: "palette-only",
          onSelect: () => {
            withView(viewRef, (view) => {
              deleteGroupBackward(view);
            });
          },
        },
        {
          kind: "command",
          id: "editor.delete-char-backward",
          label: "Delete Char Backward",
          headerDisplay: "palette-only",
          onSelect: () => {
            withView(viewRef, (view) => {
              deleteCharBackward(view);
            });
          },
        },
        {
          kind: "command",
          id: "editor.delete-to-line-start",
          label: "Delete to Line Start",
          headerDisplay: "palette-only",
          onSelect: () => {
            withView(viewRef, (view) => {
              deleteToLineStart(view);
            });
          },
        },
        {
          kind: "command",
          id: "editor.move-line-start-insert",
          label: "Move to Line Start",
          headerDisplay: "palette-only",
          onSelect: () => {
            withView(viewRef, (view) => {
              cursorLineStart(view);
            });
          },
        },
        {
          kind: "command",
          id: "editor.move-line-end-insert",
          label: "Move to Line End",
          headerDisplay: "palette-only",
          onSelect: () => {
            withView(viewRef, (view) => {
              cursorLineEnd(view);
            });
          },
        },

        // -- Visual mode entry --
        {
          kind: "command",
          id: "editor.enter-visual",
          label: "Enter Visual Mode",
          headerDisplay: "palette-only",
          onSelect: () => {
            enterVisualChar();
          },
        },
        {
          kind: "command",
          id: "editor.enter-visual-line",
          label: "Enter Visual Line Mode",
          headerDisplay: "palette-only",
          onSelect: () => {
            enterVisualLine();
          },
        },
        {
          kind: "command",
          id: "editor.enter-visual-block",
          label: "Enter Visual Block Mode",
          headerDisplay: "palette-only",
          onSelect: () => {
            enterVisualBlock();
          },
        },
        {
          kind: "command",
          id: "editor.toggle-visual-char",
          label: "Toggle Visual Char",
          headerDisplay: "palette-only",
          onSelect: () => {
            if (visualSubModeRef.current === "char") {
              exitVisualMode();
            } else {
              const view = viewRef.current;
              if (!view) return;
              const sel = view.state.selection.main;
              view.dispatch({
                selection: EditorSelection.single(sel.anchor, sel.head),
              });
              visualSubModeRef.current = "char";
            }
          },
        },
        {
          kind: "command",
          id: "editor.toggle-visual-line",
          label: "Toggle Visual Line",
          headerDisplay: "palette-only",
          onSelect: () => {
            if (visualSubModeRef.current === "line") {
              exitVisualMode();
            } else {
              const view = viewRef.current;
              if (!view) return;
              const sel = view.state.selection.main;
              const anchorLine = view.state.doc.lineAt(sel.anchor);
              visualAnchorLineRef.current = anchorLine.number;
              visualSubModeRef.current = "line";
              adjustToLinewise(view, anchorLine.number);
            }
          },
        },
        {
          kind: "command",
          id: "editor.toggle-visual-block",
          label: "Toggle Visual Block",
          headerDisplay: "palette-only",
          onSelect: () => {
            if (visualSubModeRef.current === "block") {
              exitVisualMode();
            } else {
              const view = viewRef.current;
              if (!view) return;
              const sel = view.state.selection.main;
              const anchorLine = view.state.doc.lineAt(sel.anchor);
              const anchorCol = sel.anchor - anchorLine.from;
              blockAnchorLineRef.current = anchorLine.number;
              blockAnchorColRef.current = anchorCol;
              const headLine = view.state.doc.lineAt(sel.head);
              const headCol = sel.head - headLine.from;
              visualSubModeRef.current = "block";
              view.dispatch({
                selection: blockSelection(
                  view,
                  anchorLine.number,
                  anchorCol,
                  headLine.number,
                  headCol,
                ),
              });
            }
          },
        },
        {
          kind: "command",
          id: "editor.exit-visual",
          label: "Exit Visual Mode",
          headerDisplay: "palette-only",
          onSelect: () => {
            exitVisualMode();
          },
        },

        // -- Normal mode operators --
        {
          kind: "operator",
          id: "editor.delete",
          label: "Delete",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("delete", range),
          applyLine: (count) => applyOperatorLine("delete", count),
        },
        {
          kind: "operator",
          id: "editor.yank",
          label: "Yank",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("yank", range),
          applyLine: (count) => applyOperatorLine("yank", count),
        },
        {
          kind: "operator",
          id: "editor.change",
          label: "Change",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("change", range),
          applyLine: (count) => applyOperatorLine("change", count),
        },
        {
          kind: "operator",
          id: "editor.indent",
          label: "Indent",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("indent", range),
          applyLine: (count) => applyOperatorLine("indent", count),
        },
        {
          kind: "operator",
          id: "editor.dedent",
          label: "Dedent",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("dedent", range),
          applyLine: (count) => applyOperatorLine("dedent", count),
        },
        {
          kind: "operator",
          id: "editor.toggle-case",
          label: "Toggle Case",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("toggle-case", range),
          applyLine: (count) => applyOperatorLine("toggle-case", count),
        },
        {
          kind: "operator",
          id: "editor.lowercase",
          label: "Lowercase",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("lowercase", range),
          applyLine: (count) => applyOperatorLine("lowercase", count),
        },
        {
          kind: "operator",
          id: "editor.uppercase",
          label: "Uppercase",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("uppercase", range),
          applyLine: (count) => applyOperatorLine("uppercase", count),
        },
        {
          kind: "operator",
          id: "editor.wrap-text",
          label: "Wrap Text",
          headerDisplay: "palette-only",
          apply: (range) => applyOperator("wrap-text", range),
          applyLine: (count) => applyOperatorLine("wrap-text", count),
        },

        // -- Visual mode operators (as commands) --
        {
          kind: "command",
          id: "editor.visual-delete",
          label: "Delete Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("delete"),
        },
        {
          kind: "command",
          id: "editor.visual-yank",
          label: "Yank Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("yank"),
        },
        {
          kind: "command",
          id: "editor.visual-change",
          label: "Change Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("change"),
        },
        {
          kind: "command",
          id: "editor.visual-indent",
          label: "Indent Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("indent"),
        },
        {
          kind: "command",
          id: "editor.visual-dedent",
          label: "Dedent Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("dedent"),
        },
        {
          kind: "command",
          id: "editor.visual-toggle-case",
          label: "Toggle Case Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("toggle-case"),
        },
        {
          kind: "command",
          id: "editor.visual-lowercase",
          label: "Lowercase Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("lowercase"),
        },
        {
          kind: "command",
          id: "editor.visual-uppercase",
          label: "Uppercase Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("uppercase"),
        },
        {
          kind: "command",
          id: "editor.visual-wrap-text",
          label: "Wrap Text Selection",
          headerDisplay: "palette-only",
          onSelect: () => applyVisualOperator("wrap-text"),
        },
      ],
      [
        applyOperator,
        applyOperatorLine,
        applyVisualOperator,
        cmResult,
        dispatchBlock,
        enterInsertMode,
        enterVisualBlock,
        enterVisualChar,
        enterVisualLine,
        exitInsertMode,
        exitVisualMode,
        handleCopy,
        handleQuit,
        handleSave,
        handleSaveAndQuit,
        isBlock,
        visualPostMotion,
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
