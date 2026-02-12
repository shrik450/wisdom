package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/shrik450/wisdom/internal/ui"
)

func main() {
	cwd, err := os.Getwd()
	if err != nil {
		log.Fatalf("get working directory: %v", err)
	}

	uiDir, err := filepath.Abs(filepath.Join(cwd, "..", "ui"))
	if err != nil {
		log.Fatalf("resolve ui directory: %v", err)
	}

	builder, err := ui.StartWatching(uiDir)
	if err != nil {
		log.Fatalf("ui build failed: %v", err)
	}
	defer builder.Close()

	handler := ui.FileServer(uiDir)
	server := &http.Server{
		Addr:         ":8080",
		Handler:      handler,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 10 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	go func() {
		log.Printf("listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	shutdownErr := server.Close()
	if shutdownErr != nil {
		log.Printf("shutdown error: %v", shutdownErr)
	}
}
