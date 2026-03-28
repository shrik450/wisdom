package runs

import (
	"testing"
	"time"
)

func TestFinalizeStateTreatsSuccessfulExitAsSucceeded(t *testing.T) {
	createdAt := time.Date(2026, 3, 28, 12, 0, 0, 0, time.UTC)
	startedAt := createdAt.Add(1 * time.Second)
	active := &activeRun{
		id: "run-1",
		request: RunRequest{
			CreatedAt: createdAt,
		},
		startedAt: startedAt,
	}

	active.mu.Lock()
	active.cancelRequested = true
	active.mu.Unlock()

	state := finalizeState(active, nil, startedAt.Add(2*time.Second))
	if state.Status != StatusSucceeded {
		t.Fatalf("expected succeeded, got %s", state.Status)
	}
	if state.ExitCode == nil || *state.ExitCode != 0 {
		t.Fatalf("expected exit code 0, got %+v", state.ExitCode)
	}
}
