package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"wisdom/backend/internal/config"
	"wisdom/backend/internal/migrations"
	"wisdom/backend/internal/server"
	"wisdom/backend/internal/store/sqlite"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{}))
	cfg := config.Load()

	db, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		logger.Error("failed to open sqlite database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := migrations.Apply(context.Background(), db, "migrations"); err != nil {
		logger.Error("failed to apply migrations", "error", err)
		os.Exit(1)
	}

	httpServer := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      server.NewRouter(logger, db),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("wisdom backend listening", "addr", cfg.HTTPAddr)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("http server failed", "error", err)
			os.Exit(1)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
}
