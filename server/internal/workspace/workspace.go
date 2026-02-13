// Package workspace provides functionality to safely access the workspace
package workspace

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

var (
	ErrOutsideWorkspace = errors.New("path is outside workspace")
	ErrNoWorkspaceRoot  = errors.New("WISDOM_WORKSPACE_ROOT is not set")
)

const workspaceEnvVar = "WISDOM_WORKSPACE_ROOT"

// Workspace provides safe, sandboxed file access within a root directory.
type Workspace struct {
	// Cleaned, absolute path to the workspace root.
	root string
}

var (
	defaultWorkspace *Workspace
	defaultWsOnce    sync.Once
	defaultErr       error
)

// Default returns the workspace defined by the WISDOM_WORKSPACE_ROOT env var,
// initializing it on the first call.
func Default() (*Workspace, error) {
	defaultWsOnce.Do(func() {
		root := os.Getenv(workspaceEnvVar)
		if root == "" {
			defaultErr = ErrNoWorkspaceRoot
			return
		}
		defaultWorkspace, defaultErr = New(root)
	})

	return defaultWorkspace, defaultErr
}

// New creates a new Workspace rooted at the given directory.
func New(root string) (*Workspace, error) {
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, fmt.Errorf("resolving workspace root: %w", err)
	}

	resolved, err = filepath.Abs(resolved)
	if err != nil {
		return nil, fmt.Errorf("getting absolute path of workspace root: %w", err)
	}

	info, err := os.Stat(resolved)
	if err != nil {
		return nil, fmt.Errorf("stat workspace root: %w", err)
	}

	if !info.IsDir() {
		return nil, fmt.Errorf("workspace root %q is not a directory", resolved)
	}

	return &Workspace{root: resolved}, nil
}

func (w *Workspace) Resolve(name string) (string, error) {
	return w.resolve(name)
}

func (w *Workspace) ReadFile(name string) ([]byte, error) {
	p, err := w.resolve(name)
	if err != nil {
		return nil, err
	}
	return os.ReadFile(p)
}

func (w *Workspace) WriteFile(name string, data []byte, perm fs.FileMode) error {
	p, err := w.resolve(name)
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, perm)
}

func (w *Workspace) MkdirAll(name string, perm fs.FileMode) error {
	p, err := w.resolve(name)
	if err != nil {
		return err
	}
	return os.MkdirAll(p, perm)
}

func (w *Workspace) Stat(name string) (fs.FileInfo, error) {
	p, err := w.resolve(name)
	if err != nil {
		return nil, err
	}
	return os.Stat(p)
}

func (w *Workspace) Open(name string) (*os.File, error) {
	p, err := w.resolve(name)
	if err != nil {
		return nil, err
	}
	return os.Open(p)
}

func (w *Workspace) Create(name string) (*os.File, error) {
	p, err := w.resolve(name)
	if err != nil {
		return nil, err
	}
	return os.Create(p)
}

func (w *Workspace) Remove(name string) error {
	p, err := w.resolve(name)
	if err != nil {
		return err
	}
	return os.Remove(p)
}

func (w *Workspace) RemoveAll(name string) error {
	p, err := w.resolve(name)
	if err != nil {
		return err
	}
	return os.RemoveAll(p)
}

func (w *Workspace) Move(oldname, newname string) error {
	oldpath, err := w.resolve(oldname)
	if err != nil {
		return err
	}
	newpath, err := w.resolve(newname)
	if err != nil {
		return err
	}
	return os.Rename(oldpath, newpath)
}

// ReadDir lists entries in a workspace-relative directory.
func (w *Workspace) ReadDir(name string) ([]fs.DirEntry, error) {
	p, err := w.resolve(name)
	if err != nil {
		return nil, err
	}
	return os.ReadDir(p)
}

// resolve validates that name is inside the workspace and returns the cleaned
// absolute path. name can be relative (to the workspace root) or absolute.
// Symlinks in the target are resolved before checking.
func (w *Workspace) resolve(name string) (string, error) {
	var abs string
	if filepath.IsAbs(name) {
		abs = filepath.Clean(name)
	} else {
		abs = filepath.Join(w.root, name)
	}

	// Evaluate symlinks on the longest existing prefix to catch
	// symlink-based escapes even if the full path doesn't exist yet (e.g. new files).
	resolved, err := evalExisting(abs)
	if err != nil {
		return "", fmt.Errorf("resolving path: %w", err)
	}

	if !isSubpath(w.root, resolved) {
		return "", fmt.Errorf("%w: %s", ErrOutsideWorkspace, name)
	}

	return resolved, nil
}

// isSubpath checks whether child is under parent.
// Both paths must be cleaned and absolute.
func isSubpath(parent, child string) bool {
	if child == parent {
		return true
	}
	// Append separator to avoid prefix false positives
	// e.g. /workspace-evil matching /workspace
	return len(child) > len(parent) &&
		child[:len(parent)] == parent &&
		child[len(parent)] == filepath.Separator
}

type ctxKey struct{}

func WithContext(ctx context.Context, ws *Workspace) context.Context {
	return context.WithValue(ctx, ctxKey{}, ws)
}

func FromContext(ctx context.Context) *Workspace {
	ws, _ := ctx.Value(ctxKey{}).(*Workspace)
	return ws
}

// evalExisting resolves symlinks on the longest existing prefix of a path.
// This handles the case where we're writing a new file: the file itself
// doesn't exist yet, but its parent directory might contain symlinks.
func evalExisting(path string) (string, error) {
	// Try resolving the full path first (common case: file exists).
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return resolved, nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return "", err
	}

	// Walk up to find the deepest existing ancestor.
	dir := filepath.Dir(path)
	base := filepath.Base(path)

	resolvedDir, err := evalExisting(dir)
	if err != nil {
		return "", err
	}

	return filepath.Join(resolvedDir, base), nil
}
