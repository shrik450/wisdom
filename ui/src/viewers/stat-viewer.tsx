import { registerViewer, type ViewerProps } from "./registry";

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
      </dl>
      {entry.kind === "file" && (
        <p className="mt-6 text-sm text-txt-muted">
          No specialized viewer is available for this file.
        </p>
      )}
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
