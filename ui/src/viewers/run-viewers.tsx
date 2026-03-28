import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useActions, type ActionSpec } from "../actions/action-registry";
import { listDir, readFile, readFileRange } from "../api/fs";
import { cancelRun } from "../api/runs";
import { ChromeButton, CHROME_BUTTON_CLASSES } from "../components/chrome-button";
import { ContentFrame } from "../components/content-frame";
import { StatusChip } from "../components/status-chip";
import {
  useWorkspaceMutated,
  useWorkspaceRefreshToken,
} from "../hooks/use-workspace-mutated";
import type { KeyBindingDef } from "../keyboard/keybind-state-machine";
import { buildWorkspaceHref } from "../path-utils";
import {
  formatRunClockLabel,
  formatDuration,
  isActiveRunStatus,
  parseRunRequestRecord,
  parseRunStateRecord,
  isRunDirectoryPath,
  isRunsDirectoryPath,
  runIDFromPath,
  runStatusGlyph,
  sortRunSummaries,
  summarizeRunDirectory,
  type RunRequestRecord,
  type RunStateRecord,
  type RunSummary,
} from "../runs";
import { type ViewerProps, type ViewerRoute } from "./registry";

const LOG_TAIL_BYTES = 64 * 1024;
const ACTIVE_REFRESH_MS = 1000;
interface AsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

type ParseJSON<T> = (value: unknown) => T;

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function usePolledJSON<T>(
  path: string,
  refreshMs: number | null,
  parse: ParseJSON<T>,
): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    readFile(path, controller.signal)
      .then((content) => {
        if (controller.signal.aborted) {
          return;
        }
        setData(parse(JSON.parse(content)));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (isAbortError(err)) {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => controller.abort();
  }, [parse, path, tick]);

  useEffect(() => {
    if (refreshMs === null) {
      return;
    }
    const interval = window.setInterval(refresh, refreshMs);
    return () => window.clearInterval(interval);
  }, [refresh, refreshMs]);

  return { data, loading, error, refresh };
}

function parseContentRangeEnd(header: string | null): number | null {
  if (!header) {
    return null;
  }
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(header);
  if (!match) {
    return null;
  }
  return Number(match[2]);
}

function useRunLog(path: string, active: boolean): AsyncResult<string> {
  const [data, setData] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const nextOffsetRef = useRef<number>(0);
  const initialLoadRef = useRef(true);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    setData("");
    setLoading(true);
    setError(null);
    nextOffsetRef.current = 0;
    initialLoadRef.current = true;
    setTick((value) => value + 1);
  }, [path]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      const response = await readFileRange(
        path,
        initialLoadRef.current
          ? { suffixLength: LOG_TAIL_BYTES }
          : { start: nextOffsetRef.current },
        controller.signal,
      );

      const nextOffset =
        parseContentRangeEnd(response.contentRange) !== null
          ? (parseContentRangeEnd(response.contentRange) ?? 0) + 1
          : nextOffsetRef.current + response.byteLength;

      if (initialLoadRef.current || response.status === 200) {
        setData(response.text);
      } else if (response.byteLength > 0) {
        setData((current) => current + response.text);
      }

      nextOffsetRef.current = nextOffset;
      initialLoadRef.current = false;
      setLoading(false);
      setError(null);
    };

    load().catch((err: unknown) => {
      if (isAbortError(err)) {
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    });

    return () => controller.abort();
  }, [path, tick]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const interval = window.setInterval(refresh, ACTIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [active, refresh]);

  return { data, loading, error, refresh };
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp).toLocaleString();
}

function RunStatusBadge({ status }: { status: RunStateRecord["status"] }) {
  return (
    <StatusChip prefix={runStatusGlyph(status)}>
      {status.replace("_", " ")}
    </StatusChip>
  );
}

function RunDirectoryViewer({ path }: ViewerProps) {
  const [, navigate] = useLocation();
  const notifyMutated = useWorkspaceMutated();
  const runID = runIDFromPath(path);
  const statePath = `${path}/state.json`;
  const requestPath = `${path}/request.json`;
  const outputPath = `${path}/output.log`;

  const request = usePolledJSON<RunRequestRecord>(
    requestPath,
    null,
    parseRunRequestRecord,
  );
  const state = usePolledJSON<RunStateRecord>(
    statePath,
    null,
    parseRunStateRecord,
  );
  const isActiveRun = state.data ? isActiveRunStatus(state.data.status) : false;
  const log = useRunLog(
    outputPath,
    isActiveRun,
  );

  useEffect(() => {
    if (!isActiveRun) {
      return;
    }
    const interval = window.setInterval(() => {
      state.refresh();
    }, ACTIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [isActiveRun, state]);

  const cancelCurrentRun = useCallback(
    async (count: number | null) => {
      void count;
      if (!runID) {
        return;
      }
      await cancelRun(runID);
      state.refresh();
      log.refresh();
      notifyMutated();
    },
    [log, notifyMutated, runID, state],
  );

  useActions(
    useMemo<readonly ActionSpec[]>(() => {
      if (!runID || !state.data || !isActiveRun) {
        return [];
      }
      return [
        {
          kind: "command",
          id: "runs.cancel",
          label: "Cancel Run",
          onSelect: (count) => {
            void cancelCurrentRun(count);
          },
          headerDisplay: "inline",
          priority: 80,
        },
      ];
    }, [cancelCurrentRun, isActiveRun, runID, state.data]),
  );

  if (request.loading || state.loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading run...</p>;
  }

  if (!request.data || !state.data || request.error || state.error) {
    return (
      <p className="p-6 text-sm text-txt-muted">
        Failed to load run artifacts.
      </p>
    );
  }

  const startedMs = state.data.startedAt
    ? Date.parse(state.data.startedAt)
    : null;
  const finishedMs = state.data.finishedAt
    ? Date.parse(state.data.finishedAt)
    : null;
  const duration =
    startedMs !== null && finishedMs !== null
      ? formatDuration(startedMs, finishedMs)
      : state.data.startedAt && isActiveRunStatus(state.data.status)
        ? formatDuration(startedMs ?? Date.now(), Date.now())
        : null;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-bdr pb-4">
        <div>
          <p className="text-sm text-txt-muted">Run</p>
          <h1 className="mt-1 text-lg font-medium text-txt">
            {request.data.path}
          </h1>
          <p className="mt-1 text-sm text-txt-muted">/{path}</p>
        </div>
        <RunStatusBadge status={state.data.status} />
      </div>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-txt-muted">Started</dt>
        <dd className="text-txt">{formatTimestamp(state.data.startedAt)}</dd>
        <dt className="text-txt-muted">Finished</dt>
        <dd className="text-txt">{formatTimestamp(state.data.finishedAt)}</dd>
        <dt className="text-txt-muted">Duration</dt>
        <dd className="text-txt">{duration ?? "-"}</dd>
        <dt className="text-txt-muted">Trigger</dt>
        <dd className="text-txt">{request.data.trigger}</dd>
        <dt className="text-txt-muted">Working dir</dt>
        <dd className="text-txt">{request.data.cwd}</dd>
        <dt className="text-txt-muted">Exit code</dt>
        <dd className="text-txt">{state.data.exitCode ?? "-"}</dd>
        <dt className="text-txt-muted">Signal</dt>
        <dd className="text-txt">{state.data.terminationSignal ?? "-"}</dd>
        <dt className="text-txt-muted">Args</dt>
        <dd className="text-txt">
          {request.data.args.length > 0 ? request.data.args.join(" ") : "-"}
        </dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3 text-sm">
        <ChromeButton onClick={() => navigate(buildWorkspaceHref(".wisdom/runs"))}>
          Open history
        </ChromeButton>
        <Link
          to={buildWorkspaceHref(`${path}/output.log`)}
          className={CHROME_BUTTON_CLASSES}
        >
          Open raw log
        </Link>
      </div>

      <div className="mt-6 border-t border-bdr pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium text-txt">Output</h2>
            <p className="mt-1 text-sm text-txt-muted">
              {state.data.status === "running"
                ? "Live polling active."
                : "Showing the latest output."}
            </p>
          </div>
        </div>
        {log.error ? (
          <p className="mt-4 text-sm text-txt-muted">
            Failed to read output.log.
          </p>
        ) : log.loading && log.data.length === 0 ? (
          <p className="mt-4 text-sm text-txt-muted">Loading log...</p>
        ) : log.data.length === 0 ? (
          <p className="mt-4 text-sm text-txt-muted">No output yet.</p>
        ) : (
          <ContentFrame className="mt-4 max-h-[32rem] overflow-auto px-3 py-2">
            <pre className="font-mono text-sm leading-relaxed text-txt">
              {log.data}
            </pre>
          </ContentFrame>
        )}
      </div>
    </div>
  );
}

function useRunsDirectory(
  path: string,
  refreshToken: number,
): AsyncResult<RunSummary[]> {
  const [data, setData] = useState<RunSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => {
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const load = async () => {
      const entries = await listDir(path, controller.signal);
      const runEntries = entries.filter((entry) => entry.isDir);
      const summaries = await Promise.all(
        runEntries.map(async (entry) => {
          const [requestContent, stateContent] = await Promise.all([
            readFile(`${path}/${entry.name}/request.json`, controller.signal),
            readFile(`${path}/${entry.name}/state.json`, controller.signal),
          ]);
          return summarizeRunDirectory(
            entry,
            parseRunRequestRecord(JSON.parse(requestContent)),
            parseRunStateRecord(JSON.parse(stateContent)),
          );
        }),
      );

      setData(sortRunSummaries(summaries));
      setLoading(false);
    };

    load().catch((err: unknown) => {
      if (isAbortError(err)) {
        return;
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    });

    return () => controller.abort();
  }, [path, refreshToken, tick]);

  useEffect(() => {
    if (
      !(data ?? []).some((summary) => isActiveRunStatus(summary.state.status))
    ) {
      return;
    }
    const interval = window.setInterval(refresh, ACTIVE_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [data, refresh]);

  return { data, loading, error, refresh };
}

function RunsDirectoryViewer({ path }: ViewerProps) {
  const refreshToken = useWorkspaceRefreshToken();
  const { data, loading, error } = useRunsDirectory(path, refreshToken);
  const [, navigate] = useLocation();
  const [selected, setSelected] = useState(0);
  const rows = useMemo(() => data ?? [], [data]);

  const openSelected = useCallback(
    (count: number | null) => {
      void count;
      const selectedRun = rows[selected];
      if (!selectedRun) {
        return;
      }
      navigate(buildWorkspaceHref(selectedRun.directoryPath));
    },
    [navigate, rows, selected],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      setSelected((current) => {
        if (rows.length === 0) {
          return 0;
        }
        return Math.max(0, Math.min(rows.length - 1, current + delta));
      });
    },
    [rows.length],
  );

  useActions(
    useMemo<readonly ActionSpec[]>(
      () => [
        {
          kind: "command",
          id: "runs.history-next",
          label: "Next Run",
          onSelect: () => moveSelection(1),
          headerDisplay: "palette-only",
        },
        {
          kind: "command",
          id: "runs.history-prev",
          label: "Previous Run",
          onSelect: () => moveSelection(-1),
          headerDisplay: "palette-only",
        },
        {
          kind: "command",
          id: "runs.history-open",
          label: "Open Run",
          onSelect: openSelected,
          headerDisplay: "palette-only",
        },
      ],
      [moveSelection, openSelected],
    ),
  );

  if (loading) {
    return <p className="p-6 text-sm text-txt-muted">Loading run history...</p>;
  }
  if (error) {
    return (
      <p className="p-6 text-sm text-txt-muted">Failed to load run history.</p>
    );
  }
  if (rows.length === 0) {
    return <p className="p-6 text-sm text-txt-muted">No runs yet.</p>;
  }

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium text-txt">Workspace runs</h1>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-bdr text-left text-txt-muted">
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Target</th>
            <th className="pb-2 font-medium">Started</th>
            <th className="pb-2 font-medium">When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((run, index) => {
            const selectedRow = index === selected;
            return (
              <tr
                key={run.id}
                className={`border-b border-bdr/50 ${selectedRow ? "bg-surface-raised" : ""}`}
                onClick={() => setSelected(index)}
              >
                <td className="py-2 pr-4 font-mono text-xs uppercase tracking-[0.12em] text-txt-muted">
                  {runStatusGlyph(run.state.status)} {run.state.status}
                </td>
                <td className="py-2 pr-4 text-txt">
                  <Link
                    to={buildWorkspaceHref(run.directoryPath)}
                    className="transition-colors hover:text-accent"
                  >
                    {run.request.path}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-txt-muted">
                  {formatTimestamp(run.state.startedAt ?? run.request.createdAt)}
                </td>
                <td className="py-2 text-txt-muted">
                  {formatRunClockLabel(run.state)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const runViewerKeybinds: KeyBindingDef[] = [
  { mode: "normal", keys: "c", action: "runs.cancel", scope: "run" },
  {
    mode: "normal",
    keys: "j",
    action: "runs.history-next",
    scope: "runs-directory",
  },
  {
    mode: "normal",
    keys: "k",
    action: "runs.history-prev",
    scope: "runs-directory",
  },
  {
    mode: "normal",
    keys: "Enter",
    action: "runs.history-open",
    scope: "runs-directory",
  },
];

export const runsDirectoryViewerRoute: ViewerRoute = {
  name: "Runs",
  scope: "runs-directory",
  match: (entry) =>
    entry.kind === "directory" && isRunsDirectoryPath(entry.path),
  priority: 120,
  component: RunsDirectoryViewer,
};

export const runDirectoryViewerRoute: ViewerRoute = {
  name: "Run",
  scope: "run",
  match: (entry) =>
    entry.kind === "directory" && isRunDirectoryPath(entry.path),
  priority: 110,
  component: RunDirectoryViewer,
};
