import { ApiError, DirEntry } from "./api/types";
import { buildFsApiUrl, normalizeWorkspacePath } from "./path-utils";

export type WorkspaceEntryKind = "file" | "directory" | "missing" | "unknown";

export interface WorkspaceEntryInfo {
  kind: WorkspaceEntryKind;
  path: string;
  name: string;
  parentPath: string;
  extension: string | null;
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

function buildEntry(
  path: string,
  kind: WorkspaceEntryKind,
): WorkspaceEntryInfo {
  const normalizedPath = normalizeWorkspacePath(path);
  const name = entryName(normalizedPath);
  return {
    kind,
    path: normalizedPath,
    name,
    parentPath: parentPath(normalizedPath),
    extension: kind === "file" ? fileExtension(name) : null,
  };
}

function isDirEntry(value: unknown): value is DirEntry {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<DirEntry>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.modTime === "string" &&
    typeof candidate.isDir === "boolean"
  );
}

function isDirectoryPayload(value: unknown): value is DirEntry[] {
  return Array.isArray(value) && value.every(isDirEntry);
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

  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return buildEntry(normalizedPath, "file");
  }

  if (isDirectoryPayload(parsed)) {
    return buildEntry(normalizedPath, "directory");
  }
  return buildEntry(normalizedPath, "file");
}
