package api_test

import (
	"testing"

	"github.com/shrik450/wisdom/internal/api"
)

func TestFuzzyMatchSubsequenceGating(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		candidate string
		wantMatch bool
	}{
		{"exact match", "foo", "foo", true},
		{"subsequence", "fb", "foobar", true},
		{"no match", "xyz", "foobar", false},
		{"case insensitive", "FOO", "foobar", true},
		{"empty query", "", "foobar", false},
		{"query longer than candidate", "foobarx", "foo", false},
		{"path subsequence", "shl", "components/shell.tsx", true},
		{"scattered match", "ct", "components/shell.tsx", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, ok := api.FuzzyMatch(tt.query, tt.candidate)
			if ok != tt.wantMatch {
				t.Errorf("FuzzyMatch(%q, %q) matched=%v, want %v", tt.query, tt.candidate, ok, tt.wantMatch)
			}
		})
	}
}

func TestFuzzyMatchUnicodeLowercaseExpansionDoesNotPanic(t *testing.T) {
	score, ok := api.FuzzyMatch("if", "İfile.md")
	if !ok {
		t.Fatal("expected unicode candidate to match query")
	}
	if score == 0 {
		t.Fatal("expected non-zero score for unicode candidate match")
	}
}

func TestFuzzyMatchScoring(t *testing.T) {
	check := func(t *testing.T, query string, better, worse string) {
		t.Helper()
		scoreBetter, okBetter := api.FuzzyMatch(query, better)
		scoreWorse, okWorse := api.FuzzyMatch(query, worse)
		if !okBetter {
			t.Fatalf("expected %q to match %q", query, better)
		}
		if !okWorse {
			t.Fatalf("expected %q to match %q", query, worse)
		}
		if scoreBetter <= scoreWorse {
			t.Errorf("FuzzyMatch(%q): expected %q (score=%d) > %q (score=%d)",
				query, better, scoreBetter, worse, scoreWorse)
		}
	}

	t.Run("consecutive matches beat scattered", func(t *testing.T) {
		check(t, "shell", "components/shell.tsx", "some/huge/enormous/long/list.txt")
	})

	t.Run("segment start beats mid-word", func(t *testing.T) {
		check(t, "fm", "foo/main.go", "iformatics.txt")
	})

	t.Run("filename matches beat directory matches", func(t *testing.T) {
		// "foo" in the filename (src/foo.md) beats "foo" only in a directory name
		check(t, "foo", "src/foo.md", "foo/bar/baz.md")
	})

	t.Run("shorter paths preferred on similar match", func(t *testing.T) {
		check(t, "foo", "foo.txt", "a/b/c/d/foo.txt")
	})

	t.Run("exact filename match beats partial", func(t *testing.T) {
		check(t, "shell", "components/shell.tsx", "components/shell-actions.tsx")
	})
}
