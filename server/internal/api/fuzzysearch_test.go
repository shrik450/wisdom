package api_test

import (
	"testing"

	"github.com/shrik450/wisdom/internal/api"
	"github.com/shrik450/wisdom/internal/workspace"
)

func TestFuzzySearch(t *testing.T) {
	entries := []workspace.WalkEntry{
		{Path: "components/shell.tsx", IsDir: false},
		{Path: "components/sidebar.tsx", IsDir: false},
		{Path: "api/fs.ts", IsDir: false},
		{Path: "hooks/use-fs.ts", IsDir: false},
		{Path: "app.tsx", IsDir: false},
		{Path: "path-utils.ts", IsDir: false},
	}

	t.Run("returns ranked results", func(t *testing.T) {
		results := api.FuzzySearch("shell", entries, 5)
		if len(results) == 0 {
			t.Fatal("expected results")
		}
		if results[0].Path != "components/shell.tsx" {
			t.Errorf("expected top result to be components/shell.tsx, got %s", results[0].Path)
		}
	})

	t.Run("respects limit", func(t *testing.T) {
		results := api.FuzzySearch("s", entries, 2)
		if len(results) > 2 {
			t.Errorf("expected at most 2 results, got %d", len(results))
		}
	})

	t.Run("empty query returns nil", func(t *testing.T) {
		results := api.FuzzySearch("", entries, 5)
		if results != nil {
			t.Errorf("expected nil for empty query, got %v", results)
		}
	})

	t.Run("no matches returns empty", func(t *testing.T) {
		results := api.FuzzySearch("zzzzz", entries, 5)
		if len(results) != 0 {
			t.Errorf("expected 0 results, got %d", len(results))
		}
	})
}
