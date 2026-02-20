import { Link } from "wouter";
import { useDirectoryListing } from "../hooks/use-fs";
import { useWorkspaceRefreshToken } from "../hooks/use-workspace-mutated";
import { buildWorkspaceHref, joinWorkspacePath } from "../path-utils";
import { type DirEntry } from "../api/types";
import { registerViewer, type ViewerProps } from "./registry";

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

function DirectoryViewer({ path }: ViewerProps) {
  const refreshToken = useWorkspaceRefreshToken();
  const { data, loading, error } = useDirectoryListing(path, refreshToken);

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

  const entries = sortEntries(data ?? []);

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
          {entries.map((entry) => {
            const href = buildWorkspaceHref(
              joinWorkspacePath(path, entry.name),
            );
            return (
              <tr key={entry.name} className="border-b border-bdr/50">
                <td className="py-2 pr-4">
                  <Link
                    to={href}
                    className="text-txt transition-colors hover:text-accent"
                  >
                    {entry.name}
                    {entry.isDir ? "/" : ""}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-right text-txt-muted tabular-nums">
                  {entry.isDir ? "\u2014" : formatSize(entry.size)}
                </td>
                <td className="py-2 text-txt-muted">
                  {formatDate(entry.modTime)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

registerViewer({
  name: "Directory",
  match: (entry) => entry.kind === "directory",
  priority: 0,
  component: DirectoryViewer,
});
