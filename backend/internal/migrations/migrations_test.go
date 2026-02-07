package migrations

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"wisdom/backend/internal/store/sqlite"
)

func TestApplyOrdersAndIsIdempotent(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrationsDir := filepath.Join(root, "migrations")

	writeMigrationFile(t, migrationsDir, "0002_second.sql", "CREATE TABLE IF NOT EXISTS second_table (id INTEGER PRIMARY KEY);")
	writeMigrationFile(t, migrationsDir, "0001_first.sql", "CREATE TABLE IF NOT EXISTS first_table (id INTEGER PRIMARY KEY);")

	db := openTestDB(t, filepath.Join(root, "wisdom.db"))

	if err := Apply(ctx, db, migrationsDir); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	versions := queryAppliedMigrationVersions(t, db)
	if len(versions) != 2 {
		t.Fatalf("expected 2 applied migrations, got %d", len(versions))
	}

	if versions[0].version != 1 || versions[0].name != "0001_first.sql" {
		t.Fatalf("unexpected first migration record: %+v", versions[0])
	}

	if versions[1].version != 2 || versions[1].name != "0002_second.sql" {
		t.Fatalf("unexpected second migration record: %+v", versions[1])
	}

	if err := Apply(ctx, db, migrationsDir); err != nil {
		t.Fatalf("re-apply migrations: %v", err)
	}

	count := countAppliedMigrations(t, db)
	if count != 2 {
		t.Fatalf("expected 2 applied migrations after rerun, got %d", count)
	}
}

func TestApplyFailsOnUnknownAppliedMigration(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrationsDir := filepath.Join(root, "migrations")

	writeMigrationFile(t, migrationsDir, "0001_initial.sql", "CREATE TABLE IF NOT EXISTS docs (id INTEGER PRIMARY KEY);")

	db := openTestDB(t, filepath.Join(root, "wisdom.db"))
	if err := Apply(ctx, db, migrationsDir); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}

	if _, err := db.Exec("INSERT INTO schema_migrations(version, name, applied_at) VALUES(99, '0099_manual.sql', '2026-01-01T00:00:00Z')"); err != nil {
		t.Fatalf("insert unknown migration: %v", err)
	}

	if err := Apply(ctx, db, migrationsDir); err == nil {
		t.Fatal("expected unknown applied migration error")
	}
}

func TestApplyFailsOnMalformedMigrationFilename(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrationsDir := filepath.Join(root, "migrations")

	writeMigrationFile(t, migrationsDir, "badname.sql", "SELECT 1;")

	db := openTestDB(t, filepath.Join(root, "wisdom.db"))
	if err := Apply(ctx, db, migrationsDir); err == nil {
		t.Fatal("expected malformed migration filename error")
	}
}

func TestApplyFailsOnPartialMigrationState(t *testing.T) {
	ctx := context.Background()
	root := t.TempDir()
	migrationsDir := filepath.Join(root, "migrations")

	writeMigrationFile(t, migrationsDir, "0001_first.sql", "CREATE TABLE IF NOT EXISTS first_table (id INTEGER PRIMARY KEY);")
	writeMigrationFile(t, migrationsDir, "0002_second.sql", "CREATE TABLE IF NOT EXISTS second_table (id INTEGER PRIMARY KEY);")

	db := openTestDB(t, filepath.Join(root, "wisdom.db"))

	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
)
`); err != nil {
		t.Fatalf("create schema_migrations table: %v", err)
	}

	if _, err := db.Exec("INSERT INTO schema_migrations(version, name, applied_at) VALUES(2, '0002_second.sql', '2026-01-01T00:00:00Z')"); err != nil {
		t.Fatalf("insert partial migration state: %v", err)
	}

	if err := Apply(ctx, db, migrationsDir); err == nil {
		t.Fatal("expected partial migration state error")
	}
}

func openTestDB(t *testing.T, dbPath string) *sql.DB {
	t.Helper()

	db, err := sqlite.Open(dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	t.Cleanup(func() {
		_ = db.Close()
	})

	return db
}

func writeMigrationFile(t *testing.T, migrationsDir string, name string, statements string) {
	t.Helper()

	if err := os.MkdirAll(migrationsDir, 0o755); err != nil {
		t.Fatalf("create migrations dir: %v", err)
	}

	path := filepath.Join(migrationsDir, name)
	if err := os.WriteFile(path, []byte(statements), 0o644); err != nil {
		t.Fatalf("write migration file %s: %v", name, err)
	}
}

func queryAppliedMigrationVersions(t *testing.T, db *sql.DB) []appliedMigration {
	t.Helper()

	rows, err := db.Query("SELECT version, name FROM schema_migrations ORDER BY version")
	if err != nil {
		t.Fatalf("query applied migrations: %v", err)
	}
	defer rows.Close()

	var versions []appliedMigration
	for rows.Next() {
		var record appliedMigration
		if err := rows.Scan(&record.version, &record.name); err != nil {
			t.Fatalf("scan applied migration: %v", err)
		}
		versions = append(versions, record)
	}

	if err := rows.Err(); err != nil {
		t.Fatalf("iterate applied migrations: %v", err)
	}

	return versions
}

func countAppliedMigrations(t *testing.T, db *sql.DB) int {
	t.Helper()

	row := db.QueryRow("SELECT COUNT(*) FROM schema_migrations")
	var count int
	if err := row.Scan(&count); err != nil {
		t.Fatalf("count applied migrations: %v", err)
	}

	return count
}
