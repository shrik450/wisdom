package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/shrik450/wisdom/internal/workspace"
)

type dirEntry struct {
	Name    string    `json:"name"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
	IsDir   bool      `json:"isDir"`
}

func mapError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, workspace.ErrOutsideWorkspace), errors.Is(err, os.ErrPermission):
		http.Error(w, err.Error(), http.StatusForbidden)
	case errors.Is(err, os.ErrNotExist):
		http.Error(w, err.Error(), http.StatusNotFound)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func fsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead:
			handleGet(w, r)
		case http.MethodPut:
			handlePut(w, r)
		case http.MethodDelete:
			handleDelete(w, r)
		case http.MethodPatch:
			handlePatch(w, r)
		default:
			w.Header().Set("Allow", "GET, HEAD, PUT, DELETE, PATCH")
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
	})
}

func fsPath(r *http.Request) string {
	p := normalizePath(r.PathValue("path"))
	if p == "." {
		return "."
	}
	return p
}

func normalizePath(p string) string {
	p = strings.TrimPrefix(filepath.Clean(p), "/")
	if p == "" || p == "." {
		return "."
	}
	return p
}

func isProtectedPath(p string) bool {
	return p == "." || p == "ui"
}

func handleGet(w http.ResponseWriter, r *http.Request) {
	ws := workspace.FromContext(r.Context())
	p := fsPath(r)

	info, err := ws.Stat(p)
	if err != nil {
		mapError(w, err)
		return
	}

	if info.IsDir() {
		entries, err := ws.ReadDir(p)
		if err != nil {
			mapError(w, err)
			return
		}

		result := make([]dirEntry, 0, len(entries))
		for _, e := range entries {
			eInfo, err := e.Info()
			if err != nil {
				mapError(w, err)
				return
			}
			result = append(result, dirEntry{
				Name:    e.Name(),
				Size:    eInfo.Size(),
				ModTime: eInfo.ModTime(),
				IsDir:   e.IsDir(),
			})
		}

		data, err := json.Marshal(result)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
		return
	}

	f, err := ws.Open(p)
	if err != nil {
		mapError(w, err)
		return
	}
	defer f.Close()

	http.ServeContent(w, r, info.Name(), info.ModTime(), f)
}

func handlePut(w http.ResponseWriter, r *http.Request) {
	ws := workspace.FromContext(r.Context())
	p := fsPath(r)

	if r.URL.Query().Has("mkdir") {
		if err := ws.MkdirAll(p, 0o755); err != nil {
			mapError(w, err)
			return
		}
		w.WriteHeader(http.StatusCreated)
		return
	}

	_, err := ws.Stat(p)
	isNew := errors.Is(err, os.ErrNotExist)
	if err != nil && !isNew {
		mapError(w, err)
		return
	}

	parent := filepath.Dir(p)
	if parent != "." {
		if err := ws.MkdirAll(parent, 0o755); err != nil {
			mapError(w, err)
			return
		}
	}

	if err := ws.WriteStream(p, r.Body, 0o644); err != nil {
		mapError(w, err)
		return
	}

	info, err := ws.Stat(p)
	if err == nil {
		w.Header().Set("Last-Modified", info.ModTime().UTC().Format(http.TimeFormat))
	}

	if isNew {
		w.WriteHeader(http.StatusCreated)
	} else {
		w.WriteHeader(http.StatusNoContent)
	}
}

func handleDelete(w http.ResponseWriter, r *http.Request) {
	ws := workspace.FromContext(r.Context())
	p := fsPath(r)

	var req struct {
		Force bool `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	if isProtectedPath(p) && !req.Force {
		http.Error(w, "path is protected; set force=true to delete", http.StatusBadRequest)
		return
	}

	if err := ws.Remove(p); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			mapError(w, err)
			return
		}
		if err := ws.RemoveAll(p); err != nil {
			mapError(w, err)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func handlePatch(w http.ResponseWriter, r *http.Request) {
	ws := workspace.FromContext(r.Context())
	p := fsPath(r)

	var req struct {
		Destination string `json:"destination"`
		Force       bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if req.Destination == "" {
		http.Error(w, "destination is required", http.StatusBadRequest)
		return
	}
	dst := normalizePath(req.Destination)
	if (isProtectedPath(p) || isProtectedPath(dst)) && !req.Force {
		http.Error(w, "path is protected; set force=true to move", http.StatusBadRequest)
		return
	}

	dstPath, err := ws.Resolve(dst)
	if err != nil {
		mapError(w, err)
		return
	}
	if _, err := os.Lstat(dstPath); err == nil && !req.Force {
		http.Error(w, "destination exists; set force=true to overwrite", http.StatusBadRequest)
		return
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		mapError(w, err)
		return
	}

	if err := ws.Move(p, dst); err != nil {
		mapError(w, err)
		return
	}

	info, err := os.Lstat(dstPath)
	if err != nil {
		mapError(w, err)
		return
	}

	entry := dirEntry{
		Name:    info.Name(),
		Size:    info.Size(),
		ModTime: info.ModTime(),
		IsDir:   info.IsDir(),
	}

	data, err := json.Marshal(entry)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Last-Modified", info.ModTime().UTC().Format(http.TimeFormat))
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}
