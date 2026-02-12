// Package ui sets up the ui integration with the server, namely watching the
// UI folder, building it and serving it.
package ui

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

func FileServer(uiDir string) http.Handler {
	indexPath := filepath.Join(uiDir, "index.html")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cleanPath := path.Clean(r.URL.Path)
		if cleanPath == "/" {
			http.ServeFile(w, r, indexPath)
			return
		}

		relPath := strings.TrimPrefix(cleanPath, "/")
		if strings.HasPrefix(relPath, "..") {
			http.ServeFile(w, r, indexPath)
			return
		}

		fullPath := filepath.Join(uiDir, filepath.FromSlash(relPath))
		info, err := os.Stat(fullPath)
		if err == nil && !info.IsDir() {
			http.ServeFile(w, r, fullPath)
			return
		}

		http.ServeFile(w, r, indexPath)
	})
}
