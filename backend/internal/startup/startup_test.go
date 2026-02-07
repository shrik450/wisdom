package startup

import (
	"os"
	"path/filepath"
	"testing"

	"wisdom/backend/internal/config"
)

func TestPrepareFilesystemCreatesMissingDirectories(t *testing.T) {
	root := t.TempDir()
	dataDir := filepath.Join(root, "data")
	contentRoot := filepath.Join(dataDir, "content")
	dbPath := filepath.Join(dataDir, "wisdom.db")

	err := PrepareFilesystem(config.Config{
		DataDir:     dataDir,
		ContentRoot: contentRoot,
		DBPath:      dbPath,
	})
	if err != nil {
		t.Fatalf("prepare filesystem: %v", err)
	}

	if info, err := os.Stat(dataDir); err != nil || !info.IsDir() {
		t.Fatalf("expected data directory to exist as dir, err=%v", err)
	}

	if info, err := os.Stat(contentRoot); err != nil || !info.IsDir() {
		t.Fatalf("expected content root to exist as dir, err=%v", err)
	}
}

func TestPrepareFilesystemFailsWhenDataDirIsFile(t *testing.T) {
	root := t.TempDir()
	dataAsFile := filepath.Join(root, "data")
	if err := os.WriteFile(dataAsFile, []byte("x"), 0o644); err != nil {
		t.Fatalf("write data file: %v", err)
	}

	err := PrepareFilesystem(config.Config{
		DataDir:     dataAsFile,
		ContentRoot: filepath.Join(root, "content"),
		DBPath:      filepath.Join(root, "wisdom.db"),
	})
	if err == nil {
		t.Fatal("expected error when data dir is file")
	}
}

func TestPrepareFilesystemFailsWhenContentRootIsFile(t *testing.T) {
	root := t.TempDir()
	contentAsFile := filepath.Join(root, "content")
	if err := os.WriteFile(contentAsFile, []byte("x"), 0o644); err != nil {
		t.Fatalf("write content file: %v", err)
	}

	err := PrepareFilesystem(config.Config{
		DataDir:     filepath.Join(root, "data"),
		ContentRoot: contentAsFile,
		DBPath:      filepath.Join(root, "wisdom.db"),
	})
	if err == nil {
		t.Fatal("expected error when content root is file")
	}
}

func TestPrepareFilesystemFailsWhenDBPathIsDirectory(t *testing.T) {
	root := t.TempDir()
	dbAsDir := filepath.Join(root, "wisdom.db")
	if err := os.MkdirAll(dbAsDir, 0o755); err != nil {
		t.Fatalf("create db path directory: %v", err)
	}

	err := PrepareFilesystem(config.Config{
		DataDir:     filepath.Join(root, "data"),
		ContentRoot: filepath.Join(root, "content"),
		DBPath:      dbAsDir,
	})
	if err == nil {
		t.Fatal("expected error when db path is directory")
	}
}
