// Package api provides the HTTP API for the workspace
package api

import (
	"net/http"

	"github.com/shrik450/wisdom/internal/runs"
)

type HandlerOptions struct {
	RunManager *runs.Manager
}

func APIHandler(opts HandlerOptions) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/fs/{path...}", fsHandler())
	mux.Handle("/api/search/paths", searchPathsHandler())
	mux.Handle("/api/runs", runsHandler(opts.RunManager))
	mux.Handle("/api/runs/{id}/cancel", cancelRunHandler(opts.RunManager))
	return mux
}
