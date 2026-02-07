package config

import (
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	HTTPAddr    string
	DataDir     string
	DBPath      string
	ContentRoot string
}

func Load() (Config, error) {
	dataDir := getEnv("WISDOM_DATA_DIR", filepath.Clean("./data"))
	dbPath := getEnv("WISDOM_DB_PATH", filepath.Join(dataDir, "wisdom.db"))
	contentRoot := getEnv("WISDOM_CONTENT_ROOT", filepath.Join(dataDir, "content"))

	cfg := Config{
		HTTPAddr:    getEnv("WISDOM_HTTP_ADDR", ":8080"),
		DataDir:     dataDir,
		DBPath:      dbPath,
		ContentRoot: contentRoot,
	}

	return normalizeAndValidate(cfg)
}

func getEnv(key string, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func normalizeAndValidate(cfg Config) (Config, error) {
	if _, _, err := net.SplitHostPort(cfg.HTTPAddr); err != nil {
		return Config{}, fmt.Errorf("invalid WISDOM_HTTP_ADDR %q: %w", cfg.HTTPAddr, err)
	}

	dataDir, err := normalizePath(cfg.DataDir)
	if err != nil {
		return Config{}, fmt.Errorf("normalize WISDOM_DATA_DIR: %w", err)
	}

	dbPath, err := normalizePath(cfg.DBPath)
	if err != nil {
		return Config{}, fmt.Errorf("normalize WISDOM_DB_PATH: %w", err)
	}

	contentRoot, err := normalizePath(cfg.ContentRoot)
	if err != nil {
		return Config{}, fmt.Errorf("normalize WISDOM_CONTENT_ROOT: %w", err)
	}

	return Config{
		HTTPAddr:    cfg.HTTPAddr,
		DataDir:     dataDir,
		DBPath:      dbPath,
		ContentRoot: contentRoot,
	}, nil
}

func normalizePath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", fmt.Errorf("path is empty")
	}

	absPath, err := filepath.Abs(filepath.Clean(trimmed))
	if err != nil {
		return "", fmt.Errorf("resolve absolute path: %w", err)
	}

	return absPath, nil
}
