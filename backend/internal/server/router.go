package server

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"wisdom/backend/internal/migrations"
)

const (
	checkStatusOK    = "ok"
	checkStatusWarn  = "warn"
	checkStatusError = "error"

	overallStatusOK       = "ok"
	overallStatusDegraded = "degraded"
	overallStatusError    = "error"
)

type RouterOptions struct {
	Logger        *slog.Logger
	DB            *sql.DB
	HTTPAddr      string
	DataDir       string
	DBPath        string
	ContentRoot   string
	MigrationsDir string
	StartupAt     time.Time
}

type diagnosticsCheck struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	CheckedAt string `json:"checked_at"`
}

type healthResponse struct {
	Status    string             `json:"status"`
	CheckedAt string             `json:"checked_at"`
	Checks    []diagnosticsCheck `json:"checks"`
	Error     *apiErrorPayload   `json:"error,omitempty"`
}

type opsStatusResponse struct {
	Status        string             `json:"status"`
	StartupAt     string             `json:"startup_at"`
	UptimeSeconds int64              `json:"uptime_seconds"`
	CheckedAt     string             `json:"checked_at"`
	Checks        []diagnosticsCheck `json:"checks"`
	Config        opsConfigSnapshot  `json:"config"`
}

type opsConfigSnapshot struct {
	HTTPAddr    string `json:"http_addr"`
	DataDir     string `json:"data_dir"`
	DBPath      string `json:"db_path"`
	ContentRoot string `json:"content_root"`
}

type apiErrorPayload struct {
	Code      string   `json:"code"`
	Message   string   `json:"message"`
	NextSteps []string `json:"next_steps,omitempty"`
}

type runtimeRouter struct {
	logger        *slog.Logger
	db            *sql.DB
	httpAddr      string
	dataDir       string
	dbPath        string
	contentRoot   string
	migrationsDir string
	startupAt     time.Time
}

type pageData struct {
	Title              string
	ActiveNav          string
	IsOperations       bool
	State              string
	Diagnostics        *opsStatusResponse
	ErrorNextSteps     []string
	PlaceholderTitle   string
	PlaceholderMessage string
}

func NewRouter(options RouterOptions) http.Handler {
	logger := options.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}

	router := &runtimeRouter{
		logger:        logger,
		db:            options.DB,
		httpAddr:      options.HTTPAddr,
		dataDir:       options.DataDir,
		dbPath:        options.DBPath,
		contentRoot:   options.ContentRoot,
		migrationsDir: options.MigrationsDir,
		startupAt:     options.StartupAt,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", router.handleRoot)
	mux.HandleFunc("GET /library", router.handleLibrary)
	mux.HandleFunc("GET /notes", router.handleNotes)
	mux.HandleFunc("GET /imports", router.handleImports)
	mux.HandleFunc("GET /operations", router.handleOperations)
	mux.HandleFunc("GET /operations/loading", router.handleOperationsLoading)
	mux.HandleFunc("GET /api/v1/ops/status", router.handleOpsStatus)
	mux.HandleFunc("GET /healthz", router.handleHealth)

	return mux
}

func (router *runtimeRouter) handleRoot(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/operations", http.StatusSeeOther)
}

func (router *runtimeRouter) handleLibrary(w http.ResponseWriter, _ *http.Request) {
	router.renderPage(w, pageData{
		Title:              "Library",
		ActiveNav:          "Library",
		PlaceholderTitle:   "Library",
		PlaceholderMessage: "Library browsing arrives in a later milestone. This placeholder is intentionally minimal for M0.",
	})
}

func (router *runtimeRouter) handleNotes(w http.ResponseWriter, _ *http.Request) {
	router.renderPage(w, pageData{
		Title:              "Notes",
		ActiveNav:          "Notes",
		PlaceholderTitle:   "Notes",
		PlaceholderMessage: "Notes creation and editing arrive in M1. This page is a transparent placeholder for M0.",
	})
}

func (router *runtimeRouter) handleImports(w http.ResponseWriter, _ *http.Request) {
	router.renderPage(w, pageData{
		Title:              "Imports",
		ActiveNav:          "Imports",
		PlaceholderTitle:   "Imports",
		PlaceholderMessage: "Import pipelines arrive in later milestones. This placeholder confirms the stable navigation contract.",
	})
}

func (router *runtimeRouter) handleOperations(w http.ResponseWriter, r *http.Request) {
	state := "empty"
	var diagnostics *opsStatusResponse

	if r.URL.Query().Get("run") == "1" {
		runtimeStatus := router.collectDiagnostics(r.Context())
		diagnostics = &runtimeStatus
		state = "success"
		if runtimeStatus.Status == overallStatusError {
			state = "error"
		}
	}

	router.renderPage(w, pageData{
		Title:          "Operations",
		ActiveNav:      "Operations",
		IsOperations:   true,
		State:          state,
		Diagnostics:    diagnostics,
		ErrorNextSteps: defaultOpsNextSteps(),
	})
}

func (router *runtimeRouter) handleOperationsLoading(w http.ResponseWriter, _ *http.Request) {
	router.renderPage(w, pageData{
		Title:          "Operations",
		ActiveNav:      "Operations",
		IsOperations:   true,
		State:          "loading",
		ErrorNextSteps: defaultOpsNextSteps(),
	})
}

func (router *runtimeRouter) handleHealth(w http.ResponseWriter, r *http.Request) {
	runtimeStatus := router.collectDiagnostics(r.Context())
	payload := healthResponse{
		Status:    runtimeStatus.Status,
		CheckedAt: runtimeStatus.CheckedAt,
		Checks:    runtimeStatus.Checks,
	}

	statusCode := http.StatusOK
	if runtimeStatus.Status == overallStatusError {
		statusCode = http.StatusServiceUnavailable
		payload.Error = &apiErrorPayload{
			Code:      "dependency_check_failed",
			Message:   "one or more runtime checks failed",
			NextSteps: defaultOpsNextSteps(),
		}
	}

	router.writeJSON(w, statusCode, payload)
}

func (router *runtimeRouter) handleOpsStatus(w http.ResponseWriter, r *http.Request) {
	runtimeStatus := router.collectDiagnostics(r.Context())
	router.writeJSON(w, http.StatusOK, runtimeStatus)
}

func (router *runtimeRouter) collectDiagnostics(ctx context.Context) opsStatusResponse {
	checkedAt := time.Now().UTC()

	checks := []diagnosticsCheck{
		router.runCheck(ctx, "database", "database reachable", func(checkCtx context.Context) error {
			if router.db == nil {
				return fmt.Errorf("database is not configured")
			}
			return router.db.PingContext(checkCtx)
		}),
		router.runCheck(ctx, "migrations", "migration state valid", func(checkCtx context.Context) error {
			if strings.TrimSpace(router.migrationsDir) == "" {
				return fmt.Errorf("migrations directory is not configured")
			}
			if router.db == nil {
				return fmt.Errorf("database is not configured")
			}
			return migrations.ValidateState(checkCtx, router.db, router.migrationsDir)
		}),
		router.runCheck(ctx, "content_root", "content root available", func(_ context.Context) error {
			return validateContentRoot(router.contentRoot)
		}),
	}

	startupAt := ""
	uptimeSeconds := int64(0)
	if !router.startupAt.IsZero() {
		startupAt = router.startupAt.UTC().Format(time.RFC3339Nano)
		uptimeSeconds = int64(time.Since(router.startupAt).Seconds())
		if uptimeSeconds < 0 {
			uptimeSeconds = 0
		}
	}

	return opsStatusResponse{
		Status:        aggregateStatus(checks),
		StartupAt:     startupAt,
		UptimeSeconds: uptimeSeconds,
		CheckedAt:     checkedAt.Format(time.RFC3339Nano),
		Checks:        checks,
		Config: opsConfigSnapshot{
			HTTPAddr:    router.httpAddr,
			DataDir:     router.dataDir,
			DBPath:      router.dbPath,
			ContentRoot: router.contentRoot,
		},
	}
}

func (router *runtimeRouter) runCheck(
	ctx context.Context,
	name string,
	successMessage string,
	checkFn func(context.Context) error,
) diagnosticsCheck {
	checkedAt := time.Now().UTC().Format(time.RFC3339Nano)
	checkCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	if err := checkFn(checkCtx); err != nil {
		router.logger.Error("operations check failed", "check", name, "error", err)
		return diagnosticsCheck{
			Name:      name,
			Status:    checkStatusError,
			Message:   err.Error(),
			CheckedAt: checkedAt,
		}
	}

	return diagnosticsCheck{
		Name:      name,
		Status:    checkStatusOK,
		Message:   successMessage,
		CheckedAt: checkedAt,
	}
}

func validateContentRoot(contentRoot string) error {
	if strings.TrimSpace(contentRoot) == "" {
		return fmt.Errorf("content root is not configured")
	}

	info, err := os.Stat(contentRoot)
	if err != nil {
		return fmt.Errorf("stat content root: %w", err)
	}

	if !info.IsDir() {
		return fmt.Errorf("content root is not a directory: %s", contentRoot)
	}

	return nil
}

func aggregateStatus(checks []diagnosticsCheck) string {
	status := overallStatusOK
	for _, check := range checks {
		if check.Status == checkStatusError {
			return overallStatusError
		}
		if check.Status == checkStatusWarn {
			status = overallStatusDegraded
		}
	}
	return status
}

func (router *runtimeRouter) writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(payload); err != nil {
		router.logger.Error("encode json response", "error", err)
	}
}

func (router *runtimeRouter) renderPage(w http.ResponseWriter, data pageData) {
	var buffer bytes.Buffer
	if err := pageTemplate.Execute(&buffer, data); err != nil {
		router.logger.Error("render html page", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if _, err := buffer.WriteTo(w); err != nil {
		router.logger.Error("write html page", "error", err)
	}
}

func defaultOpsNextSteps() []string {
	return []string{
		"review /api/v1/ops/status for detailed checks",
		"verify configured paths and migration files",
		"check server logs and restart",
	}
}

var pageTemplate = template.Must(template.New("page").Parse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wisdom - {{.Title}}</title>
  {{if and .IsOperations (eq .State "loading")}}<meta http-equiv="refresh" content="1;url=/operations?run=1">{{end}}
  <style>
    :root {
      --surface: #f2efe6;
      --surface-muted: #e6e2d6;
      --surface-card: #fbf9f2;
      --text-primary: #1d1d1a;
      --text-secondary: #4c4a42;
      --accent: #1f5f4a;
      --accent-contrast: #f9fff5;
      --border: #c7c2b1;
      --danger: #9c2f2f;
      --warning: #946200;
      --success: #1b6f52;
      --shadow: rgba(30, 32, 28, 0.12);
      --surface-overlay: rgba(251, 249, 242, 0.9);
      --radius-md: 12px;
      --radius-sm: 8px;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text-primary);
      background:
        radial-gradient(circle at top right, var(--surface-card), transparent 45%),
        linear-gradient(170deg, var(--surface), var(--surface-muted));
      font-family: "Charter", "Iowan Old Style", "Palatino Linotype", serif;
      line-height: 1.5;
    }

    a,
    button {
      min-height: 44px;
    }

    a {
      color: var(--accent);
    }

    :focus-visible {
      outline: 3px solid var(--accent);
      outline-offset: 2px;
    }

    .site-header {
      border-bottom: 1px solid var(--border);
      background: var(--surface-overlay);
      backdrop-filter: blur(4px);
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      border: 0;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
    }

    .site-header-inner,
    .layout-main {
      width: min(960px, calc(100% - 2rem));
      margin: 0 auto;
    }

    .site-header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 1rem 0;
    }

    .site-title {
      margin: 0;
      font-size: 1.2rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .site-nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .site-nav a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.55rem 0.95rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-card);
      color: var(--text-primary);
      text-decoration: none;
      font-size: 0.95rem;
    }

    .site-nav a.active {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-contrast);
    }

    .layout-main {
      padding: 1.5rem 0 2.5rem;
      display: grid;
      gap: 1rem;
    }

    .panel {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-card);
      box-shadow: 0 4px 16px var(--shadow);
      padding: 1rem;
    }

    .panel h1,
    .panel h2 {
      margin: 0 0 0.6rem;
      line-height: 1.2;
    }

    .panel p {
      margin: 0 0 0.8rem;
      color: var(--text-secondary);
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      align-items: center;
    }

    .button-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--accent-contrast);
      font: inherit;
      padding: 0.55rem 0.95rem;
      cursor: pointer;
      text-decoration: none;
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 5.5rem;
      padding: 0.25rem 0.55rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      font-size: 0.88rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .status-chip-ok {
      color: var(--success);
      border-color: var(--success);
    }

    .status-chip-warn {
      color: var(--warning);
      border-color: var(--warning);
    }

    .status-chip-error {
      color: var(--danger);
      border-color: var(--danger);
    }

    .checks-table {
      width: 100%;
      border-collapse: collapse;
    }

    .checks-table th,
    .checks-table td {
      border-top: 1px solid var(--border);
      padding: 0.6rem 0.4rem;
      text-align: left;
      vertical-align: top;
    }

    .checks-table th {
      color: var(--text-secondary);
      font-size: 0.9rem;
      font-weight: 600;
    }

    .config-list {
      margin: 0;
      display: grid;
      grid-template-columns: 11rem 1fr;
      gap: 0.45rem 0.7rem;
    }

    .config-list dt {
      font-weight: 600;
      color: var(--text-secondary);
    }

    .config-list dd {
      margin: 0;
      word-break: break-all;
    }

    .next-steps {
      margin: 0;
      padding-left: 1.1rem;
    }

    .next-steps li {
      margin: 0.35rem 0;
      color: var(--text-secondary);
    }

    @media (max-width: 720px) {
      .site-header-inner {
        flex-direction: column;
        align-items: flex-start;
      }

      .config-list {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <p class="site-title">Wisdom</p>
      <nav aria-label="Primary">
        <ul class="site-nav">
          <li><a href="/library" {{if eq .ActiveNav "Library"}}class="active"{{end}}>Library</a></li>
          <li><a href="/notes" {{if eq .ActiveNav "Notes"}}class="active"{{end}}>Notes</a></li>
          <li><a href="/imports" {{if eq .ActiveNav "Imports"}}class="active"{{end}}>Imports</a></li>
          <li><a href="/operations" {{if eq .ActiveNav "Operations"}}class="active"{{end}}>Operations</a></li>
        </ul>
      </nav>
    </div>
  </header>

  {{if .IsOperations}}
  <main id="content" class="layout-main" data-state="{{.State}}">
    <section class="panel">
      <h1>Operations Status</h1>
      <p>Run runtime checks to verify database connectivity, migration state, and content root readiness.</p>
      <div class="controls">
        <form method="get" action="/operations">
          <input type="hidden" name="run" value="1">
          <button class="button-primary" type="submit">Run diagnostics</button>
        </form>
        <a href="/api/v1/ops/status">View JSON diagnostics</a>
        <a href="/healthz">View health endpoint</a>
      </div>
    </section>

    {{if eq .State "empty"}}
    <section class="panel" aria-live="polite">
      <h2>No diagnostics run yet</h2>
      <p>Use "Run diagnostics" to fetch a fresh status snapshot.</p>
    </section>
    {{end}}

    {{if eq .State "loading"}}
    <section class="panel" aria-live="polite">
      <h2>Running diagnostics</h2>
      <p>Redirecting to the latest diagnostics results.</p>
      <p><a href="/operations?run=1">Continue without waiting</a></p>
    </section>
    {{end}}

    {{if and (or (eq .State "success") (eq .State "error")) .Diagnostics}}
    <section class="panel" aria-live="polite">
      <h2>System verdict</h2>
      <p>
        <span class="status-chip {{if eq .Diagnostics.Status "ok"}}status-chip-ok{{else if eq .Diagnostics.Status "degraded"}}status-chip-warn{{else}}status-chip-error{{end}}">{{.Diagnostics.Status}}</span>
        Checked at {{.Diagnostics.CheckedAt}}
      </p>
      <table class="checks-table">
        <caption class="sr-only">Diagnostics checks</caption>
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Status</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {{range .Diagnostics.Checks}}
          <tr>
            <td>{{.Name}}</td>
            <td>
              <span class="status-chip {{if eq .Status "ok"}}status-chip-ok{{else if eq .Status "warn"}}status-chip-warn{{else}}status-chip-error{{end}}">{{.Status}}</span>
            </td>
            <td>{{.Message}}</td>
          </tr>
          {{end}}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <h2>Runtime snapshot</h2>
      <dl class="config-list">
        <dt>Startup At</dt>
        <dd>{{.Diagnostics.StartupAt}}</dd>
        <dt>Uptime Seconds</dt>
        <dd>{{.Diagnostics.UptimeSeconds}}</dd>
        <dt>HTTP Bind</dt>
        <dd>{{.Diagnostics.Config.HTTPAddr}}</dd>
        <dt>Data Directory</dt>
        <dd>{{.Diagnostics.Config.DataDir}}</dd>
        <dt>DB Path</dt>
        <dd>{{.Diagnostics.Config.DBPath}}</dd>
        <dt>Content Root</dt>
        <dd>{{.Diagnostics.Config.ContentRoot}}</dd>
      </dl>
    </section>
    {{end}}

    {{if eq .State "error"}}
    <section class="panel" aria-live="assertive">
      <h2>Action needed</h2>
      <p>At least one runtime dependency check failed.</p>
      <ol class="next-steps">
        {{range .ErrorNextSteps}}
        <li>{{.}}</li>
        {{end}}
      </ol>
    </section>
    {{end}}
  </main>
  {{else}}
  <main id="content" class="layout-main">
    <section class="panel">
      <h1>{{.PlaceholderTitle}}</h1>
      <p>{{.PlaceholderMessage}}</p>
      <p>Use <a href="/operations">Operations</a> to verify M0 startup confidence.</p>
    </section>
  </main>
  {{end}}
</body>
</html>`))
