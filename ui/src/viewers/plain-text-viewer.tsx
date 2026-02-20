import { useFileContent } from "../hooks/use-fs";
import { registerViewer, type ViewerProps } from "./registry";

const TEXT_MIME_PREFIXES = ["text/"];

// These are structured text formats that use application/ rather than text/
// per MIME conventions, but are still human-readable and useful to display.
const TEXT_LIKE_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/toml",
  "application/yaml",
  "application/x-sh",
  "application/x-httpd-php",
  "application/graphql",
  "application/sql",
]);

function isTextContentType(contentType: string | null): boolean {
  if (!contentType) {
    return false;
  }
  for (const prefix of TEXT_MIME_PREFIXES) {
    if (contentType.startsWith(prefix)) {
      return true;
    }
  }
  return TEXT_LIKE_MIME_TYPES.has(contentType);
}

// Extensionless files get application/octet-stream from Go's content sniffing
// when the first 512 bytes look like binary. But many extensionless files
// (Makefile, Dockerfile, LICENSE) are plain text. We optimistically show them
// here; the stat viewer is the fallback if this guess is wrong.
function isLikelyTextFallback(
  contentType: string | null,
  extension: string | null,
): boolean {
  return contentType === "application/octet-stream" && extension === null;
}

function PlainTextViewer({ path }: ViewerProps) {
  const { data, loading, error } = useFileContent(path);

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading...</p>;
  }

  if (error) {
    return <p className="p-6 text-sm text-txt-muted">Failed to load file.</p>;
  }

  return (
    <pre className="overflow-auto p-6 font-mono text-sm leading-relaxed text-txt">
      {data}
    </pre>
  );
}

registerViewer({
  name: "Plain Text",
  match: (entry) =>
    entry.kind === "file" &&
    (isTextContentType(entry.contentType) ||
      isLikelyTextFallback(entry.contentType, entry.extension)),
  priority: 0,
  component: PlainTextViewer,
});
