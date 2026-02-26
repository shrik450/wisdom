import { type WorkspaceEntryInfo } from "../workspace-entry-info";

const PROTECTED_DELETE_PATHS = new Set(["", "ui"]);

export const SHELL_DELETE_ACTION_ID = "shell.delete-current";

export function canDeleteWorkspaceEntry(
  entryInfo: WorkspaceEntryInfo | null,
  currentPath: string,
): entryInfo is WorkspaceEntryInfo {
  if (!entryInfo) {
    return false;
  }
  if (entryInfo.path !== currentPath) {
    return false;
  }
  if (entryInfo.kind !== "file" && entryInfo.kind !== "directory") {
    return false;
  }
  return !PROTECTED_DELETE_PATHS.has(entryInfo.path);
}

export function deleteConfirmationMessage(
  entryInfo: WorkspaceEntryInfo,
): string {
  const targetName = entryInfo.name !== "" ? entryInfo.name : entryInfo.path;
  return `Delete "${targetName}"? This cannot be undone.`;
}
