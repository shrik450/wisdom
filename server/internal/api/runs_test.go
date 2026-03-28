package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/shrik450/wisdom/internal/api"
	"github.com/shrik450/wisdom/internal/middleware"
	"github.com/shrik450/wisdom/internal/runs"
	"github.com/shrik450/wisdom/internal/workspace"
)

func newRunTestServer(t *testing.T, managerOpts runs.ManagerOptions) (*httptest.Server, *workspace.Workspace, *runs.Manager) {
	t.Helper()
	ws, err := workspace.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	manager := runs.NewManager(ws, managerOpts)
	handler := middleware.WithWorkspace(api.APIHandler(api.HandlerOptions{RunManager: manager}), ws)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv, ws, manager
}

func writeExecutable(t *testing.T, ws *workspace.Workspace, path, content string) {
	t.Helper()
	if err := ws.WriteFile(path, []byte(content), 0o755); err != nil {
		t.Fatal(err)
	}
	absPath, err := ws.Resolve(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(absPath, 0o755); err != nil {
		t.Fatal(err)
	}
}

func createRun(t *testing.T, srv *httptest.Server, req runs.CreateRequest) runs.CreateResult {
	t.Helper()
	body, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	resp := doRequest(t, http.MethodPost, srv.URL+"/api/runs", bytes.NewReader(body))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		bodyBytes, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 201, got %d: %s", resp.StatusCode, string(bodyBytes))
	}
	var result runs.CreateResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func waitForRunState(t *testing.T, ws *workspace.Workspace, statePath string, done func(runs.RunState) bool) runs.RunState {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		data, err := ws.ReadFile(statePath)
		if err == nil {
			var state runs.RunState
			if err := json.Unmarshal(data, &state); err == nil && done(state) {
				return state
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", statePath)
	return runs.RunState{}
}

func TestCreateRunSuccess(t *testing.T) {
	srv, ws, _ := newRunTestServer(t, runs.ManagerOptions{})
	writeExecutable(t, ws, "script.sh", "#!/bin/sh\nprintf 'stdout line\\n'\nprintf 'stderr line\\n' >&2\n")

	result := createRun(t, srv, runs.CreateRequest{Path: "script.sh"})

	if result.Path == "" || result.RequestPath == "" || result.StatePath == "" || result.OutputPath == "" {
		t.Fatalf("expected populated artifact paths, got %+v", result)
	}
	state := waitForRunState(t, ws, result.StatePath, func(state runs.RunState) bool {
		return state.Status == runs.StatusSucceeded
	})
	if state.StartedAt == nil || state.FinishedAt == nil {
		t.Fatalf("expected terminal timestamps, got %+v", state)
	}

	requestData, err := ws.ReadFile(result.RequestPath)
	if err != nil {
		t.Fatal(err)
	}
	var request runs.RunRequest
	if err := json.Unmarshal(requestData, &request); err != nil {
		t.Fatal(err)
	}
	if request.Trigger != "manual" || request.Cwd != "." || request.Path != "script.sh" {
		t.Fatalf("unexpected request %+v", request)
	}
	if request.Args == nil {
		t.Fatal("expected request args to serialize as an empty array, got null")
	}

	output, err := ws.ReadFile(result.OutputPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(output) != "stdout line\nstderr line\n" {
		t.Fatalf("unexpected output log %q", string(output))
	}
}

func TestCreateRunValidationFailures(t *testing.T) {
	srv, ws, _ := newRunTestServer(t, runs.ManagerOptions{})
	if err := ws.WriteFile("plain.txt", []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name string
		body string
	}{
		{name: "missing path", body: `{}`},
		{name: "invalid path", body: `{"path":"../escape.sh"}`},
		{name: "missing file", body: `{"path":"missing.sh"}`},
		{name: "non executable", body: `{"path":"plain.txt"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := doRequest(t, http.MethodPost, srv.URL+"/api/runs", strings.NewReader(tt.body))
			defer resp.Body.Close()
			if resp.StatusCode != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d", resp.StatusCode)
			}
		})
	}
}

func TestCreateRunStartFailure(t *testing.T) {
	srv, ws, _ := newRunTestServer(t, runs.ManagerOptions{})
	writeExecutable(t, ws, "broken", "this is not an executable format\n")

	result := createRun(t, srv, runs.CreateRequest{Path: "broken"})
	state := waitForRunState(t, ws, result.StatePath, func(state runs.RunState) bool {
		return state.Status == runs.StatusStartFailed
	})
	if state.StartedAt != nil {
		t.Fatalf("expected nil startedAt, got %+v", state)
	}
	if state.FinishedAt == nil {
		t.Fatalf("expected finishedAt for start failure, got %+v", state)
	}
}

func TestCancelRun(t *testing.T) {
	srv, ws, _ := newRunTestServer(t, runs.ManagerOptions{CancelGracePeriod: 50 * time.Millisecond})
	writeExecutable(t, ws, "loop.sh", "#!/bin/sh\ntrap 'printf term\\n; exit 0' TERM\nwhile true; do printf tick\\n; sleep 1; done\n")

	result := createRun(t, srv, runs.CreateRequest{Path: "loop.sh"})
	waitForOutput(t, ws, result.OutputPath, func(output string) bool {
		return strings.Contains(output, "tick")
	})
	resp := doRequest(t, http.MethodPost, srv.URL+"/api/runs/"+result.ID+"/cancel", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	state := waitForRunState(t, ws, result.StatePath, func(state runs.RunState) bool {
		return state.Status == runs.StatusCancelled
	})
	if state.FinishedAt == nil {
		t.Fatalf("expected terminal state, got %+v", state)
	}

	output, err := ws.ReadFile(result.OutputPath)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(output), "tick") {
		t.Fatalf("expected preserved output, got %q", string(output))
	}
}

func waitForOutput(t *testing.T, ws *workspace.Workspace, outputPath string, done func(string) bool) string {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		data, err := ws.ReadFile(outputPath)
		if err == nil {
			output := string(data)
			if done(output) {
				return output
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for output at %s", outputPath)
	return ""
}

func TestCancelCompletedRunAndMissingRun(t *testing.T) {
	srv, ws, _ := newRunTestServer(t, runs.ManagerOptions{})
	writeExecutable(t, ws, "done.sh", "#!/bin/sh\nexit 0\n")

	result := createRun(t, srv, runs.CreateRequest{Path: "done.sh"})
	original := waitForRunState(t, ws, result.StatePath, func(state runs.RunState) bool {
		return state.Status == runs.StatusSucceeded
	})

	resp := doRequest(t, http.MethodPost, srv.URL+"/api/runs/"+result.ID+"/cancel", nil)
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}

	after := waitForRunState(t, ws, result.StatePath, func(state runs.RunState) bool {
		return state.Status == runs.StatusSucceeded
	})
	if !after.FinishedAt.Equal(*original.FinishedAt) {
		t.Fatalf("expected completed state unchanged, got %+v then %+v", original, after)
	}

	missingResp := doRequest(t, http.MethodPost, srv.URL+"/api/runs/missing/cancel", nil)
	defer missingResp.Body.Close()
	if missingResp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", missingResp.StatusCode)
	}
}

func TestRunManagerShutdownFinalizesActiveRuns(t *testing.T) {
	_, ws, manager := newRunTestServer(t, runs.ManagerOptions{CancelGracePeriod: 50 * time.Millisecond})
	writeExecutable(t, ws, "shutdown.sh", "#!/bin/sh\ntrap 'exit 0' TERM\nwhile true; do sleep 1; done\n")

	result, err := manager.Create(context.Background(), runs.CreateRequest{Path: "shutdown.sh"})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := manager.Shutdown(ctx); err != nil && !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal(err)
	}

	state := waitForRunState(t, ws, result.StatePath, func(state runs.RunState) bool {
		return state.Status == runs.StatusCancelled
	})
	if state.FinishedAt == nil {
		t.Fatalf("expected shutdown to finalize run, got %+v", state)
	}
}

func TestCreateRunRejectedWhileManagerShuttingDown(t *testing.T) {
	srv, ws, manager := newRunTestServer(t, runs.ManagerOptions{})
	writeExecutable(t, ws, "script.sh", "#!/bin/sh\nexit 0\n")

	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatal(err)
	}

	body, err := json.Marshal(runs.CreateRequest{Path: "script.sh"})
	if err != nil {
		t.Fatal(err)
	}
	resp := doRequest(t, http.MethodPost, srv.URL+"/api/runs", bytes.NewReader(body))
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", resp.StatusCode)
	}
}
