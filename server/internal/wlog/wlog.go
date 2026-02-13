package wlog

import (
	"context"
	"log/slog"
)

type ctxKey struct{}

func WithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, ctxKey{}, logger)
}

func FromContext(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(ctxKey{}).(*slog.Logger); ok {
		return logger
	}
	return slog.Default()
}
