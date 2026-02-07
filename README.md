# Wisdom

Wisdom is a self-hosted personal knowledge base that combines a focused reader
with note-taking. It is built for people who want the reading ergonomics of
Readwise/Reader and the long-form thinking workflow of Obsidian.

## Vision

Read, annotate, and think in one place. Books and articles are first-class
inputs, while standalone notes and journaling are first-class outputs.

## Core Architectural Idea

Everything in Wisdom is a document: books, articles, notes, and eventually
audio/video.

Wisdom defines stable ways to address parts of a document (for example
sections, text ranges, or timestamps). Backlinks target either whole documents
or addressed segments. An annotation is a backlink to a segment with attached
note content.

## Terminology

- Document: any first-class item in Wisdom (source content, notes, journals,
  shadow docs).
- Source document: imported reading/listening material such as a book or
  article.
- Shadow document: companion document for a source document that stores reading
  artifacts such as highlights and inline annotations.
- Segment: an addressable part of a document, such as a section, text range, or
  timestamp.
- Backlink: a directed link from one document or segment to another document or
  segment.
- Annotation: a backlink to a specific segment with attached note content.
- Standalone note: a document not tied to a source document, used for free-form
  thinking.
- Journal entry: a time-oriented standalone note.

## Who This Is For

- Technical self-hosters who are comfortable building apps themselves.
- Personal use, not App Store distribution.

## v0.1 Scope

v0.1 focuses on the minimum loop: ingest content, read it on iPad, annotate it,
write notes, and sync reliably.

- Self-hosted sync server.
- iPadOS reading app.
- Basic Web UI.
- Inline annotations during reading.
- Standalone notes and journaling.

## Architecture (v0.1)

- Server-first model.
- Filesystem is the source of truth for document content and hierarchy.
- SQLite acts as index, metadata store, and sync state.
- Local app database syncs content, highlights, and notes to the server at
  regular intervals.
- Conflict handling is last-write-wins.

## Content Model

- Initial content types: books and articles.
- The model generalizes to any document type over time.
- Each source can have a companion shadow document for highlights and reading
  annotations.
- Standalone notes and journal entries are first-class content, independent of
  source documents.
- Backlinks can point to source documents, shadow documents, standalone notes,
  or specific segments inside them.

## Security Model (v0.1)

Single-user deployment with user-managed HTTP Basic Auth. Client apps are
configured with those credentials.

## Deferred (Post v0.1)

- RSS ingestion and automatic article pull.
- Search and indexing.
- AI features (server-side only when added).
- Additional media types such as video and podcasts.

## Non-Goals

- Social features.
- Public sharing/network features.
- Team workspaces/collaboration.

## Initial Technical Requirements (for stack selection)

- Simple single-user self-host deployment.
- Reliable sync API for document and note state.
- Data model that supports documents, segments, backlinks, and shadow docs.
- HTTP Basic Auth support end-to-end.
- Room to add RSS and search without redesigning core entities.
