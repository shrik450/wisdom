package workspace_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/shrik450/wisdom/internal/workspace"
)

func TestNew(t *testing.T) {
	t.Run("valid directory", func(t *testing.T) {
		ws, err := workspace.New(t.TempDir())
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if ws == nil {
			t.Fatal("expected non-nil workspace")
		}
	})

	t.Run("non-existent path", func(t *testing.T) {
		_, err := workspace.New("/no/such/path")
		if err == nil {
			t.Fatal("expected error for non-existent path")
		}
	})

	t.Run("path is a regular file", func(t *testing.T) {
		f, err := os.CreateTemp(t.TempDir(), "notadir")
		if err != nil {
			t.Fatal(err)
		}
		f.Close()

		_, err = workspace.New(f.Name())
		if err == nil {
			t.Fatal("expected error for file path")
		}
		if got := err.Error(); !strings.Contains(got, "not a directory") {
			t.Fatalf("expected 'not a directory' in error, got: %s", got)
		}
	})

	t.Run("root through symlink", func(t *testing.T) {
		real := t.TempDir()
		realResolved, err := filepath.EvalSymlinks(real)
		if err != nil {
			t.Fatal(err)
		}
		link := filepath.Join(t.TempDir(), "link")
		if err := os.Symlink(real, link); err != nil {
			t.Fatal(err)
		}

		ws, err := workspace.New(link)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Resolve(".") should return the real dir, not the symlink.
		resolved, err := ws.Resolve(".")
		if err != nil {
			t.Fatalf("unexpected error resolving root: %v", err)
		}
		if resolved != realResolved {
			t.Fatalf("expected root %q, got %q", realResolved, resolved)
		}
	})
}

func TestResolve(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	notesDir := filepath.Join(root, "notes")
	if err := os.MkdirAll(notesDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(notesDir, "foo.md"), []byte("hi"), 0o644); err != nil {
		t.Fatal(err)
	}

	ws, err := workspace.New(root)
	if err != nil {
		t.Fatal(err)
	}

	check := func(t *testing.T, input, want string) {
		t.Helper()
		got, err := ws.Resolve(input)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if got != want {
			t.Fatalf("got %q, want %q", got, want)
		}
	}

	checkRejects := func(t *testing.T, input string) {
		t.Helper()
		_, err := ws.Resolve(input)
		if !errors.Is(err, workspace.ErrOutsideWorkspace) {
			t.Fatalf("expected ErrOutsideWorkspace, got: %v", err)
		}
	}

	okTests := []struct {
		name  string
		input string
		want  string
	}{
		{"simple relative path", "notes/foo.md", filepath.Join(root, "notes", "foo.md")},
		{"dot-relative path", "./notes/foo.md", filepath.Join(root, "notes", "foo.md")},
		{"absolute path inside root", filepath.Join(root, "notes", "foo.md"), filepath.Join(root, "notes", "foo.md")},
		{"the root itself", ".", root},
		{"new file in existing directory", "notes/new.md", filepath.Join(root, "notes", "new.md")},
	}
	for _, tt := range okTests {
		t.Run(tt.name, func(t *testing.T) {
			check(t, tt.input, tt.want)
		})
	}

	rejectTests := []struct {
		name  string
		input string
	}{
		{"dot-dot escaping root", "../../../etc/passwd"},
		{"absolute path outside root", "/etc/passwd"},
	}
	for _, tt := range rejectTests {
		t.Run(tt.name, func(t *testing.T) {
			checkRejects(t, tt.input)
		})
	}

	t.Run("path with prefix trick", func(t *testing.T) {
		evil := root + "-evil"
		if err := os.MkdirAll(evil, 0o755); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { os.RemoveAll(evil) })

		checkRejects(t, filepath.Join(evil, "secret.txt"))
	})

	t.Run("symlink escape", func(t *testing.T) {
		outside := t.TempDir()
		if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
			t.Fatal(err)
		}

		checkRejects(t, "escape/secret.txt")
	})

	t.Run("new file through symlink escape", func(t *testing.T) {
		outside := t.TempDir()
		if err := os.Symlink(outside, filepath.Join(root, "symdir")); err != nil {
			t.Fatal(err)
		}

		checkRejects(t, "symdir/new.md")
	})
}

func TestFileOperations(t *testing.T) {
	root := t.TempDir()
	ws, err := workspace.New(root)
	if err != nil {
		t.Fatal(err)
	}

	t.Run("WriteFile and ReadFile roundtrip", func(t *testing.T) {
		want := []byte("hello workspace")
		if err := ws.WriteFile("test.txt", want, 0o644); err != nil {
			t.Fatalf("WriteFile: %v", err)
		}
		got, err := ws.ReadFile("test.txt")
		if err != nil {
			t.Fatalf("ReadFile: %v", err)
		}
		if string(got) != string(want) {
			t.Fatalf("got %q, want %q", got, want)
		}
	})

	t.Run("WriteFile with traversal path", func(t *testing.T) {
		err := ws.WriteFile("../../escape.txt", []byte("bad"), 0o644)
		if !errors.Is(err, workspace.ErrOutsideWorkspace) {
			t.Fatalf("expected ErrOutsideWorkspace, got: %v", err)
		}
	})

	t.Run("MkdirAll and WriteFile into new dir", func(t *testing.T) {
		if err := ws.MkdirAll("sub/dir", 0o755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		if err := ws.WriteFile("sub/dir/file.txt", []byte("nested"), 0o644); err != nil {
			t.Fatalf("WriteFile: %v", err)
		}
	})

	t.Run("Create and Open roundtrip", func(t *testing.T) {
		f, err := ws.Create("created.txt")
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if _, err := f.Write([]byte("via create")); err != nil {
			f.Close()
			t.Fatal(err)
		}
		f.Close()

		f, err = ws.Open("created.txt")
		if err != nil {
			t.Fatalf("Open: %v", err)
		}
		defer f.Close()
		buf := make([]byte, 64)
		n, err := f.Read(buf)
		if err != nil {
			t.Fatal(err)
		}
		if string(buf[:n]) != "via create" {
			t.Fatalf("got %q", buf[:n])
		}
	})

	t.Run("Stat", func(t *testing.T) {
		info, err := ws.Stat("test.txt")
		if err != nil {
			t.Fatalf("Stat: %v", err)
		}
		if info.Name() != "test.txt" {
			t.Fatalf("expected name test.txt, got %s", info.Name())
		}
	})

	t.Run("ReadDir", func(t *testing.T) {
		entries, err := ws.ReadDir(".")
		if err != nil {
			t.Fatalf("ReadDir: %v", err)
		}
		names := make(map[string]bool)
		for _, e := range entries {
			names[e.Name()] = true
		}
		for _, want := range []string{"test.txt", "created.txt", "sub"} {
			if !names[want] {
				t.Errorf("missing entry %q in ReadDir output", want)
			}
		}
	})

	t.Run("Remove", func(t *testing.T) {
		if err := ws.WriteFile("todelete.txt", []byte("bye"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := ws.Remove("todelete.txt"); err != nil {
			t.Fatalf("Remove: %v", err)
		}
		_, err := ws.Stat("todelete.txt")
		if err == nil {
			t.Fatal("expected error after Remove, file still exists")
		}
	})

	t.Run("ReadFile with escaping path", func(t *testing.T) {
		_, err := ws.ReadFile("../../../etc/passwd")
		if !errors.Is(err, workspace.ErrOutsideWorkspace) {
			t.Fatalf("expected ErrOutsideWorkspace, got: %v", err)
		}
	})
}

func TestContext(t *testing.T) {
	t.Run("roundtrip", func(t *testing.T) {
		ws, err := workspace.New(t.TempDir())
		if err != nil {
			t.Fatal(err)
		}
		ctx := workspace.WithContext(context.Background(), ws)
		got := workspace.FromContext(ctx)
		if got != ws {
			t.Fatalf("expected same workspace from context, got %v", got)
		}
	})

	t.Run("bare context returns nil", func(t *testing.T) {
		got := workspace.FromContext(context.Background())
		if got != nil {
			t.Fatalf("expected nil, got %v", got)
		}
	})
}
