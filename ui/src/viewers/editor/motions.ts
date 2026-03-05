import type { RefObject } from "react";
import { cursorDocEnd, cursorDocStart } from "@codemirror/commands";
import type { EditorView } from "@codemirror/view";

export function withView(
  viewRef: RefObject<EditorView | null>,
  fn: (view: EditorView) => void,
): boolean {
  const view = viewRef.current;
  if (!view) {
    return false;
  }
  fn(view);
  return true;
}

export function moveWithCommand(
  viewRef: RefObject<EditorView | null>,
  count: number | null,
  command: (view: EditorView) => boolean,
): { from: number; to: number } {
  const view = viewRef.current;
  if (!view) {
    return { from: 0, to: 0 };
  }

  const from = view.state.selection.main.head;
  const n = count ?? 1;
  for (let i = 0; i < n; i += 1) {
    command(view);
  }
  const to = view.state.selection.main.head;
  return { from, to };
}

export function moveToFirstNonBlank(viewRef: RefObject<EditorView | null>): {
  from: number;
  to: number;
} {
  const view = viewRef.current;
  if (!view) {
    return { from: 0, to: 0 };
  }

  const from = view.state.selection.main.head;
  const line = view.state.doc.lineAt(from);
  const offset = line.text.search(/\S/);
  const to = offset === -1 ? line.from : line.from + offset;
  view.dispatch({ selection: { anchor: to } });
  return { from, to };
}

export function moveToWordEnd(
  viewRef: RefObject<EditorView | null>,
  count: number | null,
): { from: number; to: number } {
  const view = viewRef.current;
  if (!view) {
    return { from: 0, to: 0 };
  }

  const from = view.state.selection.main.head;
  let head = from;
  const doc = view.state.doc;
  const n = count ?? 1;

  for (let step = 0; step < n; step += 1) {
    while (head < doc.length && /\s/.test(doc.sliceString(head, head + 1))) {
      head += 1;
    }

    if (head >= doc.length) {
      head = doc.length;
      break;
    }

    while (head < doc.length && !/\s/.test(doc.sliceString(head, head + 1))) {
      head += 1;
    }

    if (head > 0) {
      head -= 1;
    }
  }

  view.dispatch({ selection: { anchor: head } });
  return { from, to: head };
}

export function moveDocBoundary(
  viewRef: RefObject<EditorView | null>,
  count: number | null,
  boundary: "start" | "end",
): { from: number; to: number } {
  const view = viewRef.current;
  if (!view) {
    return { from: 0, to: 0 };
  }

  const from = view.state.selection.main.head;

  if (count !== null) {
    const lineNumber = Math.max(1, Math.min(count, view.state.doc.lines));
    const line = view.state.doc.line(lineNumber);
    view.dispatch({ selection: { anchor: line.from } });
    return { from, to: line.from };
  }

  if (boundary === "start") {
    cursorDocStart(view);
  } else {
    cursorDocEnd(view);
  }
  const to = view.state.selection.main.head;
  return { from, to };
}
