package migrations

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
)

type migrationFile struct {
	version int
	name    string
	path    string
}

func Apply(ctx context.Context, db *sql.DB, migrationsDir string) error {
	if err := ensureSchemaMigrationsTable(ctx, db); err != nil {
		return err
	}

	files, err := collectMigrationFiles(migrationsDir)
	if err != nil {
		return err
	}

	applied, err := alreadyApplied(ctx, db)
	if err != nil {
		return err
	}

	for _, file := range files {
		if _, ok := applied[file.version]; ok {
			continue
		}

		statementBytes, err := os.ReadFile(file.path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", file.name, err)
		}

		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			return fmt.Errorf("begin migration transaction %s: %w", file.name, err)
		}

		if _, err := tx.ExecContext(ctx, string(statementBytes)); err != nil {
			tx.Rollback()
			return fmt.Errorf("apply migration %s: %w", file.name, err)
		}

		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO schema_migrations(version, name, applied_at) VALUES(?, ?, ?)",
			file.version,
			file.name,
			time.Now().UTC().Format(time.RFC3339Nano),
		); err != nil {
			tx.Rollback()
			return fmt.Errorf("record migration %s: %w", file.name, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", file.name, err)
		}
	}

	return nil
}

func ensureSchemaMigrationsTable(ctx context.Context, db *sql.DB) error {
	_, err := db.ExecContext(ctx, `
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        );
    `)
	if err != nil {
		return fmt.Errorf("ensure schema_migrations table: %w", err)
	}
	return nil
}

func alreadyApplied(ctx context.Context, db *sql.DB) (map[int]struct{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT version FROM schema_migrations")
	if err != nil {
		return nil, fmt.Errorf("query applied migrations: %w", err)
	}
	defer rows.Close()

	versions := make(map[int]struct{})
	for rows.Next() {
		var version int
		if err := rows.Scan(&version); err != nil {
			return nil, fmt.Errorf("scan applied migration version: %w", err)
		}
		versions[version] = struct{}{}
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate applied migrations: %w", err)
	}

	return versions, nil
}

func collectMigrationFiles(migrationsDir string) ([]migrationFile, error) {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return nil, fmt.Errorf("read migrations directory: %w", err)
	}

	files := make([]migrationFile, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		version, err := parseVersion(entry.Name())
		if err != nil {
			return nil, fmt.Errorf("parse migration version %s: %w", entry.Name(), err)
		}

		files = append(files, migrationFile{
			version: version,
			name:    entry.Name(),
			path:    filepath.Join(migrationsDir, entry.Name()),
		})
	}

	sort.Slice(files, func(i int, j int) bool {
		return files[i].version < files[j].version
	})

	return files, nil
}

func parseVersion(name string) (int, error) {
	prefix, _, ok := strings.Cut(name, "_")
	if !ok {
		return 0, fmt.Errorf("migration filename must start with '<version>_': %s", name)
	}
	version, err := strconv.Atoi(prefix)
	if err != nil {
		return 0, fmt.Errorf("invalid migration version prefix %q: %w", prefix, err)
	}
	return version, nil
}
