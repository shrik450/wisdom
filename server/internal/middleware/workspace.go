package middleware

import (
	"net/http"

	"github.com/shrik450/wisdom/internal/workspace"
)

func WithWorkspace(next http.Handler, ws *workspace.Workspace) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r = r.WithContext(workspace.WithContext(r.Context(), ws))
		next.ServeHTTP(w, r)
	})
}
