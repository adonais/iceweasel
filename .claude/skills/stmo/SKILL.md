---
name: stmo
description: >
  Manage Redash queries and dashboards on Mozilla's STMO (sql.telemetry.mozilla.org)
  using stmo-cli. Use when the user wants to explore telemetry data on STMO, write,
  deploy, or execute Redash queries, manage dashboards, or discover data sources.
  Also trigger on mentions of STMO, Redash, sql.telemetry.mozilla.org, or when the
  user wants to query Mozilla telemetry data (as opposed to probe/metric discovery,
  which is mozdata territory).
allowed-tools:
  - Bash(stmo-cli:*)
  - Bash(mkdir:*)
  - Read
  - Grep
  - Glob
---

# stmo-cli

## Command reference and workflow

Before anything else, run `stmo-cli guide`. It prints the workflow guidance and a command
reference generated from the installed version. If `guide` is not a recognized command
(older builds bundled elsewhere), run `stmo-cli --help` instead. Treat that output as the
source of truth for commands, flags, file formats, SQL style, and workflows.

## Prerequisites

Before running any stmo-cli command (except `init` and `update`), verify `REDASH_API_KEY` is set. If missing, every command fails immediately with:

```
Error: REDASH_API_KEY environment variable not set
```

To get the key, go to `https://sql.telemetry.mozilla.org/users/me` (API Key section), copy the key, and export it:

```bash
export REDASH_API_KEY=your_key_here
```

If `stmo-cli` is not available, install it via `./mach bootstrap`.

## Working directory

stmo-cli creates `queries/` and `dashboards/` relative to the current directory. Never run file-creating commands from the Firefox repo tree. Always use the `artifacts/stmo/` directory, which is already VCS-ignored:

```bash
mkdir -p artifacts/stmo
cd artifacts/stmo
```

Queries created during exploration are ephemeral by default.

## Cleanup

Archive only what you created during exploration and don't want to keep. Archiving hides the query in Redash (`unarchive` restores it) and deletes its local `queries/` files. Do **not** archive queries you only fetched to read, because that removes the local copies you still need.

## mozdata integration

Use the mozdata MCP tools (`mozdata:probe-discovery`, `mozdata:query-writing`) to find the right telemetry probes, metrics, and table schemas. Then use stmo-cli to write, deploy, and execute the actual Redash queries.
