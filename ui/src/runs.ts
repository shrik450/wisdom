import type { DirEntry } from "./api/types";
import type { WorkspaceEntryInfo } from "./workspace-entry-info";

export type RunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "start_failed";

export interface RunRequestRecord {
  id: string;
  path: string;
  args: string[];
  cwd: string;
  trigger: string;
  createdAt: string;
}

export interface RunStateRecord {
  id: string;
  status: RunStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  exitCode: number | null;
  terminationSignal: string | null;
}

export interface RunSummary {
  id: string;
  directoryName: string;
  directoryPath: string;
  request: RunRequestRecord;
  state: RunStateRecord;
  lastModified: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`invalid run artifact: ${field} must be a string`);
  }
  return value;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, field);
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(
      `invalid run artifact: ${field} must be an array of strings`,
    );
  }
  return [...value];
}

function readNullableNumber(value: unknown, field: string): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid run artifact: ${field} must be a number or null`);
  }
  return value;
}

export function parseRunRequestRecord(value: unknown): RunRequestRecord {
  if (!isRecord(value)) {
    throw new Error("invalid run artifact: request must be an object");
  }
  return {
    id: readString(value.id, "request.id"),
    path: readString(value.path, "request.path"),
    args: readStringArray(value.args, "request.args"),
    cwd: readString(value.cwd, "request.cwd"),
    trigger: readString(value.trigger, "request.trigger"),
    createdAt: readString(value.createdAt, "request.createdAt"),
  };
}

export function parseRunStateRecord(value: unknown): RunStateRecord {
  if (!isRecord(value)) {
    throw new Error("invalid run artifact: state must be an object");
  }
  return {
    id: readString(value.id, "state.id"),
    status: readString(value.status, "state.status") as RunStatus,
    createdAt: readString(value.createdAt, "state.createdAt"),
    startedAt: readNullableString(value.startedAt, "state.startedAt"),
    finishedAt: readNullableString(value.finishedAt, "state.finishedAt"),
    exitCode: readNullableNumber(value.exitCode, "state.exitCode"),
    terminationSignal: readNullableString(
      value.terminationSignal,
      "state.terminationSignal",
    ),
  };
}

const ACTIVE_STATUSES: readonly RunStatus[] = ["pending", "running"];

function splitPath(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

export function isRunsDirectoryPath(path: string): boolean {
  const segments = splitPath(path);
  return (
    segments.length === 2 && segments[0] === ".wisdom" && segments[1] === "runs"
  );
}

export function isRunDirectoryPath(path: string): boolean {
  const segments = splitPath(path);
  return (
    segments.length === 3 &&
    segments[0] === ".wisdom" &&
    segments[1] === "runs" &&
    segments[2].length > 0
  );
}

export function runIDFromPath(path: string): string | null {
  if (!isRunDirectoryPath(path)) {
    return null;
  }
  const segments = splitPath(path);
  return segments[2] ?? null;
}

export function canRunWorkspaceEntry(
  entry: WorkspaceEntryInfo,
  routePath: string,
): boolean {
  return (
    entry.kind === "file" &&
    entry.path === routePath &&
    entry.isExecutable &&
    !entry.path.startsWith(".wisdom/")
  );
}

export function isActiveRunStatus(status: RunStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function runStatusGlyph(status: RunStatus): string {
  switch (status) {
    case "pending":
      return "...";
    case "running":
      return ">>>";
    case "succeeded":
      return "OK";
    case "failed":
      return "ERR";
    case "cancelled":
      return "X";
    case "start_failed":
      return "!";
  }
}

export function sortRunSummaries(summaries: RunSummary[]): RunSummary[] {
  return [...summaries].sort((left, right) => {
    const leftActive = isActiveRunStatus(left.state.status);
    const rightActive = isActiveRunStatus(right.state.status);
    if (leftActive !== rightActive) {
      return leftActive ? -1 : 1;
    }

    const leftTime = Date.parse(left.state.startedAt ?? left.request.createdAt);
    const rightTime = Date.parse(
      right.state.startedAt ?? right.request.createdAt,
    );
    return rightTime - leftTime;
  });
}

export function formatRelativeTime(now: number, timestamp: string): string {
  const deltaMs = Math.max(0, now - Date.parse(timestamp));
  const deltaSeconds = Math.floor(deltaMs / 1000);
  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }
  if (deltaSeconds < 3600) {
    return `${Math.floor(deltaSeconds / 60)}m ago`;
  }
  if (deltaSeconds < 86400) {
    return `${Math.floor(deltaSeconds / 3600)}h ago`;
  }
  return `${Math.floor(deltaSeconds / 86400)}d ago`;
}

export function formatRunClockLabel(
  state: RunStateRecord,
  now = Date.now(),
): string {
  if (isActiveRunStatus(state.status) && state.startedAt) {
    return `running for ${formatDuration(Date.parse(state.startedAt), now)}`;
  }
  if (state.finishedAt) {
    return formatRelativeTime(now, state.finishedAt);
  }
  return formatRelativeTime(now, state.createdAt);
}

export function formatDuration(startMs: number, endMs: number): string {
  const seconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`;
  }
  return `${Math.floor(seconds / 3600)}h`;
}

export function summarizeRunDirectory(
  entry: DirEntry,
  request: RunRequestRecord,
  state: RunStateRecord,
): RunSummary {
  return {
    id: request.id,
    directoryName: entry.name,
    directoryPath: `.wisdom/runs/${entry.name}`,
    request,
    state,
    lastModified: entry.modTime,
  };
}
