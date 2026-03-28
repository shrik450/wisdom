package runs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/shrik450/wisdom/internal/workspace"
)

const (
	runsRootPath      = ".wisdom/runs"
	requestFileName   = "request.json"
	stateFileName     = "state.json"
	outputFileName    = "output.log"
	defaultTrigger    = "manual"
	defaultRunCwd     = "."
	defaultCancelWait = 5 * time.Second
)

var (
	ErrPathRequired      = errors.New("path is required")
	ErrInvalidPath       = errors.New("path must be workspace-relative")
	ErrInvalidCwd        = errors.New("cwd must be workspace-relative")
	ErrPathNotFound      = errors.New("path does not exist")
	ErrPathNotExecutable = errors.New("path is not executable")
	ErrPathIsDirectory   = errors.New("path must be a file")
	ErrCwdNotFound       = errors.New("cwd does not exist")
	ErrCwdNotDirectory   = errors.New("cwd must be a directory")
	ErrShuttingDown      = errors.New("run manager is shutting down")
	ErrRunNotFound       = errors.New("run not found")
)

type CreateRequest struct {
	Path    string   `json:"path"`
	Args    []string `json:"args"`
	Cwd     string   `json:"cwd"`
	Trigger string   `json:"trigger"`
}

type RunRequest struct {
	ID        string    `json:"id"`
	Path      string    `json:"path"`
	Args      []string  `json:"args"`
	Cwd       string    `json:"cwd"`
	Trigger   string    `json:"trigger"`
	CreatedAt time.Time `json:"createdAt"`
}

type RunStatus string

const (
	StatusPending     RunStatus = "pending"
	StatusRunning     RunStatus = "running"
	StatusSucceeded   RunStatus = "succeeded"
	StatusFailed      RunStatus = "failed"
	StatusCancelled   RunStatus = "cancelled"
	StatusStartFailed RunStatus = "start_failed"
)

type RunState struct {
	ID                string     `json:"id"`
	Status            RunStatus  `json:"status"`
	CreatedAt         time.Time  `json:"createdAt"`
	StartedAt         *time.Time `json:"startedAt"`
	FinishedAt        *time.Time `json:"finishedAt"`
	ExitCode          *int       `json:"exitCode"`
	TerminationSignal *string    `json:"terminationSignal"`
}

type CreateResult struct {
	ID          string `json:"id"`
	Path        string `json:"path"`
	RequestPath string `json:"requestPath"`
	StatePath   string `json:"statePath"`
	OutputPath  string `json:"outputPath"`
}

type ManagerOptions struct {
	CancelGracePeriod time.Duration
	Now               func() time.Time
	GenerateID        func() (string, error)
}

type Manager struct {
	ws                *workspace.Workspace
	cancelGracePeriod time.Duration
	now               func() time.Time
	generateID        func() (string, error)

	mu     sync.Mutex
	active map[string]*activeRun
	cond   *sync.Cond

	stopping        bool
	inflightCreates int
}

type activeRun struct {
	id         string
	request    RunRequest
	startedAt  time.Time
	cmd        *exec.Cmd
	outputFile *os.File
	done       chan struct{}

	mu                   sync.Mutex
	cancelRequested      bool
	cancelSignalSentFlag bool
	cancelOnce           sync.Once
}

func NewManager(ws *workspace.Workspace, opts ManagerOptions) *Manager {
	grace := opts.CancelGracePeriod
	if grace <= 0 {
		grace = defaultCancelWait
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	genID := opts.GenerateID
	if genID == nil {
		genID = defaultGenerateID
	}
	m := &Manager{
		ws:                ws,
		cancelGracePeriod: grace,
		now:               now,
		generateID:        genID,
		active:            make(map[string]*activeRun),
	}
	m.cond = sync.NewCond(&m.mu)
	return m
}

func (m *Manager) Create(_ context.Context, req CreateRequest) (CreateResult, error) {
	if err := m.beginCreate(); err != nil {
		return CreateResult{}, err
	}
	defer m.endCreate()

	normalizedPath, err := normalizeRelativePath(req.Path, false)
	if err != nil {
		return CreateResult{}, err
	}
	normalizedCwd, err := normalizeRelativePath(req.Cwd, true)
	if err != nil {
		if errors.Is(err, ErrPathRequired) {
			return CreateResult{}, ErrInvalidCwd
		}
		return CreateResult{}, err
	}
	if normalizedCwd == "" {
		normalizedCwd = defaultRunCwd
	}

	info, err := m.ws.Stat(normalizedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return CreateResult{}, ErrPathNotFound
		}
		return CreateResult{}, err
	}
	if info.IsDir() {
		return CreateResult{}, ErrPathIsDirectory
	}
	if !workspace.IsExecutable(info.Mode()) {
		return CreateResult{}, ErrPathNotExecutable
	}

	cwdInfo, err := m.ws.Stat(normalizedCwd)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return CreateResult{}, ErrCwdNotFound
		}
		return CreateResult{}, err
	}
	if !cwdInfo.IsDir() {
		return CreateResult{}, ErrCwdNotDirectory
	}

	runID, err := m.generateID()
	if err != nil {
		return CreateResult{}, fmt.Errorf("generate run id: %w", err)
	}
	runDir := filepath.ToSlash(filepath.Join(runsRootPath, runID))
	requestPath := filepath.ToSlash(filepath.Join(runDir, requestFileName))
	statePath := filepath.ToSlash(filepath.Join(runDir, stateFileName))
	outputPath := filepath.ToSlash(filepath.Join(runDir, outputFileName))

	if err := m.ws.MkdirAll(runDir, 0o755); err != nil {
		return CreateResult{}, err
	}
	if err := m.ws.WriteFile(outputPath, nil, 0o644); err != nil {
		return CreateResult{}, err
	}

	createdAt := m.now().UTC()
	trigger := strings.TrimSpace(req.Trigger)
	if trigger == "" {
		trigger = defaultTrigger
	}
	request := RunRequest{
		ID:        runID,
		Path:      normalizedPath,
		Args:      append([]string{}, req.Args...),
		Cwd:       normalizedCwd,
		Trigger:   trigger,
		CreatedAt: createdAt,
	}
	if err := m.writeJSON(requestPath, request, 0o644); err != nil {
		return CreateResult{}, err
	}

	pendingState := RunState{ID: runID, Status: StatusPending, CreatedAt: createdAt}
	if err := m.writeState(statePath, pendingState); err != nil {
		return CreateResult{}, err
	}

	createResult := CreateResult{
		ID:          runID,
		Path:        runDir,
		RequestPath: requestPath,
		StatePath:   statePath,
		OutputPath:  outputPath,
	}

	absPath, err := m.ws.Resolve(normalizedPath)
	if err != nil {
		return CreateResult{}, err
	}
	absCwd, err := m.ws.Resolve(normalizedCwd)
	if err != nil {
		return CreateResult{}, err
	}
	outputFilePath, err := m.ws.Resolve(outputPath)
	if err != nil {
		return CreateResult{}, err
	}
	outputFile, err := os.OpenFile(outputFilePath, os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return CreateResult{}, err
	}

	cmd := exec.Command(absPath, req.Args...)
	cmd.Dir = absCwd
	cmd.Stdout = outputFile
	cmd.Stderr = outputFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	startedAt := m.now().UTC()
	if err := cmd.Start(); err != nil {
		_ = outputFile.Close()
		finishedAt := m.now().UTC()
		startFailed := RunState{
			ID:         runID,
			Status:     StatusStartFailed,
			CreatedAt:  createdAt,
			FinishedAt: &finishedAt,
		}
		if writeErr := m.writeState(statePath, startFailed); writeErr != nil {
			return CreateResult{}, writeErr
		}
		return createResult, nil
	}

	runningState := RunState{
		ID:        runID,
		Status:    StatusRunning,
		CreatedAt: createdAt,
		StartedAt: &startedAt,
	}
	if err := m.writeState(statePath, runningState); err != nil {
		_ = terminateProcessGroup(cmd.Process.Pid, syscall.SIGKILL)
		_, _ = cmd.Process.Wait()
		_ = outputFile.Close()
		return CreateResult{}, err
	}

	active := &activeRun{
		id:         runID,
		request:    request,
		startedAt:  startedAt,
		cmd:        cmd,
		outputFile: outputFile,
		done:       make(chan struct{}),
	}
	m.mu.Lock()
	m.active[runID] = active
	m.mu.Unlock()

	go m.waitForExit(active, statePath)

	return createResult, nil
}

func (m *Manager) Cancel(runID string) error {
	active := m.lookupActive(runID)
	if active == nil {
		if !m.runExists(runID) {
			return ErrRunNotFound
		}
		return nil
	}
	active.requestCancel(func() {
		go m.cancelActiveRun(active)
	})
	return nil
}

func (m *Manager) Shutdown(ctx context.Context) error {
	m.mu.Lock()
	m.stopping = true
	for m.inflightCreates > 0 {
		m.cond.Wait()
	}
	active := make([]*activeRun, 0, len(m.active))
	for _, run := range m.active {
		active = append(active, run)
	}
	m.mu.Unlock()

	for _, run := range active {
		run.requestCancel(func() {
			go m.cancelActiveRun(run)
		})
	}

	for _, run := range active {
		select {
		case <-run.done:
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return nil
}

func (m *Manager) beginCreate() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.stopping {
		return ErrShuttingDown
	}
	m.inflightCreates++
	return nil
}

func (m *Manager) endCreate() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.inflightCreates--
	m.cond.Broadcast()
}

func (m *Manager) waitForExit(active *activeRun, statePath string) {
	err := active.cmd.Wait()
	_ = active.outputFile.Close()
	state := finalizeState(active, err, m.now().UTC())
	_ = m.writeState(statePath, state)

	m.mu.Lock()
	delete(m.active, active.id)
	m.mu.Unlock()
	close(active.done)
}

func (m *Manager) cancelActiveRun(active *activeRun) {
	pid := active.cmd.Process.Pid
	if err := terminateProcessGroup(pid, syscall.SIGTERM); err == nil {
		active.setCancelSignalSent(true)
	}

	select {
	case <-active.done:
		return
	case <-time.After(m.cancelGracePeriod):
	}

	_ = terminateProcessGroup(pid, syscall.SIGKILL)
}

func (m *Manager) lookupActive(runID string) *activeRun {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.active[runID]
}

func (m *Manager) runExists(runID string) bool {
	_, err := m.ws.Stat(filepath.ToSlash(filepath.Join(runsRootPath, runID)))
	return err == nil
}

func (m *Manager) writeJSON(path string, value any, perm fs.FileMode) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return m.ws.WriteStream(path, strings.NewReader(string(data)), perm)
}

func (m *Manager) writeState(path string, state RunState) error {
	return m.writeJSON(path, state, 0o644)
}

func finalizeState(active *activeRun, err error, finishedAt time.Time) RunState {
	state := RunState{
		ID:         active.id,
		CreatedAt:  active.request.CreatedAt,
		StartedAt:  &active.startedAt,
		FinishedAt: &finishedAt,
	}

	if err == nil {
		if active.cancelSignalSent() {
			state.Status = StatusCancelled
			zero := 0
			state.ExitCode = &zero
			return state
		}
		zero := 0
		state.Status = StatusSucceeded
		state.ExitCode = &zero
		return state
	}

	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		state.Status = StatusFailed
		return state
	}

	state.Status = StatusFailed
	if active.wasCancelled() {
		state.Status = StatusCancelled
	}

	if status, ok := exitErr.Sys().(syscall.WaitStatus); ok {
		if status.Exited() {
			exitCode := status.ExitStatus()
			state.ExitCode = &exitCode
		}
		if status.Signaled() {
			signal := status.Signal().String()
			state.TerminationSignal = &signal
		}
	}

	return state
}

func terminateProcessGroup(pid int, signal syscall.Signal) error {
	err := syscall.Kill(-pid, signal)
	if errors.Is(err, syscall.ESRCH) {
		return nil
	}
	return err
}

func normalizeRelativePath(value string, allowRoot bool) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		if allowRoot {
			return defaultRunCwd, nil
		}
		return "", ErrPathRequired
	}
	if filepath.IsAbs(trimmed) {
		if allowRoot {
			return "", ErrInvalidCwd
		}
		return "", ErrInvalidPath
	}
	cleaned := filepath.Clean(trimmed)
	if cleaned == "." {
		if allowRoot {
			return defaultRunCwd, nil
		}
		return "", ErrInvalidPath
	}
	if cleaned == ".." || strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		if allowRoot {
			return "", ErrInvalidCwd
		}
		return "", ErrInvalidPath
	}
	return filepath.ToSlash(cleaned), nil
}

func defaultGenerateID() (string, error) {
	var suffix [4]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("%s-%s", time.Now().UTC().Format("20060102T150405.000000000Z"), hex.EncodeToString(suffix[:])), nil
}

func (a *activeRun) requestCancel(fn func()) {
	a.cancelOnce.Do(func() {
		a.mu.Lock()
		a.cancelRequested = true
		a.mu.Unlock()
		fn()
	})
}

func (a *activeRun) wasCancelled() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.cancelRequested
}

func (a *activeRun) setCancelSignalSent(sent bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.cancelSignalSentFlag = sent
}

func (a *activeRun) cancelSignalSent() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.cancelSignalSentFlag
}
