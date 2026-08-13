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

CLI for managing queries and dashboards on Mozilla's Redash instance (sql.telemetry.mozilla.org).

## Command reference

Before anything else, run `stmo-cli --help`. It prints LLM-optimized, version-matched
output — every command, flag, required YAML field, the slug-derivation rule, enum/date
syntax gotchas, and dynamic date tokens — automatically inside this environment
(`CLAUDECODE` is set). Treat that output as the source of truth for the command surface;
the sections below are workflow guidance it doesn't cover.

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

Queries created during exploration are ephemeral: fetch → execute → archive → done.

The temp directory is not a git repo, so `stmo-cli deploy` (which uses git diff to detect changes) won't work — always use `stmo-cli deploy --all` instead.

## Data exploration workflow

1. **Find data sources** — `stmo-cli data-sources` (inspect one with `--schema`)

2. **Discover existing queries** — `stmo-cli discover` (full-text search across queries and dashboards with `--search`)

3. **Fetch and read an existing query**
   ```bash
   stmo-cli fetch <id>
   # reads: queries/<id>-*.sql and queries/<id>-*.yaml
   ```

4. **Execute** — `stmo-cli execute <id>`; see `--help` for output format, parameters, interactive prompting, and multi-value enum syntax.

5. **Clean up newly created queries**

   If you created a new query (the `id: 0` → deploy flow) and it's not worth keeping, archive it — throwaway queries clutter the Redash account:
   ```bash
   stmo-cli archive <id>
   ```

   If the query is useful or you want to share it with others, leave it in Redash instead. The same applies to dashboards created during exploration — archive with `stmo-cli dashboards archive <slug>` if throwaway, leave if worth sharing.

   Do **not** archive queries or dashboards you only fetched to read — that would delete them from Redash.

   To restore an archived query:
   ```bash
   stmo-cli unarchive <id>
   stmo-cli fetch <id>
   ```

## Quick one-off SQL (no tracked query)

For a single throwaway question, skip the create/deploy/archive cycle above entirely and run SQL directly against a data source:

```bash
stmo-cli data-sources                                   # find the data source ID
echo 'SELECT 1' | stmo-cli execute --data-source <id>   # SQL via stdin
stmo-cli execute --data-source <id> --file scratch.sql  # or from a file
```

This creates no `queries/` file and needs no `archive` afterwards. It has no parameter schema, so `d_*` dynamic date tokens and multi-value enum expansion don't apply — inline concrete values directly in the SQL (e.g. `IN ('release', 'beta')`). `--data-source` can't be combined with a query ID. Reach for the tracked-query workflow above instead when you want to iterate, save, schedule, or share the query.

## Scheduling refreshes

`stmo-cli schedule <id> --interval SECS [--time HH:MM] [--day-of-week N]` sets a query's refresh cadence; `stmo-cli schedule <id> --clear` removes it. This only updates the local YAML — run `stmo-cli deploy` afterwards to push the change to Redash.

## Bootstrap context from existing queries

Before answering a new data question, fetch the user's existing queries to understand what tables, patterns, and SQL style they already use:

```bash
stmo-cli fetch --all
```

Then read the downloaded `.sql` files to learn which tables are queried, how filters are structured, and what metrics are already tracked. This makes new queries fit naturally into the user's existing work.

## Beyond Redash: export and analyze

When Redash isn't sufficient — complex statistics, rich visualizations, or analysis over large result sets — export the raw data and analyze it locally:

```bash
stmo-cli execute <id> --format json --limit 10000 2>/dev/null > data.json
```

From there:
- **DuckDB or SQLite** for SQL-based analysis over the exported data
- **Python + pandas/scipy/numpy** for real statistics (mean/median alone is almost always wrong)
- **Apache Echarts** for rich interactive charts in HTML/JS that handle large datasets well
- **Jinja2** for templating if generating reports

A static website updated via cron (behind SSO) is a proven pattern for sharing results within Mozilla — see the [App Engine static site with IAP runbook](https://docs.google.com/document/d/19GaDXZmppnZs79apvG2PBiCzFj6hKl6rGWlhz3wlSww/edit?tab=t.0#heading=h.s080nn5fdzk8).

## SQL style

STMO queries run on BigQuery. Use BigQuery SQL syntax: backtick-quoted identifiers, `DATE_ADD(date, INTERVAL N DAY)`, `FORMAT_DATE`, `APPROX_COUNT_DISTINCT`, etc.

## Dynamic date tokens

Tracked queries (queries deployed with a real ID, not ephemeral ones) can use `d_*` parameter tokens — e.g. `d_today`, `d_last_7_days` — that stmo-cli resolves client-side before execution. See `stmo-cli --help` for the full token list.

## mozdata integration

Use the mozdata MCP tools (`mozdata:probe-discovery`, `mozdata:query-writing`) to find the right telemetry probes, metrics, and table schemas. Then use stmo-cli to write, deploy, and execute the actual Redash queries.

## Query management

**Create a new query:**

1. Create `queries/0-{slug}.sql` with the SQL

2. Create `queries/0-{slug}.yaml` with metadata — see `stmo-cli --help` for the required fields and the slug-derivation rule (the `{slug}` in both filenames must match it):
   ```yaml
   id: 0
   name: My Query Name
   data_source_id: <id from stmo-cli data-sources>
   options:
     parameters: []
   visualizations: []
   ```
   Both `options` (with `parameters`) and `visualizations` are required even when empty.

   Do **not** add a default Table visualization — Redash creates one automatically for every new query.

3. **For enum parameters**, use YAML multiline format (see `--help` for the exact syntax rule — escaped newlines are not valid):
   ```yaml
   options:
     parameters:
     - name: normalized_channels
       title: normalized_channels
       type: enum
       value:
       - release
       enumOptions: |-
         nightly
         aurora
         beta
         release
         esr
       multiValuesOptions:
         prefix: ''''
         suffix: ''''
         separator: ','
   ```

4. Deploy:
   ```bash
   stmo-cli deploy --all
   ```

5. Sync the server-assigned ID:
   ```bash
   stmo-cli fetch <new-id>  # renames local files to {new-id}-{slug}.*
   ```

## Dashboard management

Dashboards are addressed by slug, not ID. See `stmo-cli --help` for the full `dashboards` subcommand list (`discover`, `fetch`, `deploy`, `archive`, `unarchive`).

Create: `dashboards/0-{slug}.yaml` with `id: 0`, deploy, file auto-renames with real ID.

## Query snippets

Redash [query snippets](https://redash.io/help/user-guide/querying/query-snippets) are reusable SQL fragments (e.g. a shared set of CTEs) that get pasted into a query's editor by typing their `trigger`. Pasting is a one-time text expansion, not a live reference — editing a snippet later does **not** update queries that already pasted it; re-paste (or hand-edit) each affected query after changing a snippet it's used in.

Snippet files are keyed by `trigger`, not `slug`: `snippets/{id}-{trigger}.sql` (the fragment body) + `snippets/{id}-{trigger}.yaml` (metadata: `id`, `trigger`, `description`).

The `.sql` file is **not standalone SQL** — it's a bare list of CTEs (no leading `WITH`, no trailing `SELECT`) meant to be pasted into a larger query, so it can't be run or linted on its own.

**Create a new snippet:** create `snippets/0-{trigger}.sql` + `snippets/0-{trigger}.yaml` with `id: 0`, then `stmo-cli snippets deploy 0` — same auto-rename-to-real-ID pattern as queries and dashboards.

Snippets have no archive concept in Redash: `stmo-cli snippets delete <ids>` removes the snippet on the server **and** deletes the local files in one irreversible step — there's no `unarchive` equivalent. See `stmo-cli --help` for the full `snippets` subcommand list (`list`, `fetch`, `deploy`, `delete`).

## File format

```
queries/{id}-{slug}.sql       # SQL text
queries/{id}-{slug}.yaml      # metadata: name, data_source_id, options, visualizations
dashboards/{id}-{slug}.yaml
snippets/{id}-{trigger}.sql   # fragment body (not standalone SQL — see "Query snippets" above)
snippets/{id}-{trigger}.yaml  # metadata: id, trigger, description
```

New queries/dashboards/snippets use `id: 0` in the filename until deployed.
