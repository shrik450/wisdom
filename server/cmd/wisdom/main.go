package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/shrik450/wisdom/internal/api"
	"github.com/shrik450/wisdom/internal/middleware"
	"github.com/shrik450/wisdom/internal/ui"
	"github.com/shrik450/wisdom/internal/workspace"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))

	ws, err := workspace.Default()
	if err != nil {
		logger.Error("workspace init", "err", err)
		os.Exit(1)
	}

	var uiDir string
	if os.Getenv("WISDOM_DEV") == "1" {
		cwd, err := os.Getwd()
		if err != nil {
			logger.Error("get working directory", "err", err)
			os.Exit(1)
		}
		uiDir, err = filepath.Abs(filepath.Join(cwd, "..", "ui"))
		if err != nil {
			logger.Error("resolve ui directory", "err", err)
			os.Exit(1)
		}
	} else {
		uiDir, err = ws.Resolve("ui")
		if err != nil {
			logger.Error("resolve ui directory from workspace", "err", err)
			os.Exit(1)
		}
	}

	builder, err := ui.StartWatching(uiDir)
	if err != nil {
		logger.Error("ui build failed", "err", err)
		os.Exit(1)
	}
	defer builder.Close()

	port := os.Getenv("WISDOM_PORT")
	if port == "" {
		port = "8080"
	}

	addr := os.Getenv("WISDOM_ADDR")
	addrStr := addr + ":" + port

	mux := http.NewServeMux()
	mux.Handle("/api/", api.APIHandler())
	mux.Handle("/", ui.FileServer(uiDir))

	handler := middleware.RequestLogger(mux, logger)
	handler = middleware.WithWorkspace(handler, ws)

	server := &http.Server{
		Addr:         addrStr,
		Handler:      handler,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// We have to catch SIGTERM or an interrupt ourselves as we have to ensure
	// the esbuild builder is closed

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	select {
	case <-stop:
	case err := <-errCh:
		logger.Error("server error", "err", err)
	}

	shutdownErr := server.Shutdown(context.Background())
	if shutdownErr != nil {
		logger.Error("shutdown error", "err", shutdownErr)
	}
}
