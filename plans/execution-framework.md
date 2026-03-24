# Execution Framework

Wisdom should center execution around the Run — a concrete execution record —
not around a named runner registry.

- execution engine = how a process is started, streamed, cancelled, and recorded
- trigger systems = why and when a run happens
- run = one actual execution instance

This keeps the core model aligned with Wisdom as it exists today: a filesystem-
first tool where executable files are already real workspace entities.

## Why Run-Centered

### The Real Shared Primitive Is The Run

What Wisdom needs, regardless of future automation features, is a first-class
execution record.

A run captures:

- command or workspace path
- args
- cwd
- trigger: a string identifying why the run happened (`manual`, `watch`,
  `schedule`). For v1 this is a plain string. It can become a structured object
  with trigger-specific metadata (which watch, which file event) later.
- status
- started/finished timestamps
- exit code
- output: a single interleaved stream of stdout and stderr, like a terminal.
  Two separate channels add API and UI complexity for little benefit at this
  stage.

That is the durable product surface. It supports manual execution immediately,
and it gives future watches and schedules somewhere to plug in.

### Reuse Does Not Justify A Registry

The overlap where the same executable needs to be triggered by a watch, a
schedule, and manually with identical configuration is the exception. Common
cases look more like:

- a watch firing `scripts/on-new-article.sh` with a changed path argument
- a schedule firing `scripts/daily-journal.sh`
- a user manually running `scripts/rebuild-index.py`

Those are different execution requests. The duplication, when it exists, is a
single path — not a complex config block worth deduplicating through a registry.

### History And Logs Work Without Named Runners

Useful history queries work with a run-centered model. A Run already has the
command path, so grouping by command is straightforward:

"show me every run of `scripts/daily-journal.sh`."

The UI and API can support filtering and grouping without a separate named
abstraction.

### The UI Can Use The Filesystem Directly

Wisdom already understands the workspace as a browsable filesystem. Executable
files are already discoverable through the system's main source of truth. The
UI can add a "Run" action to any executable file without requiring the user to
register it somewhere first.

### It Avoids Speculative Architecture

Watches and schedules do not exist yet. Building a central named abstraction to
unify future systems that haven't been designed yet risks overengineering. The
safer path:

- build execution as a primitive now
- build watches and schedules later on top of that primitive
- add a shared config layer only if real pain shows it is necessary

## Execution Engine Decisions

### Output Capture

The engine captures a single interleaved stream of stdout and stderr. This is
simpler to implement, simpler to stream over HTTP, and matches what users expect
from a terminal-like log view. If structured output becomes necessary (e.g.,
separating stderr for error highlighting), it can be added as an enhancement
without changing the Run model.

### Concurrency

No concurrency limit for v1. Any number of runs can be active simultaneously.
If this causes resource problems in practice, a global or per-command semaphore
can be added later. The execution engine should not need a concurrency policy
baked into its design — that is a concern for trigger systems (e.g., a watch
might want "skip if already running" or "queue").

### Cancellation

Cancellation sends SIGTERM. If the process does not exit within a reasonable
grace period (e.g., 5 seconds), it sends SIGKILL. The Run record reflects the
final state (killed, exit code).

### Timeouts

No default timeout for v1. Scripts run until they complete or are cancelled.
Trigger systems can impose their own timeouts when they are built (e.g., a
schedule might want a 10-minute cap). The execution engine accepts an optional
timeout but does not require one.

## Recommended Model

The core architecture:

- **Run**: the execution record
- **Execution engine**: starts processes, captures interleaved output, supports
  cancellation, updates run state
- **API**: starts runs, lists runs, shows details, streams output, kills active
  runs
- **UI**: lets users run executable workspace files and inspect past or active
  runs

Future trigger systems remain thin:

- watch = filesystem-triggered producer of execution requests
- schedule = time-triggered producer of execution requests

Both call the same execution engine. Neither requires the engine to know about
a runner registry.

A named runner layer (reusable invocation presets with stable names and
descriptions) may become useful later if users develop repeated cases where the
same command is triggered from multiple places with identical configuration. If
that happens, it can be added on top of the execution engine without changing
the foundation.
