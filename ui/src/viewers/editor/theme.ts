import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

export const wisdomEditorTheme = EditorView.theme({
  "&": {
    color: "var(--txt)",
    backgroundColor: "var(--bg)",
    height: "100%",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: "0.875rem",
    lineHeight: "1.625",
  },
  ".cm-content": {
    caretColor: "var(--accent)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--surface)",
    color: "var(--txt-muted)",
    borderRight: "1px solid var(--bdr)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--surface-raised)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--surface-raised)",
  },
  "&.cm-focused .cm-cursor": {
    borderLeftColor: "var(--accent)",
  },
  ".cm-selectionBackground": {
    backgroundColor: "var(--highlight) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--highlight) !important",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--highlight)",
    outline: "1px solid var(--accent)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-text)",
  },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--bdr)",
    color: "var(--txt-muted)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--bdr)",
    color: "var(--txt)",
  },
  ".cm-panels": {
    backgroundColor: "var(--surface)",
    color: "var(--txt)",
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid var(--bdr)",
  },
});

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#9c6c2f" },
  {
    tag: [tags.name, tags.deleted, tags.character, tags.macroName],
    color: "#7d5a32",
  },
  { tag: [tags.propertyName], color: "#875f39" },
  {
    tag: [
      tags.processingInstruction,
      tags.string,
      tags.inserted,
      tags.special(tags.string),
    ],
    color: "#3f7a54",
  },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "#6c5ba7" },
  {
    tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
    color: "#2f7a89",
  },
  { tag: [tags.definition(tags.name), tags.separator], color: "#7a4c6d" },
  { tag: [tags.className], color: "#7d5a32" },
  {
    tag: [
      tags.number,
      tags.changed,
      tags.annotation,
      tags.modifier,
      tags.self,
      tags.namespace,
    ],
    color: "#8a6042",
  },
  { tag: [tags.typeName], color: "#5f6fa8" },
  { tag: [tags.operator, tags.operatorKeyword], color: "#8b6f52" },
  { tag: [tags.url, tags.escape, tags.regexp, tags.link], color: "#2f7a89" },
  { tag: [tags.meta, tags.comment], color: "#8b7d68", fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "bold" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.heading, color: "#9c6c2f", fontWeight: "bold" },
  { tag: tags.atom, color: "#2f7a89" },
  { tag: tags.bool, color: "#8a6042" },
  { tag: tags.invalid, color: "#c0392b" },
]);

export const wisdomHighlightStyle = syntaxHighlighting(highlight);

export const blockCursorTheme = EditorView.theme({
  ".cm-cursor": {
    borderLeft: "none",
    borderRight: "none",
    width: "0.6em",
    backgroundColor: "var(--accent)",
    opacity: "0.7",
  },
});
