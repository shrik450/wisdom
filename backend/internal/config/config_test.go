package config

import (
	"path/filepath"
	"testing"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("WISDOM_HTTP_ADDR", "")
	t.Setenv("WISDOM_DATA_DIR", "")
	t.Setenv("WISDOM_DB_PATH", "")
	t.Setenv("WISDOM_CONTENT_ROOT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}

	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("expected default addr :8080, got %q", cfg.HTTPAddr)
	}

	if !filepath.IsAbs(cfg.DataDir) {
		t.Fatalf("expected absolute data dir, got %q", cfg.DataDir)
	}

	expectedDBPath := filepath.Join(cfg.DataDir, "wisdom.db")
	if cfg.DBPath != expectedDBPath {
		t.Fatalf("expected default db path %q, got %q", expectedDBPath, cfg.DBPath)
	}

	expectedContentRoot := filepath.Join(cfg.DataDir, "content")
	if cfg.ContentRoot != expectedContentRoot {
		t.Fatalf("expected default content root %q, got %q", expectedContentRoot, cfg.ContentRoot)
	}
}

func TestLoadWithOverrides(t *testing.T) {
	t.Setenv("WISDOM_HTTP_ADDR", "127.0.0.1:9090")
	t.Setenv("WISDOM_DATA_DIR", "./tmp/../wisdom-data")
	t.Setenv("WISDOM_DB_PATH", "./tmp/../custom/wisdom.db")
	t.Setenv("WISDOM_CONTENT_ROOT", "./tmp/../content-root")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("load config with overrides: %v", err)
	}

	if cfg.HTTPAddr != "127.0.0.1:9090" {
		t.Fatalf("expected override addr, got %q", cfg.HTTPAddr)
	}

	if !filepath.IsAbs(cfg.DataDir) {
		t.Fatalf("expected absolute data dir, got %q", cfg.DataDir)
	}

	if !filepath.IsAbs(cfg.DBPath) {
		t.Fatalf("expected absolute db path, got %q", cfg.DBPath)
	}

	if !filepath.IsAbs(cfg.ContentRoot) {
		t.Fatalf("expected absolute content root, got %q", cfg.ContentRoot)
	}
}

func TestLoadRejectsInvalidHTTPAddr(t *testing.T) {
	t.Setenv("WISDOM_HTTP_ADDR", "8080")
	t.Setenv("WISDOM_DATA_DIR", "")
	t.Setenv("WISDOM_DB_PATH", "")
	t.Setenv("WISDOM_CONTENT_ROOT", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected invalid http addr error")
	}
}
