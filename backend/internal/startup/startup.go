package startup

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"wisdom/backend/internal/config"
)

func PrepareFilesystem(cfg config.Config) error {
	if err := ensureDirectory(cfg.DataDir, "data directory"); err != nil {
		return err
	}

	if err := ensureDirectory(cfg.ContentRoot, "content root"); err != nil {
		return err
	}

	if err := ensureDatabasePath(cfg.DBPath); err != nil {
		return err
	}

	return nil
}

func ensureDirectory(path string, label string) error {
	info, err := os.Stat(path)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("%s is not a directory: %s", label, path)
		}
		return nil
	}

	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat %s: %w", label, err)
	}

	if err := os.MkdirAll(path, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", label, err)
	}

	return nil
}

func ensureDatabasePath(path string) error {
	info, err := os.Stat(path)
	if err == nil {
		if info.IsDir() {
			return fmt.Errorf("sqlite db path is a directory: %s", path)
		}
		return nil
	}

	if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("stat sqlite db path: %w", err)
	}

	if err := ensureDirectory(filepath.Dir(path), "sqlite parent directory"); err != nil {
		return err
	}

	return nil
}
