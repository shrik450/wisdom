import { ApiError } from "./api/types";
import { buildFsApiUrl, normalizeWorkspacePath } from "./path-utils";

export type WorkspaceEntryKind = "file" | "directory" | "missing" | "unknown";

// The backend uses a vendor MIME type for directory listings so we can
// classify entries by Content-Type header alone, without body-sniffing.
const DIRLIST_CONTENT_TYPE = "application/vnd.wisdom.dirlist+json";

export interface WorkspaceEntryInfo {
  kind: WorkspaceEntryKind;
  path: string;
  name: string;
  parentPath: string;
  extension: string | null;
  contentType: string | null;
}

function pathSegments(path: string): string[] {
  return normalizeWorkspacePath(path)
    .split("/")
    .filter((segment) => segment.length > 0);
}

function parentPath(path: string): string {
  const segments = pathSegments(path);
  if (segments.length <= 1) {
    return "";
  }
  return segments.slice(0, -1).join("/");
}

function entryName(path: string): string {
  const segments = pathSegments(path);
  if (segments.length === 0) {
    return "";
  }
  return segments[segments.length - 1];
}

function fileExtension(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot >= name.length - 1) {
    return null;
  }
  return name.slice(dot + 1);
}

// Strips parameters (charset, boundary, etc.) to get the bare MIME type.
export function parseContentType(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const semicolon = header.indexOf(";");
  const raw = semicolon >= 0 ? header.slice(0, semicolon) : header;
  const trimmed = raw.trim().toLowerCase();
  return trimmed || null;
}

function buildEntry(
  path: string,
  kind: WorkspaceEntryKind,
  contentType: string | null = null,
): WorkspaceEntryInfo {
  const normalizedPath = normalizeWorkspacePath(path);
  const name = entryName(normalizedPath);
  return {
    kind,
    path: normalizedPath,
    name,
    parentPath: parentPath(normalizedPath),
    extension: kind === "file" ? fileExtension(name) : null,
    contentType,
  };
}

export async function getWorkspaceEntryInfo(
  path: string,
): Promise<WorkspaceEntryInfo> {
  const normalizedPath = normalizeWorkspacePath(path);
  const res = await fetch(buildFsApiUrl(normalizedPath));

  if (res.status === 404) {
    return buildEntry(normalizedPath, "missing");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }

  const contentType = parseContentType(res.headers.get("Content-Type"));

  if (contentType === DIRLIST_CONTENT_TYPE) {
    return buildEntry(normalizedPath, "directory");
  }
  return buildEntry(normalizedPath, "file", contentType);
}
