import { useCallback, useMemo } from "react";
import { useActions, type ActionSpec } from "../actions/action-registry";
import { useFileContent } from "../hooks/use-fs";
import { isLikelyTextFallback, isTextContentType } from "../content-type-utils";
import type { KeyBindingDef } from "../keyboard/keybind-state-machine";
import { type ViewerProps, type ViewerRoute } from "./registry";

function PlainTextViewer({ path }: ViewerProps) {
  const { data, loading, error } = useFileContent(path);

  const copyContent = useCallback(
    (count: number | null) => {
      void count;
      if (data) {
        void navigator.clipboard.writeText(data);
      }
    },
    [data],
  );

  useActions(
    useMemo<readonly ActionSpec[]>(
      () => [
        {
          kind: "command",
          id: "text.copy",
          label: "Copy File Content",
          onSelect: copyContent,
          headerDisplay: "palette-only",
        },
      ],
      [copyContent],
    ),
  );

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading...</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-txt-muted">Failed to load file.</p>;
  }

  return (
    <pre className="overflow-auto p-6 font-mono text-sm leading-relaxed text-txt">
      {data}
    </pre>
  );
}

export const defaultKeybinds: KeyBindingDef[] = [
  { mode: "normal", keys: "y", action: "text.copy", scope: "plain-text" },
];

// The editor viewer matches the same predicates at higher priority, so this
// route only activates when explicitly selected via "View as".
export const plainTextViewerRoute: ViewerRoute = {
  name: "Plain Text",
  scope: "plain-text",
  match: (entry) =>
    entry.kind === "file" &&
    (isTextContentType(entry.contentType) ||
      isLikelyTextFallback(entry.contentType, entry.extension)),
  priority: 0,
  component: PlainTextViewer,
};
