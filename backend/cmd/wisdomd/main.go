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

	"wisdom/backend/internal/config"
	"wisdom/backend/internal/migrations"
	"wisdom/backend/internal/server"
	"wisdom/backend/internal/startup"
	"wisdom/backend/internal/store/sqlite"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{}))
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load configuration", "error", err)
		os.Exit(1)
	}

	if err := startup.PrepareFilesystem(cfg); err != nil {
		logger.Error(
			"startup filesystem checks failed",
			"error",
			err,
			"data_dir",
			cfg.DataDir,
			"db_path",
			cfg.DBPath,
			"content_root",
			cfg.ContentRoot,
		)
		os.Exit(1)
	}

	migrationsDir, err := filepath.Abs("migrations")
	if err != nil {
		logger.Error("failed to resolve migrations directory", "error", err)
		os.Exit(1)
	}

	db, err := sqlite.Open(cfg.DBPath)
	if err != nil {
		logger.Error("failed to open sqlite database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := migrations.Apply(context.Background(), db, migrationsDir); err != nil {
		logger.Error("failed to apply migrations", "error", err)
		os.Exit(1)
	}

	startupAt := time.Now().UTC()

	httpServer := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: server.NewRouter(server.RouterOptions{
			Logger:        logger,
			DB:            db,
			HTTPAddr:      cfg.HTTPAddr,
			DataDir:       cfg.DataDir,
			DBPath:        cfg.DBPath,
			ContentRoot:   cfg.ContentRoot,
			MigrationsDir: migrationsDir,
			StartupAt:     startupAt,
		}),
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
