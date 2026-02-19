import { useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { DirEntry } from "../api/types";
import { useDirectoryListing } from "../hooks/use-fs";
import {
  buildWorkspaceHref,
  decodeWorkspaceRoutePath,
  isSameOrAncestorPath,
  joinWorkspacePath,
  normalizeWorkspacePath,
} from "../path-utils";

interface SidebarNavProps {
  onNavigate?: () => void;
}

interface FileTreeNodeProps {
  entry: DirEntry;
  basePath: string;
  initialAutoExpandPath: string;
  onNavigate?: () => void;
}

function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir && !b.isDir) {
      return -1;
    }
    if (!a.isDir && b.isDir) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function subtreeIdForPath(path: string): string {
  if (path === "") {
    return "sidebar-subtree-root";
  }
  return `sidebar-subtree-${encodeURIComponent(path)}`;
}

function FileTreeNode({
  entry,
  basePath,
  initialAutoExpandPath,
  onNavigate,
}: FileTreeNodeProps) {
  const fullPath = joinWorkspacePath(basePath, entry.name);
  const subtreeId = subtreeIdForPath(fullPath);
  const [expanded, setExpanded] = useState(() => {
    if (!entry.isDir) {
      return false;
    }
    if (initialAutoExpandPath === "") {
      return false;
    }
    return isSameOrAncestorPath(fullPath, initialAutoExpandPath);
  });

  if (!entry.isDir) {
    return (
      <li>
        <Link
          to={buildWorkspaceHref(fullPath)}
          className="block rounded px-2 py-1 text-sm text-txt-muted transition-colors hover:bg-surface-raised hover:text-txt"
          onClick={onNavigate}
        >
          <span className="block truncate">{entry.name}</span>
        </Link>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-controls={expanded ? subtreeId : undefined}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm text-txt transition-colors hover:bg-surface-raised"
      >
        <span className="text-xs text-txt-muted" aria-hidden="true">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="truncate">{entry.name}</span>
      </button>
      {expanded && (
        <SubTree
          id={subtreeId}
          path={fullPath}
          initialAutoExpandPath={initialAutoExpandPath}
          onNavigate={onNavigate}
        />
      )}
    </li>
  );
}

interface SubTreeProps {
  id: string;
  path: string;
  initialAutoExpandPath: string;
  onNavigate?: () => void;
}

function SubTree({ id, path, initialAutoExpandPath, onNavigate }: SubTreeProps) {
  const { data, loading, error } = useDirectoryListing(path);

  if (loading) {
    return <p className="pl-4 py-1 text-xs text-txt-muted">Loading...</p>;
  }
  if (error) {
    return <p className="pl-4 py-1 text-xs text-txt-muted">Error loading</p>;
  }

  return (
    <ul id={id} className="pl-3">
      {sortEntries(data ?? []).map((entry) => (
        <FileTreeNode
          key={entry.name}
          entry={entry}
          basePath={path}
          initialAutoExpandPath={initialAutoExpandPath}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const [, params] = useRoute("/ws/*");
  const routePath = normalizeWorkspacePath(
    decodeWorkspaceRoutePath(params?.["*"] ?? ""),
  );
  const initialAutoExpandPathRef = useRef(routePath);

  const { data, loading, error } = useDirectoryListing("");

  return (
    <nav
      aria-label="Workspace navigation"
      data-testid="sidebar-nav"
      className="h-full overflow-y-auto px-2 py-3"
    >
      {loading && <p className="px-2 text-sm text-txt-muted">Loading...</p>}
      {error && (
        <p className="px-2 text-sm text-txt-muted">Failed to load files</p>
      )}
      {data && (
        <ul>
          {sortEntries(data).map((entry) => (
            <FileTreeNode
              key={entry.name}
              entry={entry}
              basePath=""
              initialAutoExpandPath={initialAutoExpandPathRef.current}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}
