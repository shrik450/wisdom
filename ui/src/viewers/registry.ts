import { type ComponentType } from "react";
import { type WorkspaceEntryInfo } from "../workspace-entry-info";

// Viewers don't receive file content — they fetch it themselves if needed.
// This keeps the framework thin and lets viewers handle large/streaming
// formats (epub, video, audio) without the framework needing to know about them.
export interface ViewerProps {
  path: string;
  entry: WorkspaceEntryInfo;
}

// A route is the unit of registration, not a viewer. The same component can
// appear in multiple routes with different match predicates and priorities
// (e.g. a markdown viewer at high priority for journal/ paths, lower for all .md).
export interface ViewerRoute {
  name: string;
  match: (entry: WorkspaceEntryInfo) => boolean;
  priority: number;
  component: ComponentType<ViewerProps>;
}

// Module-level registry populated at app startup (see viewers/index.ts). This
// runs before React mounts, so no context/provider is needed.
const routes: ViewerRoute[] = [];

export function registerViewer(route: ViewerRoute): void {
  routes.push(route);
}

// Highest priority wins. Equal priority: first registered route wins, matching
// how routing frameworks resolve ambiguity (declaration order is the tiebreaker).
export function resolveViewer(entry: WorkspaceEntryInfo): ViewerRoute | null {
  let best: ViewerRoute | null = null;
  for (const route of routes) {
    if (!route.match(entry)) {
      continue;
    }
    if (best === null || route.priority > best.priority) {
      best = route;
    }
  }
  return best;
}

// Returns all matching viewers for a "switch viewer" UI. Deduped by component
// reference so a viewer registered via multiple routes only appears once (the
// first matching route's name/priority is kept).
export function resolveAllViewers(entry: WorkspaceEntryInfo): ViewerRoute[] {
  const seen = new Set<ComponentType<ViewerProps>>();
  const matched: ViewerRoute[] = [];

  for (const route of routes) {
    if (!route.match(entry)) {
      continue;
    }
    if (seen.has(route.component)) {
      continue;
    }
    seen.add(route.component);
    matched.push(route);
  }

  matched.sort((a, b) => b.priority - a.priority);
  return matched;
}

export function clearViewerRegistry(): void {
  routes.length = 0;
}
