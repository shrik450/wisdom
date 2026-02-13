package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/shrik450/wisdom/internal/api"
	"github.com/shrik450/wisdom/internal/middleware"
	"github.com/shrik450/wisdom/internal/workspace"
)

type dirEntry struct {
	Name    string    `json:"name"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	IsDir   bool      `json:"isDir"`
}

func newTestServer(t *testing.T) (*httptest.Server, *workspace.Workspace) {
	t.Helper()
	ws, err := workspace.New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	handler := middleware.WithWorkspace(api.APIHandler(), ws)
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	return srv, ws
}

func doRequest(t *testing.T, method, url string, body io.Reader) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, body)
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestGet(t *testing.T) {
	srv, ws := newTestServer(t)

	if err := ws.WriteFile("hello.txt", []byte("hello world"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := ws.MkdirAll("notes", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := ws.WriteFile("notes/a.md", []byte("# A"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Run("read file", func(t *testing.T) {
		resp := doRequest(t, "GET", srv.URL+"/api/fs/hello.txt", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		body, _ := io.ReadAll(resp.Body)
		if string(body) != "hello world" {
			t.Fatalf("got %q", body)
		}
	})

	t.Run("content-type detection", func(t *testing.T) {
		resp := doRequest(t, "GET", srv.URL+"/api/fs/hello.txt", nil)
		defer resp.Body.Close()

		ct := resp.Header.Get("Content-Type")
		if !strings.HasPrefix(ct, "text/plain") {
			t.Fatalf("expected text/plain content-type, got %q", ct)
		}
	})

	t.Run("list directory", func(t *testing.T) {
		resp := doRequest(t, "GET", srv.URL+"/api/fs/notes", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var entries []dirEntry
		if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
			t.Fatal(err)
		}
		if len(entries) != 1 || entries[0].Name != "a.md" {
			t.Fatalf("unexpected entries: %+v", entries)
		}
	})

	t.Run("list root", func(t *testing.T) {
		resp := doRequest(t, "GET", srv.URL+"/api/fs/", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var entries []dirEntry
		if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
			t.Fatal(err)
		}

		names := make(map[string]bool)
		for _, e := range entries {
			names[e.Name] = true
		}
		if !names["hello.txt"] || !names["notes"] {
			t.Fatalf("expected hello.txt and notes in root listing, got %+v", entries)
		}
	})

	t.Run("404 for missing file", func(t *testing.T) {
		resp := doRequest(t, "GET", srv.URL+"/api/fs/nope.txt", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 404 {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("binary roundtrip", func(t *testing.T) {
		data := []byte{0x00, 0xFF, 0x89, 0x50, 0x4E, 0x47}
		if err := ws.WriteFile("binary.bin", data, 0o644); err != nil {
			t.Fatal(err)
		}

		resp := doRequest(t, "GET", srv.URL+"/api/fs/binary.bin", nil)
		defer resp.Body.Close()

		got, _ := io.ReadAll(resp.Body)
		if !bytes.Equal(got, data) {
			t.Fatalf("binary content mismatch")
		}
	})
}

func TestHead(t *testing.T) {
	srv, ws := newTestServer(t)

	if err := ws.WriteFile("doc.txt", []byte("some content"), 0o644); err != nil {
		t.Fatal(err)
	}

	t.Run("returns headers without body", func(t *testing.T) {
		resp := doRequest(t, "HEAD", srv.URL+"/api/fs/doc.txt", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}
		body, _ := io.ReadAll(resp.Body)
		if len(body) != 0 {
			t.Fatalf("expected empty body for HEAD, got %d bytes", len(body))
		}
		if resp.Header.Get("Content-Type") == "" {
			t.Fatal("expected Content-Type header")
		}
	})

	t.Run("404 for missing", func(t *testing.T) {
		resp := doRequest(t, "HEAD", srv.URL+"/api/fs/nope.txt", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 404 {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestPutFile(t *testing.T) {
	srv, ws := newTestServer(t)

	t.Run("create new file", func(t *testing.T) {
		resp := doRequest(t, "PUT", srv.URL+"/api/fs/new.txt", strings.NewReader("new content"))
		defer resp.Body.Close()

		if resp.StatusCode != 201 {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		got, _ := ws.ReadFile("new.txt")
		if string(got) != "new content" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("update existing file", func(t *testing.T) {
		resp := doRequest(t, "PUT", srv.URL+"/api/fs/new.txt", strings.NewReader("updated"))
		defer resp.Body.Close()

		if resp.StatusCode != 204 {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
		got, _ := ws.ReadFile("new.txt")
		if string(got) != "updated" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("auto-create parents", func(t *testing.T) {
		resp := doRequest(t, "PUT", srv.URL+"/api/fs/deep/nested/file.txt", strings.NewReader("deep"))
		defer resp.Body.Close()

		if resp.StatusCode != 201 {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		got, _ := ws.ReadFile("deep/nested/file.txt")
		if string(got) != "deep" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("Last-Modified header set", func(t *testing.T) {
		resp := doRequest(t, "PUT", srv.URL+"/api/fs/timestamped.txt", strings.NewReader("x"))
		defer resp.Body.Close()

		if resp.Header.Get("Last-Modified") == "" {
			t.Fatal("expected Last-Modified header")
		}
	})
}

func TestPutMkdir(t *testing.T) {
	srv, ws := newTestServer(t)

	t.Run("create directory", func(t *testing.T) {
		resp := doRequest(t, "PUT", srv.URL+"/api/fs/newdir?mkdir", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 201 {
			t.Fatalf("expected 201, got %d", resp.StatusCode)
		}
		info, err := ws.Stat("newdir")
		if err != nil {
			t.Fatal(err)
		}
		if !info.IsDir() {
			t.Fatal("expected directory")
		}
	})
}

func TestDelete(t *testing.T) {
	srv, ws := newTestServer(t)

	t.Run("delete existing file", func(t *testing.T) {
		if err := ws.WriteFile("bye.txt", []byte("gone"), 0o644); err != nil {
			t.Fatal(err)
		}

		resp := doRequest(t, "DELETE", srv.URL+"/api/fs/bye.txt", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 204 {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
		if _, err := ws.Stat("bye.txt"); err == nil {
			t.Fatal("file still exists")
		}
	})

	t.Run("delete non-existent returns 404", func(t *testing.T) {
		resp := doRequest(t, "DELETE", srv.URL+"/api/fs/nope.txt", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 404 {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("delete empty directory", func(t *testing.T) {
		if err := ws.MkdirAll("emptydir", 0o755); err != nil {
			t.Fatal(err)
		}

		resp := doRequest(t, "DELETE", srv.URL+"/api/fs/emptydir", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 204 {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
	})

	t.Run("delete non-empty directory", func(t *testing.T) {
		if err := ws.MkdirAll("fulldir/sub", 0o755); err != nil {
			t.Fatal(err)
		}
		if err := ws.WriteFile("fulldir/a.txt", []byte("a"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := ws.WriteFile("fulldir/sub/b.txt", []byte("b"), 0o644); err != nil {
			t.Fatal(err)
		}

		resp := doRequest(t, "DELETE", srv.URL+"/api/fs/fulldir", nil)
		defer resp.Body.Close()

		if resp.StatusCode != 204 {
			t.Fatalf("expected 204, got %d", resp.StatusCode)
		}
		if _, err := ws.Stat("fulldir"); err == nil {
			t.Fatal("directory still exists")
		}
	})
}

func TestPatch(t *testing.T) {
	srv, ws := newTestServer(t)

	t.Run("rename file", func(t *testing.T) {
		if err := ws.WriteFile("old.txt", []byte("data"), 0o644); err != nil {
			t.Fatal(err)
		}

		body := `{"destination": "renamed.txt"}`
		resp := doRequest(t, "PATCH", srv.URL+"/api/fs/old.txt", strings.NewReader(body))
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			t.Fatalf("expected 200, got %d", resp.StatusCode)
		}

		var entry dirEntry
		if err := json.NewDecoder(resp.Body).Decode(&entry); err != nil {
			t.Fatal(err)
		}
		if entry.Name != "renamed.txt" {
			t.Fatalf("expected name renamed.txt, got %s", entry.Name)
		}

		got, _ := ws.ReadFile("renamed.txt")
		if string(got) != "data" {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("destination outside workspace", func(t *testing.T) {
		if err := ws.WriteFile("safe.txt", []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}

		body := `{"destination": "../../escape.txt"}`
		resp := doRequest(t, "PATCH", srv.URL+"/api/fs/safe.txt", strings.NewReader(body))
		defer resp.Body.Close()

		if resp.StatusCode != 403 {
			t.Fatalf("expected 403, got %d", resp.StatusCode)
		}
	})

	t.Run("non-existent source", func(t *testing.T) {
		body := `{"destination": "dest.txt"}`
		resp := doRequest(t, "PATCH", srv.URL+"/api/fs/ghost.txt", strings.NewReader(body))
		defer resp.Body.Close()

		if resp.StatusCode != 404 {
			t.Fatalf("expected 404, got %d", resp.StatusCode)
		}
	})
}

func TestPathTraversal(t *testing.T) {
	srv, _ := newTestServer(t)

	paths := []string{
		"/api/fs/../../etc/passwd",
		"/api/fs/../../../etc/passwd",
	}

	for _, p := range paths {
		t.Run(p, func(t *testing.T) {
			resp := doRequest(t, "GET", srv.URL+p, nil)
			defer resp.Body.Close()

			// The path may get cleaned by the HTTP stack or rejected by workspace.
			// Either a 403 or 404 is acceptable; 200 is not.
			if resp.StatusCode == 200 {
				t.Fatalf("path traversal should not return 200")
			}
		})
	}
}

func TestMethodNotAllowed(t *testing.T) {
	srv, _ := newTestServer(t)

	resp := doRequest(t, "POST", srv.URL+"/api/fs/test.txt", nil)
	defer resp.Body.Close()

	if resp.StatusCode != 405 {
		t.Fatalf("expected 405, got %d", resp.StatusCode)
	}
}

func TestDirectoryEntryFields(t *testing.T) {
	srv, ws := newTestServer(t)

	if err := ws.MkdirAll("sub", 0o755); err != nil {
		t.Fatal(err)
	}
	if err := ws.WriteFile("sub/file.txt", []byte("contents"), 0o644); err != nil {
		t.Fatal(err)
	}

	resp := doRequest(t, "GET", srv.URL+"/api/fs/sub", nil)
	defer resp.Body.Close()

	var entries []dirEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		t.Fatal(err)
	}

	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	e := entries[0]
	if e.Name != "file.txt" {
		t.Fatalf("expected name file.txt, got %s", e.Name)
	}
	if e.Size != int64(len("contents")) {
		t.Fatalf("expected size %d, got %d", len("contents"), e.Size)
	}
	if e.IsDir {
		t.Fatal("expected IsDir false")
	}
	if e.ModTime.IsZero() {
		t.Fatal("expected non-zero ModTime")
	}
}

func TestPutPathTraversal(t *testing.T) {
	srv, _ := newTestServer(t)

	sentinel := filepath.Join(os.TempDir(), "wisdom-escape-test")
	os.Remove(sentinel)
	t.Cleanup(func() { os.Remove(sentinel) })

	resp := doRequest(t, "PUT", srv.URL+"/api/fs/../../../../../../"+sentinel, strings.NewReader("escaped"))
	defer resp.Body.Close()

	if resp.StatusCode == 201 || resp.StatusCode == 204 {
		t.Fatalf("path traversal PUT should not succeed, got %d", resp.StatusCode)
	}
	if _, err := os.Stat(sentinel); err == nil {
		t.Fatal("path traversal wrote a file outside the workspace")
	}
}
