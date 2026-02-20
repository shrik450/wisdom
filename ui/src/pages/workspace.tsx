import { useWorkspaceEntryInfo } from "../hooks/use-workspace-entry-info";
import { resolveViewer } from "../viewers/registry";

export function WorkspaceView() {
  const { path, data: entry, loading, error } = useWorkspaceEntryInfo();

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading...</p>;
  }

  if (error || !entry) {
    return (
      <p className="p-6 text-sm text-txt-muted">Failed to load entry info.</p>
    );
  }

  const route = resolveViewer(entry);

  if (!route) {
    return <p className="p-6 text-sm text-txt-muted">No viewer available.</p>;
  }

  // key={path} forces React to remount when navigating between paths that
  // resolve to the same viewer component, preventing stale state bleed.
  const ViewerComponent = route.component;
  return <ViewerComponent key={path} path={path} entry={entry} />;
}
