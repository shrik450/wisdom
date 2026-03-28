import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useActions } from "../actions/action-registry";
import { createRun } from "../api/runs";
import { useWorkspaceEntryInfo } from "../hooks/use-workspace-entry-info";
import { useWorkspaceMutated } from "../hooks/use-workspace-mutated";
import { useKeyboardNavContext } from "../keyboard/keyboard-nav";
import { buildWorkspaceHref } from "../path-utils";
import { canRunWorkspaceEntry } from "../runs";
import { resolveAllViewers, resolveViewer } from "../viewers/registry";
import type { ActionSpec } from "../actions/action-registry";

export function WorkspaceView() {
  const { path, data: entry, loading, error } = useWorkspaceEntryInfo();
  const { setViewerScope } = useKeyboardNavContext();
  const notifyMutated = useWorkspaceMutated();
  const [, navigate] = useLocation();
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
  const activeViewerScope = activeViewer?.scope ?? null;

  useEffect(() => {
    setViewerScope(activeViewerScope);
    return () => setViewerScope(null);
  }, [activeViewerScope, setViewerScope]);

  const viewerActions: ActionSpec[] = useMemo(() => {
    if (allViewers.length < 2) return [];
    return allViewers
      .filter((route) => route.component !== activeViewer?.component)
      .map((route) => ({
        kind: "command",
        id: `shell.view-as.${route.name}`,
        label: `View as ${route.name}`,
        onSelect: (count: number | null) => {
          void count;
          setViewerOverride(route.name);
        },
        priority: -50,
        headerDisplay: "overflow",
      }));
  }, [allViewers, activeViewer]);

  const runActions = useMemo<readonly ActionSpec[]>(() => {
    if (!entry) {
      return [];
    }

    const actions: ActionSpec[] = [
      {
        kind: "command",
        id: "runs.open-history",
        label: "Open Run History",
        onSelect: (count: number | null) => {
          void count;
          navigate(buildWorkspaceHref(".wisdom/runs"));
        },
        headerDisplay: "overflow",
        priority: -20,
      },
    ];

    if (canRunWorkspaceEntry(entry, path)) {
      actions.unshift({
        kind: "command",
        id: "runs.start",
        label: "Run",
        onSelect: (count: number | null) => {
          void count;
          void createRun({ path }).then((result) => {
            notifyMutated();
            navigate(buildWorkspaceHref(result.path));
          });
        },
        headerDisplay: "inline",
        priority: 70,
      });
    }

    return actions;
  }, [entry, navigate, notifyMutated, path]);

  useActions([...viewerActions, ...runActions]);

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
