import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "wouter";
import {
  buildBreadcrumbs,
  buildWorkspaceHref,
  joinWorkspacePath,
  normalizeWorkspacePath,
} from "../path-utils";
import { createDirectory, deleteEntry, writeFile } from "../api/fs";
import { ApiError } from "../api/types";
import { useWorkspaceEntryInfo } from "../hooks/use-workspace-entry-info";
import { useWorkspaceMutated } from "../hooks/use-workspace-mutated";
import { getWorkspaceEntryInfo } from "../workspace-entry-info";
import { useActions, type ActionSpec } from "../actions/action-registry";
import {
  canDeleteWorkspaceEntry,
  deleteConfirmationMessage,
  SHELL_DELETE_ACTION_ID,
} from "./shell-delete-action";

function isValidCreatePath(path: string): boolean {
  if (path === "" || path.startsWith("/")) {
    return false;
  }
  const segments = path.split("/");
  if (segments.length === 0) {
    return false;
  }
  return segments.every((segment) => {
    return segment.length > 0 && segment !== "." && segment !== "..";
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.body || error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed";
}

export function Breadcrumbs() {
  const onWorkspaceMutated = useWorkspaceMutated();
  const [, navigate] = useLocation();
  const {
    path,
    data: entryInfo,
    loading: entryInfoLoading,
    error: entryInfoError,
  } = useWorkspaceEntryInfo();
  const breadcrumbs = buildBreadcrumbs(path);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);

  const isFileRoute = entryInfo?.kind === "file";
  const shouldReplaceCurrentCrumb =
    creating && isFileRoute && breadcrumbs.length > 0;
  const deleteEntryInfo = canDeleteWorkspaceEntry(entryInfo, path)
    ? entryInfo
    : null;
  const canDeleteCurrentEntry = deleteEntryInfo !== null;

  const basePath =
    entryInfo?.kind === "file" || entryInfo?.kind === "missing"
      ? entryInfo.parentPath
      : path;

  useEffect(() => {
    if (creating) {
      createInputRef.current?.focus();
    }
  }, [creating]);

  const closeComposer = useCallback(() => {
    if (createPending || deletePending) {
      return;
    }
    setCreating(false);
    setDraft("");
    setCreateError(null);
  }, [createPending, deletePending]);

  const openComposer = useCallback(() => {
    if (entryInfoLoading || createPending || deletePending) {
      return;
    }
    setCreateError(null);
    setDeleteError(null);
    setCreating(true);
  }, [entryInfoLoading, createPending, deletePending]);

  const submitCreate = useCallback(async () => {
    if (createPending || deletePending) {
      return;
    }

    const rawInput = draft.trim();
    const createDirectoryTarget = rawInput.endsWith("/");
    if (rawInput.startsWith("/")) {
      setCreateError("Enter a relative path");
      return;
    }
    const normalizedInput = normalizeWorkspacePath(rawInput);

    if (!isValidCreatePath(normalizedInput)) {
      setCreateError("Enter a valid relative path");
      return;
    }

    const targetPath = joinWorkspacePath(basePath, normalizedInput);
    setCreatePending(true);
    setCreateError(null);

    try {
      const existing = await getWorkspaceEntryInfo(targetPath);
      if (existing.kind === "file" || existing.kind === "directory") {
        setCreateError("Path already exists");
        return;
      }

      if (createDirectoryTarget) {
        await createDirectory(targetPath);
      } else {
        await writeFile(targetPath, "");
      }

      onWorkspaceMutated();
      setDraft("");
      setCreating(false);
      navigate(buildWorkspaceHref(targetPath));
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreatePending(false);
    }
  }, [
    basePath,
    createPending,
    deletePending,
    draft,
    navigate,
    onWorkspaceMutated,
  ]);

  const submitDelete = useCallback(async () => {
    if (!deleteEntryInfo || deletePending) {
      return;
    }

    const confirmed = window.confirm(
      deleteConfirmationMessage(deleteEntryInfo),
    );
    if (!confirmed) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);

    try {
      await deleteEntry(deleteEntryInfo.path, false);
      onWorkspaceMutated();
      navigate(buildWorkspaceHref(deleteEntryInfo.parentPath));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        onWorkspaceMutated();
        navigate(buildWorkspaceHref(deleteEntryInfo.parentPath));
        return;
      }
      setDeleteError(errorMessage(error));
    } finally {
      setDeletePending(false);
    }
  }, [deletePending, deleteEntryInfo, navigate, onWorkspaceMutated]);

  const breadcrumbActions = useMemo<ActionSpec[]>(() => {
    const actions: ActionSpec[] = [
      {
        kind: "command",
        id: "app.create",
        label: "Create",
        onSelect: (count) => {
          void count;
          openComposer();
        },
        disabled: entryInfoLoading || createPending || deletePending,
      },
    ];

    if (canDeleteCurrentEntry) {
      actions.push({
        kind: "command",
        id: SHELL_DELETE_ACTION_ID,
        label: deletePending ? "Deleting..." : "Delete",
        onSelect: (count) => {
          void count;
          void submitDelete();
        },
        headerDisplay: "overflow",
        priority: -100,
        disabled: deletePending,
      });
    }

    return actions;
  }, [
    canDeleteCurrentEntry,
    createPending,
    deletePending,
    entryInfoLoading,
    openComposer,
    submitDelete,
  ]);

  useActions(breadcrumbActions);

  const handleComposerKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submitCreate();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeComposer();
      }
    },
    [closeComposer, submitCreate],
  );

  const createInput = (
    <input
      ref={createInputRef}
      type="text"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        if (createError) {
          setCreateError(null);
        }
      }}
      onKeyDown={handleComposerKeyDown}
      placeholder="path/to/file.md or path/to/folder/"
      aria-label="Create path"
      aria-invalid={createError ? "true" : "false"}
      title={createError ?? undefined}
      className={`h-7 min-w-24 rounded border bg-surface-raised px-2 text-sm leading-none text-txt transition-colors focus-visible:border-accent focus-visible:outline-none ${
        createError ? "border-red-500" : "border-bdr"
      }`}
      disabled={createPending || deletePending}
      data-testid="breadcrumb-create-input"
    />
  );

  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      <nav
        aria-label="Breadcrumbs"
        className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden text-sm leading-none"
      >
        <Link
          to={buildWorkspaceHref("")}
          className="inline-flex h-8 shrink-0 items-center text-txt-muted transition-colors hover:text-txt"
        >
          ~
        </Link>
        {breadcrumbs.map((crumb) => {
          const isCurrentInput = shouldReplaceCurrentCrumb && crumb.isCurrent;
          return (
            <span
              key={crumb.href}
              className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden"
            >
              <span className="shrink-0 text-txt-muted">/</span>
              {isCurrentInput ? (
                createInput
              ) : crumb.isCurrent ? (
                <span className="inline-flex h-8 min-w-0 items-center truncate font-medium text-txt">
                  {crumb.name}
                </span>
              ) : (
                <Link
                  to={crumb.href}
                  className="inline-flex h-8 min-w-0 items-center truncate text-txt-muted transition-colors hover:text-txt"
                >
                  {crumb.name}
                </Link>
              )}
            </span>
          );
        })}
        {creating && !shouldReplaceCurrentCrumb && (
          <span className="flex h-8 min-w-0 shrink items-center gap-1 overflow-hidden">
            <span className="shrink-0 text-txt-muted">/</span>
            {createInput}
          </span>
        )}
      </nav>
      <button
        type="button"
        aria-label="Create"
        onClick={openComposer}
        disabled={entryInfoLoading || createPending || deletePending}
        title={entryInfoError ? "Unable to determine current path type" : "New"}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-transparent text-txt-muted transition-colors hover:border-bdr hover:bg-surface-raised hover:text-txt focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="breadcrumb-create-button"
      >
        +
      </button>
      {createError && (
        <p
          className="hidden max-w-56 truncate text-xs text-red-600 md:block"
          data-testid="breadcrumb-create-error"
        >
          {createError}
        </p>
      )}
      {deleteError && (
        <p
          className="hidden max-w-56 truncate text-xs text-red-600 md:block"
          data-testid="breadcrumb-delete-error"
        >
          {deleteError}
        </p>
      )}
    </div>
  );
}
