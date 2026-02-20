import { useEffect, useMemo, useState } from "react";
import { useShellActions } from "../components/shell-actions";
import { useWorkspaceEntryInfo } from "../hooks/use-workspace-entry-info";
import { resolveAllViewers, resolveViewer } from "../viewers/registry";
import type { ShellActionSpec } from "../components/shell-actions";

export function WorkspaceView() {
  const { path, data: entry, loading, error } = useWorkspaceEntryInfo();
  const [viewerOverride, setViewerOverride] = useState<string | null>(null);

  useEffect(() => {
    setViewerOverride(null);
  }, [path]);

  const defaultViewer = useMemo(() => {
    if (!entry) return null;
    return resolveViewer(entry);
  }, [entry]);

  const allViewers = useMemo(() => {
    if (!entry) return [];
    return resolveAllViewers(entry);
  }, [entry]);

  const activeViewer =
    (viewerOverride
      ? allViewers.find((v) => v.name === viewerOverride)
      : null) ?? defaultViewer;

  const viewerActions: ShellActionSpec[] = useMemo(() => {
    if (allViewers.length < 2) return [];
    return allViewers
      .filter((route) => route.component !== activeViewer?.component)
      .map((route, index) => ({
        id: `shell.view-as.${index}`,
        label: `View as ${route.name}`,
        onSelect: () => setViewerOverride(route.name),
        priority: -50,
        overflowOnly: true,
      }));
  }, [allViewers, activeViewer]);

  useShellActions(viewerActions);

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading...</p>;
  }

  if (error || !entry) {
    return (
      <p className="p-6 text-sm text-txt-muted">Failed to load entry info.</p>
    );
  }

  if (!activeViewer) {
    return <p className="p-6 text-sm text-txt-muted">No viewer available.</p>;
  }

  const ViewerComponent = activeViewer.component;
  return (
    <ViewerComponent
      key={`${path}:${activeViewer.name}`}
      path={path}
      entry={entry}
    />
  );
}
