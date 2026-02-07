package server

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"wisdom/backend/internal/migrations"
	"wisdom/backend/internal/store/sqlite"
)

type testRouterFixture struct {
	handler       http.Handler
	contentRoot   string
	migrationsDir string
	dbPath        string
}

func TestHealthzReturnsOKWithChecks(t *testing.T) {
	fixture := newTestRouterFixture(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	fixture.handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var payload healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode health payload: %v", err)
	}

	if payload.Status != overallStatusOK {
		t.Fatalf("expected status ok, got %q", payload.Status)
	}

	if len(payload.Checks) != 3 {
		t.Fatalf("expected 3 checks, got %d", len(payload.Checks))
	}
}

func TestHealthzReturns503WhenDependencyFails(t *testing.T) {
	fixture := newTestRouterFixture(t)

	if err := os.RemoveAll(fixture.contentRoot); err != nil {
		t.Fatalf("remove content root: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	fixture.handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}

	var payload healthResponse
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode health payload: %v", err)
	}

	if payload.Status != overallStatusError {
		t.Fatalf("expected status error, got %q", payload.Status)
	}

	if payload.Error == nil {
		t.Fatal("expected health error payload")
	}

	if payload.Error.Code != "dependency_check_failed" {
		t.Fatalf("unexpected health error code %q", payload.Error.Code)
	}
}

func TestOpsStatusReturnsRuntimeSnapshot(t *testing.T) {
	fixture := newTestRouterFixture(t)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ops/status", nil)
	fixture.handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var payload opsStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode ops payload: %v", err)
	}

	if payload.Status != overallStatusOK {
		t.Fatalf("expected status ok, got %q", payload.Status)
	}

	if payload.StartupAt == "" {
		t.Fatal("expected startup timestamp")
	}

	if payload.Config.ContentRoot != fixture.contentRoot {
		t.Fatalf("expected content root %q, got %q", fixture.contentRoot, payload.Config.ContentRoot)
	}

	if payload.Config.DBPath != fixture.dbPath {
		t.Fatalf("expected db path %q, got %q", fixture.dbPath, payload.Config.DBPath)
	}
}

func TestOpsStatusReturnsErrorStateWhenDependencyFails(t *testing.T) {
	fixture := newTestRouterFixture(t)

	if err := os.RemoveAll(fixture.contentRoot); err != nil {
		t.Fatalf("remove content root: %v", err)
	}

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/ops/status", nil)
	fixture.handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}

	var payload opsStatusResponse
	if err := json.NewDecoder(rec.Body).Decode(&payload); err != nil {
		t.Fatalf("decode ops payload: %v", err)
	}

	if payload.Status != overallStatusError {
		t.Fatalf("expected status error, got %q", payload.Status)
	}
}

func TestOperationsPageStateCoverage(t *testing.T) {
	fixture := newTestRouterFixture(t)

	emptyBody := requestBody(t, fixture.handler, "/operations")
	assertContains(t, emptyBody, `data-state="empty"`)
	assertContains(t, emptyBody, "Library")
	assertContains(t, emptyBody, "Notes")
	assertContains(t, emptyBody, "Imports")
	assertContains(t, emptyBody, "Operations")

	loadingBody := requestBody(t, fixture.handler, "/operations/loading")
	assertContains(t, loadingBody, `data-state="loading"`)
	assertContains(t, loadingBody, "/operations?run=1")

	successBody := requestBody(t, fixture.handler, "/operations?run=1")
	assertContains(t, successBody, `data-state="success"`)
	assertContains(t, successBody, "System verdict")

	if err := os.RemoveAll(fixture.contentRoot); err != nil {
		t.Fatalf("remove content root: %v", err)
	}

	errorBody := requestBody(t, fixture.handler, "/operations?run=1")
	assertContains(t, errorBody, `data-state="error"`)
	assertContains(t, errorBody, "Action needed")
	assertContains(t, errorBody, "verify configured paths and migration files")
}

func TestPlaceholderRoutesStayExplicit(t *testing.T) {
	fixture := newTestRouterFixture(t)

	routes := []string{"/library", "/notes", "/imports"}
	for _, route := range routes {
		body := requestBody(t, fixture.handler, route)
		assertContains(t, body, "placeholder")
		assertContains(t, body, "Operations")
	}
}

func TestRootRedirectDoesNotCaptureUnknownPaths(t *testing.T) {
	fixture := newTestRouterFixture(t)

	rootRec := httptest.NewRecorder()
	rootReq := httptest.NewRequest(http.MethodGet, "/", nil)
	fixture.handler.ServeHTTP(rootRec, rootReq)

	if rootRec.Code != http.StatusSeeOther {
		t.Fatalf("expected 303 for /, got %d", rootRec.Code)
	}

	if rootRec.Header().Get("Location") != "/operations" {
		t.Fatalf("expected redirect to /operations, got %q", rootRec.Header().Get("Location"))
	}

	unknownRec := httptest.NewRecorder()
	unknownReq := httptest.NewRequest(http.MethodGet, "/api/v1/ops/statuz", nil)
	fixture.handler.ServeHTTP(unknownRec, unknownReq)

	if unknownRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown route, got %d", unknownRec.Code)
	}
}

func newTestRouterFixture(t *testing.T) testRouterFixture {
	t.Helper()

	root := t.TempDir()
	migrationsDir := filepath.Join(root, "migrations")
	if err := os.MkdirAll(migrationsDir, 0o755); err != nil {
		t.Fatalf("create migrations dir: %v", err)
	}

	migrationPath := filepath.Join(migrationsDir, "0001_initial.sql")
	if err := os.WriteFile(migrationPath, []byte("CREATE TABLE IF NOT EXISTS bootstrap_table (id INTEGER PRIMARY KEY);"), 0o644); err != nil {
		t.Fatalf("write migration: %v", err)
	}

	dbPath := filepath.Join(root, "wisdom.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	if err := migrations.Apply(context.Background(), db, migrationsDir); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	contentRoot := filepath.Join(root, "content")
	if err := os.MkdirAll(contentRoot, 0o755); err != nil {
		t.Fatalf("create content root: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	handler := NewRouter(RouterOptions{
		Logger:        logger,
		DB:            db,
		HTTPAddr:      ":8080",
		DataDir:       filepath.Join(root, "data"),
		DBPath:        dbPath,
		ContentRoot:   contentRoot,
		MigrationsDir: migrationsDir,
		StartupAt:     time.Now().Add(-2 * time.Minute),
	})

	return testRouterFixture{
		handler:       handler,
		contentRoot:   contentRoot,
		migrationsDir: migrationsDir,
		dbPath:        dbPath,
	}
}

func requestBody(t *testing.T, handler http.Handler, path string) string {
	t.Helper()

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for %s, got %d", path, rec.Code)
	}

	return rec.Body.String()
}

func assertContains(t *testing.T, body string, expected string) {
	t.Helper()
	if !strings.Contains(body, expected) {
		t.Fatalf("expected body to contain %q", expected)
	}
}
