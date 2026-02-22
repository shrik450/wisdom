package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/shrik450/wisdom/internal/workspace"
)

const (
	defaultSearchLimit = 20
	maxSearchLimit     = 50
)

func searchPathsHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.Header().Set("Allow", "GET")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		query := strings.TrimSpace(r.URL.Query().Get("q"))
		if query == "" {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("[]"))
			return
		}

		limit := defaultSearchLimit
		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
				limit = n
			}
		}
		if limit > maxSearchLimit {
			limit = maxSearchLimit
		}

		ws := workspace.FromContext(r.Context())
		// TODO: WalkFiles is called on every search request with no caching.
		// The client debounces to limit frequency; a workspace-level cache with
		// filesystem watches would be the next step if this becomes a bottleneck.
		entries, err := ws.WalkFiles()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		results := FuzzySearch(query, entries, limit)
		if results == nil {
			results = []FuzzyResult{}
		}

		data, err := json.Marshal(results)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	})
}
