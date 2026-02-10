# Wisdom

Wisdom is a personal knowledge base and reading system the bridges the gap
between something like Obsidian (purely for note taking and knowledge base) and
Readwise Reader (purely for reading and annotating your reading.) Wisdom works
like Obsidian (files on a filesystem as the source of truth with a database
providing an index on top of them) but enriches its model with features like
reading books, annotating, ingest workflows for content like YouTube videos or
podcast episodes and automations.

Powering Wisdom is a very flexible core:

1. A regular file hierarchy: your Wisdom workspace, including all of your
   content, is just files on a filesystem, served by the Wisdom server.
2. Runner: Wisdom can _run_ scripts or binaries in the Wisdom workspace. These
   can be any executable files, so you can write these in any language.
3. Watches: Wisdom can watch a folder and run your code when a file is created,
   modified or deleted.
4. Cron: Wisdom comes with a crontab implementation so you can run your code
   automatically at certain times.
5. Views: Your files can have rich views that allow interacting with them.
6. Index: Wisdom automatically indexes all plain text content and allows you to
   perform Full Text and fuzzy search on them, and using a simple backlinking
   format spec, allows you to link to and from your content and annotate it.

Wisdom comes with batteries included. You get:

1. A great, responsive WebUI over your filesystem;
2. Great, powerful views for reading books and articles and writing notes;
3. An inbox to dump things into, and good ingest scripts to handle web articles;
4. An "annotations" view for books and articles that allows you to have the
   annotated reading workflow.
5. A daily journaling system that creates new journal entries for you based on
   a template.

This core is extensible to all sorts of use cases beyond the reading and note
taking ones - you can build all of OpenClaw using the features in wisdom, for
example!

## Getting started

Download a binary for your platform from GitHub releases and run it with the
`WISDOM_WORKSPACE_ROOT` environment variable set. That's all you need -  all
further configuration is optional and will live in the workspace as a TOML
file.

## Non-goals

Wisdom does a lot, but some things are deliberately kept out of scope for it:

1. Multi-tenancy: Wisdom doesn't handle users or authorization. You can try to
   jerry rig this, but you should instead have multiple wisdom workspaces with
   multiple users.
2. Authentication: Wisdom isn't responsible for authentication. Put it behind a
   reverse proxy with HTTP basic auth, or keep it behind a wireguard VPN like
   Tailscale.
3. Excessive hardening: Wisdom is for consenting adults - you can do what you
   want to do, including shooting your foot.
4. Package management and sharing scripts: you can do this the old way with
   rsync.
