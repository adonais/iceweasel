# Standalone Recomp Frontend Review

## Contents

- [Step 1: Identify the input](#step-1-identify-the-input)
- [Step 2: Fetch the diff and associated bug](#step-2-fetch-the-diff-and-associated-bug)
  - [Early scope and delegation gate](#early-scope-and-delegation-gate)
  - [Phabricator mode](#phabricator-mode)
  - [Local mode](#local-mode)
  - [Freeze the shared packet](#freeze-the-shared-packet)
- [Step 3: Write a conceptual summary](#step-3-write-a-conceptual-summary)
- [Step 4: Triage](#step-4-triage)
- [Step 5: Spawn subagents](#step-5-spawn-subagents)
  - [Shared subagent instructions](#shared-subagent-instructions)
  - [Reusable components subagent](#reusable-components-subagent-always-spawn-for-scoped-patches)
  - [Design-system subagent](#design-system-subagent-spawn-only-when-scoped-styling-tokens-design-system-changes-or-an-explicit-design-system-request-apply)
- [Step 6: Combine outputs](#step-6-combine-outputs)

You are the orchestrator for a two-protocol reusable-component and design-system review.
Capture the diff, classify scope, enrich scoped evidence, write a conceptual summary, and delegate review work to focused subagents.
Combine their outputs into one Phabricator-ready comment.
Subagents perform the bundled checks in isolated context windows, not the orchestrator.

## Step 1: Identify the input

**Phabricator mode** — the user has provided a revision ID.
Accept any of these formats and extract the numeric ID:

- `D291014`
- `291014`
- `https://phabricator.services.mozilla.com/D291014`

**Local mode** — the user wants to review local/uncommitted changes, with no revision ID or an explicit local request.
Do not require selected commits, a jj revset, or a review base for ordinary Local mode.
An explicitly requested commit range is an optional Local mode selection, not the default scope.
Preserve that selection without inferring an unspecified stack.

Discover the selected checkout through available repository capabilities.
Run `jj root` there to detect a jj repository, not merely an installed executable.
If it succeeds, use jj.
Otherwise, run `git rev-parse --git-dir` to verify a Git repository.
After success, run `git rev-parse --show-toplevel` to identify the checkout and use Git.
Report missing repository prerequisites without substituting another review target.
Ask about selection only when repository evidence cannot resolve an explicitly requested ambiguous range.

Preserve any concrete review aim supplied by the user.
Request an aim only when necessary to disambiguate the review.
Do not consult personal aim state, private memories, or write hooks.

Complete this step with an unambiguous target, checkout, mode, and supported acquisition route.

## Step 2: Fetch the diff and associated bug

Do not execute the runsheet checks here, since subagents handle them.
Use available Mozilla acquisition capabilities and inspect their supported interfaces before calling them.
Do not invent helper names, endpoints, or parameters.
Report unavailable evidence when no supported acquisition capability exists.
If the requested diff cannot be acquired completely, stop with the exact prerequisite rather than reviewing a partial or different target.

Assign one requester to all Phabricator and Bugzilla requests.
Serialize these requests.
Honor rate-limit responses and specified retry delays before continuing.
Capture the selected revision and reviewed source version once, then acquire bug discussion only for scoped review.
Subagents use that shared evidence rather than independently fetching revision or bug data.
Route additional Phabricator or Bugzilla requests through the orchestrator and share the results with affected subagents.

### Early scope and delegation gate

Immediately after complete diff capture, apply [Shared scope and domains](../SKILL.md#shared-scope-and-domains), including every explicitly selected range commit.
Record matched and excluded inventories, domain decisions, and assigned files before bug fetching, history enrichment, summary writing, or source freezing.
For no matched changes, return the overview's scope-only result without enrichment or subagents.
For scoped changes, confirm that task delegation supports isolated context windows before continuing.
If unavailable, return an incomplete review naming that prerequisite, assigned domains, and unperformed checks.
Do not substitute direct domain checks or claim isolated review.

### Phabricator mode

1. Capture the full diff, revision identity, title, description, and comments available through the supported interface.
2. Apply the early scope and delegation gate before associated bug acquisition.
3. Extract associated bug IDs from the title and description, including `Bug XXXXXX` patterns.
4. Fetch relevant descriptions and comments for every associated bug through the same requester.
5. Record unavailable metadata without choosing an arbitrary majority bug.

When no bug is identified, record that fact and continue from available revision metadata.

### Local mode

For the default Local mode selection, capture the uncommitted diff using the detected repository:

- Git: `git diff HEAD`.
- jj: `jj diff --git`, which defaults to the working-copy revision `@`.

Do not use `--ignore-working-copy` for live jj capture, since it can leave working-copy evidence stale.
Record changed files and resolved base and target identities.
Disclose untracked files and whether the snapshot includes their contents.
Do not silently omit requested changes or describe incomplete coverage as complete.
For an explicitly requested range, inspect supported VCS interfaces and capture that exact selection instead of the default uncommitted diff.
Capture ordered commit identities, exact description first lines, per-commit diffs, and the combined diff.
Preserve intermediate scoped changes even when the combined diff cancels them.

Apply the early scope and delegation gate before history or associated bug enrichment.

Capture commit history as intent context only.
History never broadens the default diff to include a committed stack.
First confirm that `main` resolves in the selected repository:

- Git: `git rev-parse --verify 'main^{commit}'`.
- jj: `jj log -r main --no-graph`.

When `main` resolves, capture history with:

- Git: `git log --oneline main..HEAD`.
- jj: `jj log -r 'main..@-' --no-graph`, excluding the working-copy commit.

If `main` does not resolve, inspect supported repository configuration and existing remote default-branch metadata for the actual default base.
For Git, inspect configured remotes and their existing symbolic default-branch references rather than assuming `origin` or another branch name.
For jj, inspect supported configuration for its configured trunk or default-base expression and resolve that expression against the repository.
Verify the discovered base before substituting it for `main` in the history command.
If no history base can be determined, record unavailable history and continue with the unambiguous local diff.
Do not silently choose an arbitrary range or block that diff because history is unavailable.

Extract associated bug IDs from captured commit descriptions and supplied context.
Fetch relevant bug descriptions and comments through the same requester.
Record every associated bug and unavailable metadata.
When no bug is identified, record that fact and continue from available metadata and the diff.

### Freeze the shared packet

Freeze acquisition artifacts before delegation.
Include complete before-and-after source for changed scoped files and line-addressable target source needed for citations or suggested patches.
Use session artifacts or the available artifact capability without imposing a personal directory or temporary drive.
Give large artifacts by reference rather than truncating them.
Record acquisition provenance, selection identities, untracked coverage, unavailable history, and other omissions.
Record checkout alignment with the frozen target as matches, differs, or unknown, citing the evidence for that status.
Record the supported route for acquiring frozen dependencies when checkout alignment differs or remains unknown.

Complete this step with one immutable packet shared by every launched subagent.

## Step 3: Write a conceptual summary

Synthesize the fetched evidence into a short conceptual summary of the patch.
Pass it to each launched subagent so they understand the intent behind the changes, not just the code.

Cover:

- What problem or user need the bug describes.
- What the patch does to address it, in plain terms rather than line by line.
- Which UI components, surfaces, or consumers are affected.
- Relevant constraints, design decisions, and caveats from bug comments or revision metadata.
- How the stated intent relates to the selected changes.

Keep it to three to six sentences.
Distinguish author intent from observed implementation behavior.
If no bug is available, use captured metadata, the diff, and conversation with the user.
Use any supplied review aim without inventing one.

Complete this step with the same conceptual summary supplied to each launched subagent.

## Step 4: Triage

Confirm that the early scope decisions still cover the complete frozen selection.
Carry those matched and excluded inventories, domain decisions, and assigned files into delegation.

Complete this step with explicit scope, exclusions, and domain assignments.

## Step 5: Spawn subagents

Launch the applicable subagent, or launch applicable subagents in parallel when multiple domains apply, using separate context windows.
Pass the conceptual summary, shared packet, supplied aim, assigned files, and captured comments into each prompt.
Use focused subagents without requiring a particular external reviewer role.

Pass the resolved [skill overview](../SKILL.md) and [runsheet](runsheet.md) references to each subagent.
Include the shared scope decisions and domain assignments, independently of the spawning mechanism.
Subagents independently read the runsheet and relevant source, callers, test helpers, and reference documentation.
They may fetch external reference documentation through available supported tools.
They do not reacquire the reviewed patch or bug discussion.
Give artifact references for full diffs, metadata, comments, commit summaries, and frozen source.
During delegation, answer frozen-source requests from captured artifacts or supported local snapshot acquisition.
Disclose unresolved requests as missing evidence rather than letting version-mismatched source decide findings.
When token migration applies, route TOKEN-01's inventory to the component reviewer for STACK-02 without repeating completed searches.

### Shared subagent instructions

Include these instructions in each launched subagent's prompt:

```text
Review only the assigned domain against the frozen selection.
Apply the orchestrator's supplied scope decisions and domain assignments.
Read the overview's scope rules as context, without reselecting mode or rederiving assignments.
Read the bundled runsheet at the supplied resolved path.
Execute every applicable check assigned to your domain.
Record every assigned check ID, including checks that are not applicable or cannot be verified.
Do not add an accessibility checklist or invent repository conventions.

Characterize each affected component before evaluating checks.
Describe relevant APIs, attributes, properties, events, lifecycle behavior, and supported interaction or visual states.
Read complete deciding source regions, token definitions, and applicable test helpers.
Apply the overview's scope and evidence requirements, including need-based consumer inspection and checkout alignment.
Use the packet's alignment status and dependency-acquisition route when requesting frozen source from the orchestrator.
You may independently fetch external reference documentation relevant to your assigned checks.
Record its URL, retrieval date, and deciding quotation in Execution Evidence.
Distinguish reference guidance from evidence about the frozen implementation or observed runtime behavior.
Send all additional Phabricator and Bugzilla requests to the orchestrator, including references hosted on those services.
Request missing reviewed-source snapshots through the orchestrator rather than substituting a different remote source version.
If a reference cannot be retrieved, record the missing evidence and its effect on the applicable check.
Do not run VCS commands, edit source, or execute builds, tests, linters, formatters, or runtime probes.

Use PASS, FAIL, NOT APPLICABLE, or NOT VERIFIED for every check result.
PASS requires cited evidence establishing the check within its stated scope.
NOT APPLICABLE requires a concrete scope reason.
NOT VERIFIED requires missing evidence and exact testing or source-acquisition follow-up.
Do not claim runtime behavior from static reasoning or infer successful execution from supplied commands.

Challenge each potential finding under the overview's independent-falsifier requirement.
Quote the deciding frozen file:line and record the actual falsifier observation.
For cascade claims, read enclosing layers, media conditions, specificity, and relevant layer order.
For geometry claims, establish rendered DOM order and layout direction before tracing every token hop or calculating values.
For universal negatives, record the searched corpus and exact query, and search for counterexamples.
For API claims, inspect handlers and callees before judging semantics.
Apply EVID-06 when a complete source trace establishes a public-contract counterexample despite missing whole-tree consumer coverage.
For test-mechanics claims, inspect the actual helper documentation and implementation.
Reject disproven claims and explain corrections when they affect another reported result.
A NOT RUN or unsettled falsifier becomes Required Testing and Follow-up, never an issue or a downgraded nit.

Return these sections:
- Issues
- Suggestions
- Required Testing and Follow-up
- Check Results
- Per-file Coverage
- Execution Evidence

For each retained issue, provide:
- ID, domain category, related check IDs, and concise title.
- Severity: blocking, moderate, minor, or nit.
- Must-fix status for blocking or moderate severity.
- Exact frozen location and quoted deciding source.
- Primary responsible commit summary and other involved commits, when reviewing an explicitly selected range.
- Claim, source-supported or runtime-observed consumer effect, and evidence connecting the mechanism to that effect.
- Independent falsifier and observed result.
- Fix explanation and a minimal suggested unified diff against frozen source.

Suggested patches require exact repository paths, valid syntax, sufficient unchanged context, and every file the proposed fix changes.
Do not apply suggested patches.
If evidence or a valid patch cannot be established, report the missing prerequisite under Required Testing and Follow-up.
Suggestions must remain evidence-backed and nonblocking.
For each follow-up, give related check IDs, affected files or consumers, missing evidence, exact steps, and expected behavior.
For each check, give ID, category, applicability, status, evidence, and associated issue or follow-up IDs.
For each assigned file, give reviewed regions, relevant check IDs, result, and uncovered behavior.
For execution evidence, list observed source reads and searches with outcomes.
Separately identify supplied runtime evidence and its provenance.
State not run with concrete reasons for runtime checks not performed.
Return explicit none entries rather than silently omitting required sections.
Do not recommend landing when applicable checks or assigned coverage remain unverified.
```

### Reusable components subagent (always spawn for scoped patches)

Use this prompt, inserting the captured content and shared instructions:

```text
You are performing a reusable-component API and consumer review of a Firefox patch.

## Context
[Conceptual summary, supplied aim, domain assignments, and shared subagent instructions.]

## The patch
[Full diff and comments, or references to complete immutable artifacts.]
[Selection identities, associated metadata, frozen source, and resolved bundled runsheet path.]

## Your task

1. Read these runsheet sections and every check assigned to them:
   - Component APIs and Backwards Compatibility
   - Shared Reuse and Consumer Regressions
   - Cross-Commit Coherence and Migration Completeness
   - Test Coverage and Evidence Validation, for your assigned changes
2. Identify modified components and characterize their public contracts, lifecycle behavior, and affected state transitions.
   Identify callers when the overview's evidence requirements need them.
3. Trace changed public contracts and claimed consumer consequences into actual callers as required by the overview's evidence requirements; check compatibility, shared reuse, migration completeness, and final behavior.
4. For an explicitly selected range, assess coherence across all captured commits without losing intermediate scoped changes.
5. Relate tests to changed contracts and consumers rather than merely repeating implementation expectations.
6. Assess whether the revision description and captured commit summaries accurately describe the selected behavior.
7. Return every required result section under the shared instructions without reviewing unrelated changed files.
```

### Design-system subagent (spawn only when scoped styling, tokens, design-system changes, or an explicit design-system request apply)

Use this prompt, inserting the captured content and shared instructions:

```text
You are performing a design-token, CSS, and design-system review of a Firefox patch.

## Context
[Conceptual summary, supplied aim, domain assignments, and shared subagent instructions.]

## The patch
[Full diff and comments, or references to complete immutable artifacts.]
[Selection identities, associated metadata, frozen source, and resolved bundled runsheet path.]

## Your task

1. Read these runsheet sections and every check assigned to them:
   - Design Tokens and CSS Custom Properties
   - CSS Cascade Contrast Modes and Layout
   - Design-System Structure
   - Test Coverage and Evidence Validation, for your assigned changes
2. Identify modified components and map affected visual states, selectors, custom properties, layers, and media conditions.
3. Trace token definitions and consumers to deciding values or unresolved dependencies.
4. Use authoritative source and existing repository patterns rather than assuming naming or structural conventions.
5. Inspect component markup and styling dependencies needed to establish cascade, contrast-mode, or layout effects.
6. Execute TOKEN-01's migration inventory and share it through the orchestrator for STACK-02.
   Assess structural coherence, including every captured commit in an explicitly selected range.
7. Return every required result section under the shared instructions without reviewing unrelated changed files.
```

Wait for every launched subagent and retain its complete output.
For failed or empty results, recover available output and delegate missing assigned checks when the available capability permits.
If coverage remains missing, mark those checks NOT VERIFIED and describe the required follow-up.
Do not convert subagent failure into a clean recommendation.

Complete this step with domain outputs or explicit unresolved coverage for every assigned check and file.

## Step 6: Combine outputs

Consolidate in the orchestrator, not another review round.
Deduplicate Issues, Suggestions, and Required Testing and Follow-up by underlying cause and affected behavior.
Preserve check IDs, deciding citations, falsifiers, observed results, consumer effects, and minimal suggested patches.
Preserve producing domains and supplemental evidence ownership across merged findings, Check Results, Per-file Coverage, and Execution Evidence.
Retain unresolved evidence; selected reviewer groups do not establish that substantive checks ran.
Apply the bundled runsheet's evidence contract when consolidating findings and supplied evidence.
When subagents disagree, resolve from captured evidence or mark the disputed check NOT VERIFIED with exact follow-up.
Never silently select the more reassuring result.

Sort issues by blocking, moderate, minor, then nit severity.
Label blocking and moderate issues must-fix.
Use request changes for established must-fix issues.
Use incomplete review when missing evidence prevents a supported landing recommendation.
A scoped no-issues conclusion requires all applicable checks verified and every assigned file covered.
Use scoped review with nonblocking findings when coverage is complete and only minor issues, nits, or suggestions remain.
Record material refutations as corrections, never actionable issues, suggestions, or proposed new review rules.

Use an unheaded summary, followed by Issues, Suggestions, Required Testing and Follow-up, and a grouped second-domain review.
Always preserve required follow-up during assembly.
Omit Issues, Suggestions, or Required Testing and Follow-up only when that section has no entries.
Keep detailed check coverage and execution evidence inside the second-domain section, after its design-system checks.
When design-system review is inapplicable, state why and retain the component results and evidence there.
Do not add separate Main Summary, Component Review, Check Results, Per-file Coverage, or Execution Evidence outer sections.
Make the footer name actual launched domains, completed results, and any failed or missing domain coverage.
Claim parallel execution only when multiple domain subagents actually ran concurrently.

Return one Phabricator-ready comment using this structure:

```markdown
**Recomp frontend review**

[Brief overall verdict covering component and design-system reviews, must-fix issues, and unresolved evidence.]
[Selection identities, associated bugs, supplied aim, intent alignment, and acquisition limitations.]

---

### Issues

**[Category name]** · [Severity, including must-fix status where required]

[Deduplicated findings, ordered by severity, with every shared issue field and suggested patch.]

---

### Suggestions

[Deduplicated evidence-backed nonblocking suggestions.]

---

### Required Testing and Follow-up

**[Category name]** · [Testing Required or Follow-up Required]

[All unresolved checks, unrun falsifiers, acquisition gaps, and uncovered behavior.]
[Preserve related check IDs, affected consumers, missing evidence, exact steps, and expected observations.]

---

### Design-System Review

**Files in scope:** [Assigned files, or an explicit not-applicable rationale.]

#### Design Tokens

[TOKEN check results, with status, deciding citations, and issue or follow-up references.]

#### CSS Cascade, Contrast Modes, and Layout

[CSS check results, with status, deciding citations, and issue or follow-up references.]

#### Design-System Structure

[STRUCT check results, with status, deciding citations, and issue or follow-up references.]

#### Check and Coverage Details

| Domain | Check ID | Category | Status | Evidence | Issue or follow-up |
|---|---|---|---|---|---|
[Every assigned component check and each domain's EVID checks, including NOT APPLICABLE and NOT VERIFIED.]
[Design-system TOKEN, CSS, and STRUCT results appear in their categories above, without duplication.]

| File | Domain | Reviewed regions and checks | Result or limitation |
|---|---|---|---|
[Every changed file, including excluded files marked out of filter scope.]

**Execution evidence:** [Observed reads and searches, supplied execution provenance, and explicit not-run reasons.]
[Retain material corrections and all unresolved coverage.]

### Design-System Summary

[Scoped design-system conclusion and outstanding checks, or an explicit not-applicable rationale.]

---

*Scoped source review by [actual launched domain subagents and completion status], without an independent adversarial verification round.*
```

Keep every prose sentence within twenty-five words.
Save the comment only when requested, using the requester's selected destination or an available artifact capability.
Do not impose a personal report location.

Complete this step with all domain results, follow-ups, excluded files, and evidence represented in the final comment.
