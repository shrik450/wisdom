package workspace

import (
	"os"
	"strings"
	"syscall"
	"testing"
)

func TestWriteStreamFallsBackOnCrossDeviceRename(t *testing.T) {
	ws, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	originalRename := renameFile
	t.Cleanup(func() {
		renameFile = originalRename
	})

	renameCalls := 0
	renameFile = func(oldpath, newpath string) error {
		renameCalls++
		if renameCalls == 1 {
			return &os.LinkError{
				Op:  "rename",
				Old: oldpath,
				New: newpath,
				Err: syscall.EXDEV,
			}
		}
		return originalRename(oldpath, newpath)
	}

	if err := ws.WriteStream("cross-device.txt", strings.NewReader("fallback"), 0o640); err != nil {
		t.Fatalf("WriteStream: %v", err)
	}

	got, err := ws.ReadFile("cross-device.txt")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != "fallback" {
		t.Fatalf("got %q, want %q", got, "fallback")
	}
	if renameCalls != 2 {
		t.Fatalf("expected 2 rename attempts, got %d", renameCalls)
	}
}
