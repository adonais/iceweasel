---
name: webspec-index
description: Query WHATWG, W3C, IETF and TC39 web specifications from the command line. Use to read a spec section or algorithm, find which algorithms invoke a concept and with what arguments, trace a call chain, list who writes a spec field, see what an algorithm may cause (events, tasks), look up IDL, validate an anchor, or read a spec as changed by an open WHATWG PR.
---

# webspec-index

Query WHATWG, W3C, IETF and TC39 web specifications from the command line.

Use `webspec-index` whenever you need to understand what a web spec says — algorithm steps, section content, cross-references, or whether a spec anchor exists. Specs are fetched and cached locally on first use.

## Available specs

Assume that all specs from WHATWG, W3C, IETF and TC39 are indexed. `webspec-index specs` lists every spec name and its base URL.

## Installation

If `webspec-index` is not already available in your environment, you can install it via cargo:

```bash
cargo binstall webspec-index
# or
cargo install webspec-index
```

## Commands

Always put the section identifier in quotes to avoid shell interpretation of `#`.

See `webspec-index --help` for full command list and options.

### Look up a spec section

```bash
webspec-index query 'HTML#navigate'
webspec-index query 'DOM#concept-tree'
webspec-index query 'CSS-GRID#grid-container'
webspec-index query 'https://html.spec.whatwg.org/#navigate'
webspec-index query 'DOM#concept-tree'
webspec-index query "RFC9000#section-22"
webspec-index query "draft-ietf-tsvwg-sctp-dtls-chunk#name-security-considerations"
webspec-index query 'https://w3c.github.io/webappsec-permissions-policy/#permissions-policy-header'
```

Returns the section's title, type (heading/algorithm/definition), full content as markdown, navigation tree (parent/prev/next/children), and cross-references. This is the primary command — use it to read what a spec section says.

Use `--format markdown` for human-readable output, or default `--format json` for structured data.
For non-hardcoded specs, URL queries are accepted for allowlisted domains (`*.spec.whatwg.org`, `drafts.csswg.org`, `w3c.github.io`, `wicg.github.io`, `webaudio.github.io`, `tc39.es`, `w3.org/TR/*`, and `webassembly.github.io`).

### Search across specs

```bash
webspec-index search "tree order"
webspec-index search "navigate" --spec HTML --limit 5
```

Full-text search with snippets. Use `--spec` to narrow to one spec.

### Check if a section exists

```bash
webspec-index exists 'HTML#navigate'
```

Exit code 0 = found, 1 = not found. Use this to validate anchor names before referencing them.

### Find anchors by pattern

```bash
webspec-index anchors "*-tree" --spec DOM
webspec-index anchors "concept-*" --spec HTML
webspec-index anchors "dom-*assign*"
```

Glob matching (`*` wildcard). Useful when you know part of an anchor name but not the exact id.

### List all sections in a spec

```bash
webspec-index list DOM
```

Returns all heading-level sections with their anchors, titles, types, and depths.

### Cross-references

```bash
webspec-index refs 'HTML#navigate' --direction incoming
webspec-index refs 'HTML#navigate' --direction outgoing
webspec-index refs 'HTML#navigate'
webspec-index refs 'Window.navigation' --limit 5
webspec-index refs 'HTML#event-navigateerror' --direction incoming --kind step -l 50
```

Shows which sections reference this one (incoming), which sections this one references (outgoing), or both (default). Target can be exact (`SPEC#anchor` or full URL) or shorthand (`Interface.member`) resolved heuristically against currently indexed sections. Use `--limit` to cap results when using shorthand queries.

Each reference carries the call site it was found at: the step number of the referencing algorithm, that step's verbatim text, and any enclosing guard steps. `--kind` filters by where the reference occurs:

- `step` — inside a numbered algorithm step, i.e. an actual call
- `note` — inside a note or example, including one nested in a step
- `idl` — inside a WebIDL block
- `prose` — ordinary prose

Roughly 60% of references are not calls, so `--kind step` is the difference between "who invokes this" and "who mentions this". `refs 'HTML#event-navigateerror' --direction incoming` returns 11 sections; with `--kind step` it returns the one algorithm that actually fires the event.

### Trace the call chain between two sections

```bash
webspec-index trace 'HTML#dom-location-assign' 'HTML#event-navigateerror' --max-depth 9 --format markdown
webspec-index trace 'HTML#navigate' 'DOM#concept-tree' --kind any -l 5
webspec-index trace 'HTML#dom-location-assign' 'HTML#event-navigateerror' --detail compact
```

Enumerates routes through the reference graph from one section to another. Both endpoints must be exact (`SPEC#anchor` or full URL). Defaults to `--kind step`, so only call edges are traversed.

Each hop reports the calling section, its step number, the verbatim step text, enclosing guard steps, and a link to the call site itself rather than the callee's definition. Markdown output is therefore a ready-made trace.

`--detail` picks how much of each hop to show. `verbose` (default) carries step text, guards and the call-site link. `edges` reduces each hop to `SPEC#anchor` plus its step number — roughly a third the size, and every token is an identifier you can feed back into `query` or `refs`. `compact` gives one linked line per hop, collapsing an edge's repeated call sites onto it, so an algorithm calling another twelve times reads as one line with twelve links rather than twelve near-identical routes.

Reduced levels are for comparing route shapes, not for judging them: the guards they drop are what decide whether a route is taken.

Use this instead of walking `refs` by hand. It is exhaustive within `--max-depth`, and the result distinguishes a search that finished from one cut short by the trace or node budget — so zero traces with `truncated: false` is evidence that no route exists, not merely that none was found.

Read `Search was truncated` before trusting the result — raise `-l` or narrow the endpoints if it appears.

Specs a route passes through are indexed on demand: when an edge points into a spec with no indexed data, `trace` fetches it and searches again, reporting `indexing N spec(s) the route touches` on stderr. First run of a cross-spec trace therefore takes a few seconds; later runs do not.

Real chains are longer than they look; `location.assign()` to `navigateerror` is seven hops, so a low `--max-depth` reports zero traces that look like a genuine answer.

### WHATWG PR previews

```bash
webspec-index query 'HTML#navigate' --pr 12345
webspec-index query 'HTML#navigate' --pr 12345 --diff --format markdown
webspec-index query 'HTML#navigate' --pr 12345 --force-update
webspec-index exists 'HTML#navigate' --pr 12345
webspec-index list HTML --pr 12345
webspec-index refs 'HTML#navigate' --pr 12345
webspec-index search 'OpaqueRange' --spec HTML --pr 12345
webspec-index anchors '*opaquerange*' --spec HTML --pr 12345
```

Query spec sections as modified by an open WHATWG PR. Previews are lazily fetched from whatpr.org on first use and cached for 24h.

- `--pr N`: query the spec as it would look after PR N is merged. Sections not modified by the PR fall back to the merge base.
- `--diff`: show a section-level diff between the PR and its merge base. Lists added/modified sections with unified diffs.
- `--force-update`: re-fetch the PR preview even if recently cached (use after the PR is updated).

Manage cached PR data with `clear-pr`:

```bash
webspec-index clear-pr                         # list cached PRs
webspec-index clear-pr --spec HTML --pr 12345  # remove one PR
webspec-index clear-pr --all                   # remove all
```

### Update specs

```bash
webspec-index update
webspec-index update --spec HTML
webspec-index update --force
```

Fetches latest spec versions. Uses 24h cache unless `--force` is given. Specs are auto-fetched on first query, so you rarely need this.
Each check covers the spec and its transitive dependencies; re-indexing happens only when HTML content changed. The first query of the day may take a few seconds while the check completes.

### Graph traversal

```bash
webspec-index graph 'HTML#navigate' --direction outgoing --max-depth 2
webspec-index graph 'HTML#navigate' --graph-format mermaid
webspec-index graph 'HTML#navigate' --graph-format dot
webspec-index graph 'HTML#navigate' --same-spec-only
webspec-index graph 'HTML#navigate' --include '*concept-*' --exclude 're:^URL#'
```

Builds a cross-reference graph rooted at a section. Supports JSON (default), Markdown, Mermaid, and Graphviz DOT output.
Use `--include` and `--exclude` to filter node ids (`SPEC#anchor`) by wildcard patterns (`*`, `?`) or regex (`re:<pattern>`).

### Query dedicated WebIDL definitions

```bash
webspec-index idl 'HTML#dom-window-navigation'
webspec-index idl 'Window.navigation'
webspec-index idl 'Window.open()'
webspec-index idl 'navigation' --spec HTML --limit 5
```

Queries structured WebIDL definitions directly. Supports exact anchors (`SPEC#anchor` or URL) and canonical names (`Interface.member`, `Interface.method()`).
Use this first when the task is about API shape or IDL ownership, then use `refs` to see algorithm usage.

### Query field state (who writes a field)

```bash
webspec-index state 'HTML#is-initial-about:blank' --format markdown
webspec-index state 'Document' --format markdown
webspec-index state 'Document.*sandbox*' --format markdown
webspec-index state 'HTML#*sandbox*' --format markdown
webspec-index state 'HTML#sandboxing-flag-set' --format markdown
webspec-index state --coverage HTML --format markdown
webspec-index state 'SPEC#anchor' | --coverage SPEC [--no-inits] [--unclassified] [--calls] [--callers] [--opaque] [-l N] [--rules PATH] [--format json|markdown]
```

Answers: who writes a spec field, under what grammar shape, and with what initial value.
Answers use **may-semantics** — a listed site may set the field. Reads are counted, not listed.

Selector forms:
- `SPEC#anchor` of a field → field view (writes, inits, owner, type)
- `SPEC#anchor` of a type → type view (all fields, tables per supertype)
- `SPEC#GLOB` (e.g. `"HTML#*sandbox*"`) → field list matching anchor glob
- `SPEC#anchor` of a set → member view (adds/removes per member)
- `TYPE` (e.g. `Document`) → type view
- `"TYPE.FIELD"` (e.g. `"Element.node document"`) → field view with inheritance path
- `"TYPE.GLOB"` (e.g. `"Document.*sandbox*"`) → field list matching name or anchor
- `--coverage SPEC` → coverage counters (owner resolution %, set structure %, unclassified %)
- `SPEC#anchor` of an algorithm → algorithm view (below)

### Algorithms: signature, calls and callers

```bash
webspec-index state 'HTML#navigate' --format markdown
webspec-index state 'HTML#location-object-navigate' --calls --format markdown
webspec-index state 'DOM#concept-node-insert' --callers -l 20 --format markdown
webspec-index state 'HTML#navigate' --opaque --format markdown
```

The algorithm view shows the call template (`navigate {navigable} to {url} using {sourceDocument},
with named arguments`), a parameter table (type, positional or named, default), and statement counts.

- `--calls`: every call the algorithm makes, with each argument bound to the callee's parameter
  (`url ← *url* · exceptionsEnabled ← true · 9 named arguments defaulted`).
- `--callers`: every call into the algorithm from all indexed specs, grouped by caller and bound the
  same way. `-l N` caps the caller groups (default 20); the total is always reported.
- `--opaque`: statements the parser could not structure.

Each call carries a confidence: `exact` (every argument aligned), `partial` (some argument is opaque
or missing; the issue list says which), or `unbound` (no signature, e.g. a callee spec that is not
indexed). Arguments are never guessed: an `exact` binding is reliable, and a `partial` one shows its
uncertain values verbatim. For "who invokes X and with what arguments", prefer `--callers` over
`refs --direction incoming --kind step`.

The view under-reports rather than misreports. Calls inside `If` conditions, and calls embedded in
running prose rather than leading a step, are often missing. So `Coverage: may · partial` means more
calls may exist: confirm with `refs --kind step` or by reading the steps before concluding a call is
absent.

### Views of long algorithms

`query` on a long algorithm (HTML#navigate has 67 steps) returns thousands of words. View flags
trim it to what you need:

```bash
webspec-index query 'HTML#navigate' --depth 1
webspec-index query 'HTML#navigate' --steps 24.8 --format markdown
webspec-index query 'HTML#navigate' --involving url --format markdown
webspec-index query 'HTML#navigate' --feeding 24.9.1:historyEntry --format markdown
```

- `--depth 1`: top-level steps only. Drill into a step with `--steps 24.8` to see all sub-steps
  under that path.
- `--involving <name>`: forward slice from that parameter or variable — every step that uses or is
  influenced by `name`, including the steps that carry it forward.
- `--feeding <STEP>:<VAR>`: backward slice answering "where does `historyEntry` in step 24.9.1 come
  from". `<VAR>` is optional; without it, every variable that feeds the step is traced.
- Combine flags: `--involving url --depth 2` limits the forward slice to top-level steps plus one
  level of sub-steps (paths with at most 2 components).
- `--no-notes` drops notes and examples. Links render as short `SPEC#anchor` by default
  (`--links full` for URLs, `--links none` for plain text).

**Markers signal omissions, not algorithm boundaries.** A line like
`- [steps 3–7 omitted: no use of *url*]` means those steps exist and were cut for relevance. The
algorithm continues past a marker; it does not end there. The summary block appears right after the
`## Content — …` heading (before the steps) and lists slice variables, stores, unfollowed statements,
loop bindings, rebound names, and (for backward slices) inputs and later definitions.

### Possible effects of an algorithm

```bash
webspec-index effects 'HTML#dom-location-assign' --compact --format markdown
webspec-index effects 'HTML#navigate' --summary-only --format markdown
webspec-index effects 'HTML#navigate' --kind event.fire --format markdown
webspec-index effects 'HTML#navigate' --step 8 --format markdown
```

Lists what an algorithm may cause, transitively across specs: events fired, tasks and microtasks
queued (with task source), steps run in parallel, promises resolved. Each group names the sites that
do it. Plain `effects` adds witness traces (the call path to each site, with its conditions);
`--compact` and `--summary-only` omit them. `--kind` or `--category events` focuses the request.
Semantics are **may**: a listed effect is reachable along some path, not guaranteed. "Partial
analysis" means more effects may exist. `query` output also embeds a short effects preview.

### Control flow of an algorithm

```bash
webspec-index flow 'HTML#location-object-navigate' --flow-format mermaid
```

Renders the algorithm's steps as a flowchart (branches, returns, calls to other algorithms).

## Usage patterns for Gecko development

### Understanding what you're implementing

When working on a bug that references a spec algorithm:

```bash
# Read the algorithm you need to implement
webspec-index query 'HTML#navigate' --format markdown

# Check what concepts it references
webspec-index refs 'HTML#navigate' --direction outgoing

# Look up a referenced concept you don't understand
webspec-index query 'INFRA#ordered-set'

# See every algorithm it calls, with the arguments bound to each callee's parameters
webspec-index state 'HTML#navigate' --calls --format markdown
```

When `query` output ends with a line like `Written in 4 steps…` or `Called from 13 algorithms…`, run the
command printed on that line.

### A value ends up wrong

When a bug or test failure comes down to a spec field holding the wrong value (a flag that stays set, a
stale URL, a missing entry in a list), list every step that writes or initializes it, then read each
writer:

```bash
webspec-index state 'HTML#ongoing-navigation' --format markdown
webspec-index query 'HTML#navigate' --steps 24.8 --format markdown
```

A field set only at initialization never changes after construction; a writer under a guard changes it
only when the guard holds.

### Wrong arguments, or a missing call

When Gecko's caller passes different arguments than the spec, or a call seems missing, compare against
the spec's call sites. `--calls` shows what an algorithm calls and with which arguments; `--callers`
shows every call into it, from every indexed spec:

```bash
webspec-index state 'HTML#location-object-navigate' --calls --format markdown
webspec-index state 'DOM#concept-node-insert' --callers --format markdown
```

An `exact` binding is reliable; `N named arguments defaulted` means the spec relies on the defaults.
The view can miss calls inside `If` conditions and in running prose, so confirm an absence with
`refs --direction incoming --kind step` before concluding a call does not exist.

### Event order and task timing

When a test fails on which events fire, in what order, or whether something happens synchronously, list
what the entry point may cause and through which task source:

```bash
webspec-index effects 'HTML#dom-location-assign' --compact --format markdown
webspec-index effects 'HTML#dom-location-assign' --kind event.fire --format markdown
```

Then follow one effect to its site with `trace` and read the steps on the way. Effects are possible,
not guaranteed: a guard on the route decides whether it happens.

### Finding the right spec section

When you see a spec URL in code comments (e.g., `https://html.spec.whatwg.org/#navigate`), or a step comment like `// Step 3.2`, query the section to understand the algorithm:

```bash
webspec-index query 'https://html.spec.whatwg.org/#navigate'
```

When you know a concept but not its exact anchor:

```bash
# Search by text
webspec-index search "tree order" --spec DOM

# Or find by anchor pattern
webspec-index anchors "*tree*order*" --spec DOM
```

### Verifying spec anchors

Before adding a spec URL to a code comment, verify the anchor exists:

```bash
webspec-index exists 'HTML#navigate' && echo "valid"
```

### Understanding cross-spec dependencies

To see what other specs depend on a concept you're changing:

```bash
webspec-index refs 'DOM#concept-tree' --direction incoming
```

### Tracing IDL API usage in algorithms

When implementing or reviewing a DOM API in Gecko:

```bash
# Find canonical IDL definition + owning interface
webspec-index idl 'Window.navigation' --format markdown

# Find where the property is used in indexed specs
webspec-index refs 'Window.navigation' --direction incoming
```

### Finding where Gecko implements a spec section

When the user asks where a spec algorithm is implemented in Gecko or SpiderMonkey, query
the spec section first, then pass the `url` field from the response to `searchfox-cli`:

```bash
# Step 1 — read the spec section (response includes a "url" field)
webspec-index query 'HTML#navigate' --format json

# Step 2 — find Gecko source files that reference that URL
searchfox-cli --spec-refs 'https://html.spec.whatwg.org/#navigate'
```

For Gecko or SpiderMonkey implementation questions, pass the `url` field from the `query` response
to `--spec-refs`; no manual URL construction needed.

### Implementing a feature from a spec PR

When the bug references a spec PR that hasn't landed yet:

```bash
# See what the PR changes at a section level
webspec-index query 'HTML#navigate' --pr 12345 --diff --format markdown

# Read the algorithm as modified by the PR
webspec-index query 'HTML#navigate' --pr 12345 --format markdown

# Check what new cross-references the PR introduces
webspec-index refs 'HTML#navigate' --pr 12345 --direction outgoing
```
