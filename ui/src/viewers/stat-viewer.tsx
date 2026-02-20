import { registerViewer, type ViewerProps } from "./registry";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(httpDate: string): string {
  const date = new Date(httpDate);
  if (Number.isNaN(date.getTime())) return httpDate;
  return date.toLocaleString();
}

function StatViewer({ entry }: ViewerProps) {
  if (entry.kind === "missing") {
    return (
      <div className="p-6">
        <h1 className="text-lg font-medium text-txt">Not found</h1>
        <p className="mt-2 text-sm text-txt-muted">
          Nothing exists at <code className="text-txt">/{entry.path}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium text-txt">{entry.name || "/"}</h1>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-txt-muted">Path</dt>
        <dd className="text-txt">/{entry.path}</dd>
        <dt className="text-txt-muted">Kind</dt>
        <dd className="text-txt">{entry.kind}</dd>
        {entry.extension && (
          <>
            <dt className="text-txt-muted">Extension</dt>
            <dd className="text-txt">{entry.extension}</dd>
          </>
        )}
        {entry.contentType && (
          <>
            <dt className="text-txt-muted">Content type</dt>
            <dd className="text-txt">{entry.contentType}</dd>
          </>
        )}
        {entry.size !== null && (
          <>
            <dt className="text-txt-muted">Size</dt>
            <dd className="text-txt">{formatSize(entry.size)}</dd>
          </>
        )}
        {entry.lastModified && (
          <>
            <dt className="text-txt-muted">Last modified</dt>
            <dd className="text-txt">{formatDate(entry.lastModified)}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

// Catch-all fallback. Priority is deeply negative so any viewer that actually
// understands the content wins. Handles missing paths, unknown binary formats,
// and anything else that falls through.
registerViewer({
  name: "File Info",
  match: () => true,
  priority: -1000,
  component: StatViewer,
});
