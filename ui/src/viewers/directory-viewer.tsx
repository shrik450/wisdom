import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useActions } from "../actions/action-registry";
import { useDirectoryListing } from "../hooks/use-fs";
import { useWorkspaceRefreshToken } from "../hooks/use-workspace-mutated";
import { buildWorkspaceHref, joinWorkspacePath } from "../path-utils";
import { type DirEntry } from "../api/types";
import { type ViewerProps, type ViewerRoute } from "./registry";

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

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function DirectoryViewer({ path, entry }: ViewerProps) {
  const refreshToken = useWorkspaceRefreshToken();
  const { data, loading, error } = useDirectoryListing(path, refreshToken);
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(0);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const entries = useMemo(() => sortEntries(data ?? []), [data]);

  useEffect(() => {
    setSelected(0);
  }, [path]);

  useEffect(() => {
    const row = rowRefs.current.get(selected);
    row?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const clampIndex = useCallback(
    (index: number) => Math.max(0, Math.min(index, entries.length - 1)),
    [entries.length],
  );

  const moveDown = useCallback(
    (count: number | null) => {
      setSelected((i) => clampIndex(i + (count ?? 1)));
    },
    [clampIndex],
  );

  const moveUp = useCallback(
    (count: number | null) => {
      setSelected((i) => clampIndex(i - (count ?? 1)));
    },
    [clampIndex],
  );

  const jumpFirst = useCallback(
    (count: number | null) => {
      setSelected(count !== null ? clampIndex(count - 1) : 0);
    },
    [clampIndex],
  );

  const jumpLast = useCallback(
    (count: number | null) => {
      setSelected(
        count !== null ? clampIndex(count - 1) : clampIndex(Infinity),
      );
    },
    [clampIndex],
  );

  const openSelected = useCallback(
    (count: number | null) => {
      void count;
      const target = entries[selected];
      if (!target) return;
      navigate(buildWorkspaceHref(joinWorkspacePath(path, target.name)));
    },
    [entries, selected, navigate, path],
  );

  const goParent = useCallback(
    (count: number | null) => {
      void count;
      navigate(buildWorkspaceHref(entry.parentPath));
    },
    [navigate, entry.parentPath],
  );

  useActions(
    useMemo(
      () => [
        {
          kind: "command",
          id: "dir.move-down",
          label: "Next Entry",
          onSelect: moveDown,
          headerDisplay: "palette-only" as const,
        },
        {
          kind: "command",
          id: "dir.move-up",
          label: "Previous Entry",
          onSelect: moveUp,
          headerDisplay: "palette-only" as const,
        },
        {
          kind: "command",
          id: "dir.open",
          label: "Open Entry",
          onSelect: openSelected,
          headerDisplay: "palette-only" as const,
        },
        {
          kind: "command",
          id: "dir.parent",
          label: "Go to Parent",
          onSelect: goParent,
          headerDisplay: "palette-only" as const,
        },
        {
          kind: "command",
          id: "dir.first",
          label: "Jump to First",
          onSelect: jumpFirst,
          headerDisplay: "palette-only" as const,
        },
        {
          kind: "command",
          id: "dir.last",
          label: "Jump to Last",
          onSelect: jumpLast,
          headerDisplay: "palette-only" as const,
        },
      ],
      [moveDown, moveUp, openSelected, goParent, jumpFirst, jumpLast],
    ),
  );

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading...</p>;
  }

  if (error) {
    return (
      <p className="p-6 text-sm text-txt-muted">
        Failed to load directory contents.
      </p>
    );
  }

  if (entries.length === 0) {
    return <p className="p-6 text-sm text-txt-muted">Empty directory.</p>;
  }

  return (
    <div className="p-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bdr text-left text-txt-muted">
            <th className="pb-2 font-medium">Name</th>
            <th className="pb-2 pr-4 text-right font-medium">Size</th>
            <th className="pb-2 font-medium">Modified</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((dirEntry, index) => {
            const href = buildWorkspaceHref(
              joinWorkspacePath(path, dirEntry.name),
            );
            const isSelected = index === selected;
            return (
              <tr
                key={dirEntry.name}
                ref={(el) => {
                  if (el) {
                    rowRefs.current.set(index, el);
                  } else {
                    rowRefs.current.delete(index);
                  }
                }}
                className={`border-b border-bdr/50 ${isSelected ? "bg-surface-raised" : ""}`}
                onClick={() => setSelected(index)}
              >
                <td className="py-2 pr-4">
                  <Link
                    to={href}
                    className="text-txt transition-colors hover:text-accent"
                  >
                    {dirEntry.name}
                    {dirEntry.isDir ? "/" : ""}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-right text-txt-muted tabular-nums">
                  {dirEntry.isDir ? "\u2014" : formatSize(dirEntry.size)}
                </td>
                <td className="py-2 text-txt-muted">
                  {formatDate(dirEntry.modTime)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const directoryViewerRoute: ViewerRoute = {
  name: "Directory",
  match: (entry) => entry.kind === "directory",
  priority: 0,
  component: DirectoryViewer,
};
