# Wisdom Architecture 

Wisdom is split into three main components:

1. The Go backend server, which hosts the workspace and allows for interactions
   with it.
2. A React SPA that is served by the Go backend and is the main user interface
   for the workspace. The source code for the SPA is stored in the workspace
   and completely user editable.
3. Custom user-written files, which may include runnable code and binaries.

## Backend

The backend server is written in Go and has the following responsibilities:

1. It exposes an HTTP API-based file server over the workspace
2. It watches the workspace for file system events and runs watches configured
   in `watches.toml` in the workspace root.
3. It runs the crontab system, which is configured by `schedules.toml` in the
   workspace root.
4. It runs the indexing system, exposes HTTP APIs for searching, and is
   configured by `indexing.toml` in the root.
5. It provides the runner system via HTTP APIs, and exposes runs and logs via
   the API as well.
6. Finally, it serves the ui stored in the `ui` folder via the `ui/index.html`,
   and has esbuild as a dependency to watch and build on any changes in the
   `ui` directory.

### Workspace Boundary

The `internal/workspace` package treats the workspace root as the filesystem
boundary for normal operations. Paths are resolved and validated to stay inside
that root before file operations are run.

There is one intentional exception: `Workspace.WriteStream` stages uploads in a
system temporary file outside the workspace, then renames the fully written
file into the workspace destination.

This exception exists so the destination path is not touched until the upload
is complete, which avoids partial files in the workspace on write failures.
Only this temporary staging file is created outside the workspace, and it is
removed on failure or after a successful rename.

## Frontend

The frontend is currently a TypeScript React SPA, but the exact framework can
change. It has the following responsibilities and architecture constraints:

1. It provides primarily a web UI for the application.
2. It uses tailwind with the `@tailwindcss/browser` script for dynamic tailwind
   loading.
3. It is built via esbuild by the backend and served as JS. Therefore, all
   dependencies are vendored in a `vendor` directory.
4. Users can customize the UI, including viewers, as they please by editing the
   code live.

## Custom User Written files

Aside from the users notes and books and other such content, the user can also
write their own code or bring runnable binaries to the workspace to wire up to
wisdom. As mentioned above, there are several integration points:

1. Watches via `watches.toml`
2. Crons via `schedules.toml`
3. Custom viewers via writing react code in the `ui/` directory.
