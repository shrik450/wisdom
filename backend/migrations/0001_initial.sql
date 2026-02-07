CREATE TABLE IF NOT EXISTS documents (
    doc_id TEXT PRIMARY KEY,
    relative_path TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK(role IN ('primary', 'shadow')),
    origin TEXT NOT NULL CHECK(origin IN ('manual', 'import')),
    adapter TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    content_hash TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(relative_path);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at);

CREATE TABLE IF NOT EXISTS backlinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_doc_id TEXT NOT NULL,
    source_segment_json TEXT,
    target_doc_id TEXT NOT NULL,
    target_segment_json TEXT,
    content TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(source_doc_id) REFERENCES documents(doc_id),
    FOREIGN KEY(target_doc_id) REFERENCES documents(doc_id)
);

CREATE INDEX IF NOT EXISTS idx_backlinks_source ON backlinks(source_doc_id);
CREATE INDEX IF NOT EXISTS idx_backlinks_target ON backlinks(target_doc_id);

CREATE TABLE IF NOT EXISTS sync_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    payload_json TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON sync_events(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS tombstones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tombstones_entity ON tombstones(entity_type, entity_id);
