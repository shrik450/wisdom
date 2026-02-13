package ui

import (
	"fmt"
	"os"
	"path/filepath"

	esbuild "github.com/evanw/esbuild/pkg/api"
)

type Builder struct {
	ctx esbuild.BuildContext
}

func StartWatching(uiDir string) (*Builder, error) {
	if !filepath.IsAbs(uiDir) {
		abs, err := filepath.Abs(uiDir)
		if err != nil {
			return nil, fmt.Errorf("resolve ui directory: %w", err)
		}
		uiDir = abs
	}

	distDir := filepath.Join(uiDir, "dist")
	if err := os.MkdirAll(distDir, 0o755); err != nil {
		return nil, fmt.Errorf("create dist dir: %w", err)
	}

	ctx, err := esbuild.Context(esbuild.BuildOptions{
		AbsWorkingDir: uiDir,
		EntryPoints:   []string{"src/main.tsx"},
		Bundle:        true,
		Outfile:       "dist/app.js",
		Format:        esbuild.FormatESModule,
		Platform:      esbuild.PlatformBrowser,
		JSX:           esbuild.JSXTransform,
		LogLevel:      esbuild.LogLevelInfo,
		Write:         true,
		Loader: map[string]esbuild.Loader{
			".ts":  esbuild.LoaderTS,
			".tsx": esbuild.LoaderTSX,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("create esbuild context: %w", err)
	}

	result := ctx.Rebuild()
	if len(result.Errors) > 0 {
		ctx.Dispose()
		return nil, fmt.Errorf("initial ui build failed")
	}

	if err := ctx.Watch(esbuild.WatchOptions{}); err != nil {
		ctx.Dispose()
		return nil, fmt.Errorf("watch ui: %w", err)
	}

	return &Builder{ctx: ctx}, nil
}

func (b *Builder) Close() {
	b.ctx.Dispose()
}
