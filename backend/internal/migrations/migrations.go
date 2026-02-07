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

type appliedMigration struct {
	version int
	name    string
}

func Apply(ctx context.Context, db *sql.DB, migrationsDir string) error {
	if err := ensureSchemaMigrationsTable(ctx, db); err != nil {
		return err
	}

	files, filesByVersion, err := collectMigrationFiles(migrationsDir)
	if err != nil {
		return err
	}

	applied, err := alreadyApplied(ctx, db)
	if err != nil {
		return err
	}

	if err := validateAppliedState(files, filesByVersion, applied); err != nil {
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

func ValidateState(ctx context.Context, db *sql.DB, migrationsDir string) error {
	files, filesByVersion, err := collectMigrationFiles(migrationsDir)
	if err != nil {
		return err
	}

	applied, err := alreadyApplied(ctx, db)
	if err != nil {
		return err
	}

	if err := validateAppliedState(files, filesByVersion, applied); err != nil {
		return err
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

func alreadyApplied(ctx context.Context, db *sql.DB) (map[int]appliedMigration, error) {
	rows, err := db.QueryContext(ctx, "SELECT version, name FROM schema_migrations")
	if err != nil {
		return nil, fmt.Errorf("query applied migrations: %w", err)
	}
	defer rows.Close()

	versions := make(map[int]appliedMigration)
	for rows.Next() {
		var migration appliedMigration
		if err := rows.Scan(&migration.version, &migration.name); err != nil {
			return nil, fmt.Errorf("scan applied migration version: %w", err)
		}

		if strings.TrimSpace(migration.name) == "" {
			return nil, fmt.Errorf("applied migration %d has empty name", migration.version)
		}

		versions[migration.version] = migration
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate applied migrations: %w", err)
	}

	return versions, nil
}

func collectMigrationFiles(migrationsDir string) ([]migrationFile, map[int]migrationFile, error) {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return nil, nil, fmt.Errorf("read migrations directory: %w", err)
	}

	files := make([]migrationFile, 0, len(entries))
	filesByVersion := make(map[int]migrationFile, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}

		version, err := parseVersion(entry.Name())
		if err != nil {
			return nil, nil, fmt.Errorf("parse migration version %s: %w", entry.Name(), err)
		}

		if previous, ok := filesByVersion[version]; ok {
			return nil, nil, fmt.Errorf("duplicate migration version %d: %s and %s", version, previous.name, entry.Name())
		}

		file := migrationFile{
			version: version,
			name:    entry.Name(),
			path:    filepath.Join(migrationsDir, entry.Name()),
		}

		files = append(files, file)
		filesByVersion[version] = file
	}

	sort.Slice(files, func(i int, j int) bool {
		return files[i].version < files[j].version
	})

	return files, filesByVersion, nil
}

func parseVersion(name string) (int, error) {
	prefix, suffix, ok := strings.Cut(name, "_")
	if !ok {
		return 0, fmt.Errorf("migration filename must start with '<version>_': %s", name)
	}

	if strings.TrimSpace(suffix) == "" {
		return 0, fmt.Errorf("migration filename must include a name after version prefix: %s", name)
	}

	version, err := strconv.Atoi(prefix)
	if err != nil {
		return 0, fmt.Errorf("invalid migration version prefix %q: %w", prefix, err)
	}

	if version <= 0 {
		return 0, fmt.Errorf("migration version must be positive: %d", version)
	}

	return version, nil
}

func validateAppliedState(
	files []migrationFile,
	filesByVersion map[int]migrationFile,
	applied map[int]appliedMigration,
) error {
	for version, record := range applied {
		file, ok := filesByVersion[version]
		if !ok {
			return fmt.Errorf("unknown applied migration version %d (%s)", version, record.name)
		}

		if file.name != record.name {
			return fmt.Errorf(
				"applied migration mismatch for version %d: database has %s, file is %s",
				version,
				record.name,
				file.name,
			)
		}
	}

	firstUnapplied := 0
	for _, file := range files {
		_, isApplied := applied[file.version]
		if !isApplied {
			if firstUnapplied == 0 {
				firstUnapplied = file.version
			}
			continue
		}

		if firstUnapplied != 0 {
			return fmt.Errorf(
				"partial migration state: version %d is applied while earlier version %d is not",
				file.version,
				firstUnapplied,
			)
		}
	}

	return nil
}
