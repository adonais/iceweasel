---
name: spec-trace
description: Trace a claim about web spec behaviour through the algorithm call chain and produce a Bugzilla-ready markdown trace ending in a REACHED / NOT REACHED / INCONCLUSIVE verdict. Use when a bug says "the spec says X should happen" and you need to check whether it does, when asked where in the spec some event gets fired or some state gets set, or when a reporter's expected-results section needs a spec citation it did not provide.
argument-hint: "[--gecko] <question in prose>"
allowed-tools:
  - Bash(webspec-index:*)
  - Bash(searchfox-cli:*)
  - Read
---

# Spec Trace

**Question**: $ARGUMENTS

Produce an ordered chain of spec algorithm invocations from a web-visible entry point to the
behaviour in question, quoting the deciding step at each hop, and end in a verdict. The output goes
into a Bugzilla comment as an argument, so it has to survive a reader checking it. Pass `--gecko` to
also map the trace to Gecko source.

`webspec-index trace` finds the routes and supplies each hop's step number, verbatim text, guard
steps and call-site link. Your work is judging which of those routes the scenario actually takes.

## Phase 0: Resolve

- **Entry anchor** — the API the scenario starts from. `webspec-index idl 'Interface.member()'`
  resolves IDL members directly; use `search` or `anchors` for non-IDL entry points.
- **Target anchor** — what the question asks about. Events are indexed as definitions:
  `webspec-index anchors '*eventname*' --spec HTML`.
- **Scenario facts** — the preconditions that decide branches. State them in the output. A trace is
  valid only for the scenario it assumed, and most wrong traces are wrong because an unstated
  assumption silently picked a branch. Where the question leaves a branch-deciding fact open, name
  the assumption and trace the branch the reporter most plausibly meant.

## Phase 1: Enumerate routes

```bash
webspec-index trace '<SPEC#entry>' '<SPEC#target>' --max-depth 9 -l 40 --format markdown
```

Nine hops is not generous; real chains run that long. Too low a depth reports zero routes, which
reads exactly like a genuine NOT REACHED, so raise it once before believing an empty result.

`--kind step` is the default, so prose mentions, notes and IDL tables are already excluded — around
60% of the reference graph, none of it calls.

Read the header before the routes:

- `Found N trace(s).` with no `Search was truncated` after it (JSON: `"truncated": false`) means the
  enumeration is exhaustive at that depth. This is what lets a NOT REACHED verdict claim more than
  "I did not find one".
- `Search was truncated` means it is not. Raise `-l` or narrow the endpoints; if it still truncates,
  the verdict is INCONCLUSIVE.
- `indexing N spec(s) the route touches` on stderr means specs a route crosses were fetched on
  demand, costing about a second each on a first run. If it keeps appearing across runs, the chain
  reaches further than the search will follow, and the verdict is INCONCLUSIVE.

When the target turns out to be reachable only from somewhere other than your assumed entry point,
`refs '<SPEC#target>' --direction incoming --kind step -l 50` shows who really calls it.

## Phase 2: Judge each route

The tool proves a route exists in the reference graph. It cannot know your scenario. Decide route by
route whether it is taken, from what each hop already carries:

- **Guards.** Does a `- under:` condition contradict a scenario fact? That kills the route.
  When a guard reads a field ("If *document*'s is initial `about:blank` is true"), run
  `webspec-index state '<SPEC#field>'` to list who sets it before the guard runs. A guard
  whose field is only set in an initialization never fires after construction.
- **Arguments.** Does the step pass, or omit, an optional argument the callee branches on? An
  omitted argument frequently disables the branch the whole question turns on.
  `webspec-index state '<SPEC#caller>' --calls --format markdown` binds each call's arguments to the
  callee's parameters and counts the defaulted ones; an `exact` binding answers this directly, a
  `partial` one still needs the step text.
- **Ordering.** Compare step numbers within a section. A call at step 20 runs before one at step 24,
  so state it depends on may not be set up yet, or may already be torn down.
- **Identity.** Does the hop act on the object the question is about? An algorithm that aborts *the
  previous* ongoing navigation does not report *this* one.

Read the whole section when a hop's own text and guards are not enough:
`webspec-index query '<SPEC#anchor>' --format markdown`
(links default to `short` — `SPEC#anchor` — which you can feed back into `query`; use `--links full` for absolute URLs).

To trace a parameter through one algorithm, add `--involving`:

```bash
webspec-index query '<SPEC#anchor>' --involving <param> --format markdown
```

This returns only steps that use or are influenced by `<param>`, with markers for every omitted run.
For guards, `--feeding <STEP>:<VAR>` answers "where does *x* in step 18 come from": the backward
slice shows which earlier steps define the value that reaches the guard.

`query` output shows cross-reference counts. When a section has fewer than 5 refs in one direction
they are listed; otherwise a ready-made `refs` command is emitted — copy and run it to fetch the
full list (e.g. `webspec-index refs HTML#navigate -d incoming -l 117`).

**A NOT REACHED verdict needs the step where the chain stops, and that step is never in the
output.** `trace` enumerates routes that reach the target, so the step that ends a chain instead —
returning, aborting, or taking the other branch — has no edge to the target and cannot appear in any
route. It is invisible to the search by construction, and it is usually the step the answer turns
on. Read the last section a surviving route reaches, starting at the step after the one the route
left off at, and quote what you find there.

Keep the reason each route was rejected. Those reasons are half the output, not scratch work: they
are what makes a NOT REACHED verdict an argument, and what a reporter will push back on.

## Phase 3: Render

````markdown
**Question:** <the question>

**Scenario:** <the preconditions assumed>

1) [`<SPEC#algorithm>` step N](<call-site url>) calls `<SPEC#callee>`, <argument fact that decides the branch>
   - under: <guard>
   > <verbatim step text>

2) …

**Verdict: <REACHED | NOT REACHED | INCONCLUSIVE>** — <one sentence>

| Rejected route | Rejected because |
|---|---|
````

`trace --format markdown` already emits the numbered hop list; add the scenario, the verdict and the
rejected-route table around it. Say explicitly where a chain returns to an earlier algorithm — that
unwind is usually where the answer lives.

Every link resolves to an element id, so `exists` can check it and a reader can tell when it breaks.
Two forms, preferred first: the call-site id the generator emitted for that mention, which `trace`
supplies and which lands the reader on the calling line; failing that, the section anchor with the
step number in the link text — ``[`HTML#navigate` step 24.2](https://html.spec.whatwg.org/#navigate)``.
About a third of hops have no call-site id, and a step that calls nothing never does, so the
deciding step of a NOT REACHED verdict usually takes the second form.

Exactly one verdict:

- **REACHED** — the spec specifies the behaviour; name the step. Firefox not doing it is a bug.
- **NOT REACHED** — no route survived judgement. Consider whether the spec omission is itself the
  defect, in which case Firefox is compliant and the follow-up is a spec issue.
- **INCONCLUSIVE** — the chain hit a UA-defined step, an unindexed spec, or a truncated search. Say
  where it stopped and what would resolve it. Never soften this into another verdict for tidiness.

## `--gecko` mode

Append a table mapping the trace to Gecko source, keyed on canonical URL:

```bash
searchfox-cli --spec-refs '<url>'
```

- Separate code hits from test hits, and call out algorithms with no hits — an unreferenced spec
  algorithm is often the reason for the bug.
- One row per distinct URL, not per hop. An algorithm the chain re-enters collapses into one row
  listing the hops it covers.
- Add rejected algorithms as `(not reached)` rows. For a NOT REACHED verdict they carry the weight:
  the code exists and simply is not wired to this route.
- Discard matches under `.claude/skills/` and `.agents/skills/`. In-tree skill documentation quotes
  spec URLs in its examples and is indexed as code, in both copies.

## Effects data may be temporarily unavailable

`query` output includes an `effects_status` field. When that field carries
`"state": "unavailable"` with `"snapshot_changed"` in `"issues"` (shape:
`{"state": "unavailable", "semantics": "may", "issues": ["snapshot_changed"], "omitted": 0}`),
the spec's HTML was updated since effects were last built and the inline rebuild
did not complete in time. The data is not wrong — it is absent. Run
`webspec-index effects --all` to rebuild; subsequent queries serve fresh
summaries. This state is transient and does not affect anchors,
cross-references, or any non-effects output.

## Hard rules

**Every quote comes from tool output.** `trace` and `refs` emit plain step text; use it as given.
`query` renders markdown, so its step text carries `*emphasis*` around variable names and inline
`[links](...)`; stripping that to recover the spec's prose is not paraphrasing, changing a word is.
A truncated fragment presented as a quotation is an invented quote, and an invented quote loses the
argument the trace was written to win.

**Effects and `state` output are leads, not evidence.** This includes the "Possible effects" block
in `query` output. REACHED needs a route from `trace` or a quoted step. NOT REACHED needs an
untruncated `trace` plus the step where the chain stops; an effect or caller that is not listed
proves nothing, because both analyses miss some. If an effect points at the target but `trace`
finds no route to it, the verdict is INCONCLUSIVE until the gap is explained.

**Validate every anchor** with `webspec-index exists '<SPEC#anchor>'` before it ships, the
rejected-route table included. Exit code 0 means it resolves.

**Trace the spec as of today.** If the bug references an unlanded spec PR, add `--pr N` to `query`,
`refs` and `exists`, and say in the output which PR the trace assumes. `trace` has no `--pr`;
against a PR, walk `refs --kind step` in both directions instead.
