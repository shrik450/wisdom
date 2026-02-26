// Package api provides the HTTP API for the workspace
package api

import "net/http"

func APIHandler() http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/fs/{path...}", fsHandler())
	mux.Handle("/api/search/paths", searchPathsHandler())
	return mux
}
