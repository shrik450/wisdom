import { useEffect, useState } from "react";
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
  refreshToken?: number;
}

interface FileTreeNodeProps {
  entry: DirEntry;
  basePath: string;
  autoExpandPath: string;
  activePath: string;
  onNavigate?: () => void;
  refreshToken: number;
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
  autoExpandPath,
  activePath,
  onNavigate,
  refreshToken,
}: FileTreeNodeProps) {
  const fullPath = joinWorkspacePath(basePath, entry.name);
  const normalizedFullPath = normalizeWorkspacePath(fullPath);
  const subtreeId = subtreeIdForPath(fullPath);
  const [expanded, setExpanded] = useState(() => {
    if (!entry.isDir) {
      return false;
    }
    if (autoExpandPath === "") {
      return false;
    }
    return isSameOrAncestorPath(normalizedFullPath, autoExpandPath);
  });

  useEffect(() => {
    if (!entry.isDir) {
      return;
    }
    if (autoExpandPath === "") {
      return;
    }
    if (isSameOrAncestorPath(normalizedFullPath, autoExpandPath)) {
      setExpanded(true);
    }
  }, [entry.isDir, autoExpandPath, normalizedFullPath]);

  const isActive = normalizedFullPath === activePath;

  if (!entry.isDir) {
    return (
      <li>
        <Link
          to={buildWorkspaceHref(fullPath)}
          aria-current={isActive ? "page" : undefined}
          data-active={isActive ? "true" : "false"}
          className={`block rounded px-2 py-1 text-sm transition-colors hover:bg-surface-raised hover:text-txt ${
            isActive
              ? "bg-surface-raised font-medium text-txt"
              : "text-txt-muted"
          }`}
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
        aria-current={isActive ? "page" : undefined}
        aria-controls={expanded ? subtreeId : undefined}
        data-active={isActive ? "true" : "false"}
        className={`flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-surface-raised ${
          isActive
            ? "bg-surface-raised font-medium text-txt"
            : "text-txt"
        }`}
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
          autoExpandPath={autoExpandPath}
          activePath={activePath}
          onNavigate={onNavigate}
          refreshToken={refreshToken}
        />
      )}
    </li>
  );
}

interface SubTreeProps {
  id: string;
  path: string;
  autoExpandPath: string;
  activePath: string;
  onNavigate?: () => void;
  refreshToken: number;
}

function SubTree({
  id,
  path,
  autoExpandPath,
  activePath,
  onNavigate,
  refreshToken,
}: SubTreeProps) {
  const { data, loading, error } = useDirectoryListing(path, refreshToken);

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
          autoExpandPath={autoExpandPath}
          activePath={activePath}
          onNavigate={onNavigate}
          refreshToken={refreshToken}
        />
      ))}
    </ul>
  );
}

export function SidebarNav({ onNavigate, refreshToken = 0 }: SidebarNavProps) {
  const [, params] = useRoute("/ws/*");
  const routePath = normalizeWorkspacePath(
    decodeWorkspaceRoutePath(params?.["*"] ?? ""),
  );

  const { data, loading, error } = useDirectoryListing("", refreshToken);

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
              autoExpandPath={routePath}
              activePath={routePath}
              onNavigate={onNavigate}
              refreshToken={refreshToken}
            />
          ))}
        </ul>
      )}
    </nav>
  );
}
