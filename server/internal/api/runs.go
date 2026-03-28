package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/shrik450/wisdom/internal/runs"
)

func runsHandler(manager *runs.Manager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if manager == nil {
			http.Error(w, "run manager unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		var req runs.CreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid JSON body", http.StatusBadRequest)
			return
		}

		result, err := manager.Create(r.Context(), req)
		if err != nil {
			mapRunError(w, err)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(result)
	})
}

func cancelRunHandler(manager *runs.Manager) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if manager == nil {
			http.Error(w, "run manager unavailable", http.StatusServiceUnavailable)
			return
		}
		if r.Method != http.MethodPost {
			w.Header().Set("Allow", http.MethodPost)
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		if err := manager.Cancel(r.PathValue("id")); err != nil {
			mapRunError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}

func mapRunError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, runs.ErrPathRequired),
		errors.Is(err, runs.ErrInvalidPath),
		errors.Is(err, runs.ErrInvalidCwd),
		errors.Is(err, runs.ErrPathNotFound),
		errors.Is(err, runs.ErrPathNotExecutable),
		errors.Is(err, runs.ErrPathIsDirectory),
		errors.Is(err, runs.ErrCwdNotFound),
		errors.Is(err, runs.ErrCwdNotDirectory):
		http.Error(w, err.Error(), http.StatusBadRequest)
	case errors.Is(err, runs.ErrRunNotFound):
		http.Error(w, err.Error(), http.StatusNotFound)
	case errors.Is(err, runs.ErrShuttingDown):
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
	default:
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}
