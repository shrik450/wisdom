package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"
)

type searchResult struct {
	Path  string `json:"path"`
	Score int    `json:"score"`
	IsDir bool   `json:"isDir"`
}

func TestSearchPaths(t *testing.T) {
	srv, ws := newTestServer(t)

	// Create test workspace structure.
	for _, dir := range []string{"notes", "notes/daily", "books", "empty-dir"} {
		if err := ws.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for _, file := range []string{
		"notes/hello.md",
		"notes/daily/2024-01-01.md",
		"books/mybook.epub",
		"readme.txt",
	} {
		if err := ws.WriteFile(file, []byte(""), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	check := func(t *testing.T, query string, limit string, wantStatus int) []searchResult {
		t.Helper()
		url := srv.URL + "/api/search/paths?q=" + query
		if limit != "" {
			url += "&limit=" + limit
		}
		resp := doRequest(t, http.MethodGet, url, nil)
		defer resp.Body.Close()
		if resp.StatusCode != wantStatus {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("status=%d, want %d, body=%s", resp.StatusCode, wantStatus, body)
		}
		if wantStatus != http.StatusOK {
			return nil
		}
		var results []searchResult
		if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
			t.Fatal(err)
		}
		return results
	}

	t.Run("basic search returns results", func(t *testing.T) {
		results := check(t, "hello", "", http.StatusOK)
		if len(results) == 0 {
			t.Fatal("expected results")
		}
		if results[0].Path != "notes/hello.md" {
			t.Errorf("top result = %s, want notes/hello.md", results[0].Path)
		}
	})

	t.Run("empty query returns empty array", func(t *testing.T) {
		results := check(t, "", "", http.StatusOK)
		if len(results) != 0 {
			t.Errorf("expected empty results for empty query, got %d", len(results))
		}
	})

	t.Run("no matches returns empty array", func(t *testing.T) {
		results := check(t, "zzzzzzz", "", http.StatusOK)
		if len(results) != 0 {
			t.Errorf("expected empty results, got %d", len(results))
		}
	})

	t.Run("limit is respected", func(t *testing.T) {
		results := check(t, "o", "1", http.StatusOK)
		if len(results) > 1 {
			t.Errorf("expected at most 1 result, got %d", len(results))
		}
	})

	t.Run("directory entries marked as isDir", func(t *testing.T) {
		results := check(t, "notes", "", http.StatusOK)
		found := false
		for _, r := range results {
			if r.Path == "notes" && r.IsDir {
				found = true
			}
		}
		if !found {
			t.Error("expected 'notes' to appear as a directory result")
		}
	})

	t.Run("empty directories are marked as isDir", func(t *testing.T) {
		results := check(t, "empty-dir", "", http.StatusOK)
		found := false
		for _, r := range results {
			if r.Path == "empty-dir" && r.IsDir {
				found = true
			}
		}
		if !found {
			t.Error("expected 'empty-dir' to appear as a directory result")
		}
	})

	t.Run("POST not allowed", func(t *testing.T) {
		resp := doRequest(t, http.MethodPost, srv.URL+"/api/search/paths?q=test", nil)
		resp.Body.Close()
		if resp.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("status=%d, want 405", resp.StatusCode)
		}
	})

	t.Run("unicode lowercase-expansion paths do not crash search", func(t *testing.T) {
		if err := ws.WriteFile("notes/İfile.md", []byte(""), 0o644); err != nil {
			t.Fatal(err)
		}
		resp := doRequest(t, http.MethodGet, srv.URL+"/api/search/paths?q=if", nil)
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("status=%d, want 200, body=%s", resp.StatusCode, body)
		}
	})
}
