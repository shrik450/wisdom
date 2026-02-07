package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	HTTPAddr string
	DataDir  string
	DBPath   string
}

func Load() Config {
	dataDir := getEnv("WISDOM_DATA_DIR", filepath.Clean("./data"))
	dbPath := getEnv("WISDOM_DB_PATH", filepath.Join(dataDir, "wisdom.db"))

	return Config{
		HTTPAddr: getEnv("WISDOM_HTTP_ADDR", ":8080"),
		DataDir:  dataDir,
		DBPath:   filepath.Clean(dbPath),
	}
}

func getEnv(key string, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback
	}
	return value
}
