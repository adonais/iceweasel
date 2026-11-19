# Reusable Components Frontend Review Runsheet

Use this checklist for scoped Firefox widget, design-token, and design-system changes.
Review the frozen or host-supplied source corpus at the reviewed implementation version.
In standalone review, resolve checkout paths against the selected Firefox root.
In injected review, use the host's source tools without discovering a checkout.
Record each stable check ID with its result and deciding evidence.

The reusable-component domain owns the component API, shared reuse, and cross-commit categories.
The design-system domain owns the token, CSS, and design-system structure categories.
Each applicable domain applies the shared evidence category to its assigned changes.
These ownership rules apply both to direct automated review and standalone domain subagents.

Use [Shared scope and domains](../SKILL.md#shared-scope-and-domains) in the overview for scope, exclusions, and domain applicability.
These checks establish source-supported conclusions, not visual or runtime guarantees.

## Contents

- Component domain
  - [Component APIs and Backwards Compatibility](#component-apis-and-backwards-compatibility)
  - [Shared Reuse and Consumer Regressions](#shared-reuse-and-consumer-regressions)
  - [Cross-Commit Coherence and Migration Completeness](#cross-commit-coherence-and-migration-completeness)
- Design-system domain
  - [Design Tokens and CSS Custom Properties](#design-tokens-and-css-custom-properties)
  - [CSS Cascade Contrast Modes and Layout](#css-cascade-contrast-modes-and-layout)
  - [Design-System Structure](#design-system-structure)
- Shared evidence
  - [Test Coverage and Evidence Validation](#test-coverage-and-evidence-validation)
  - [Results and reporting contract](#results-and-reporting-contract)
  - [Checks](#checks)

## Component APIs and Backwards Compatibility

- **API-01 — Public contract inventory.** Enumerate changed methods, properties, attributes, events, and defaults from the before-and-after definitions.
  Cite declarations, implementation branches, and existing contract documentation or tests that decide each change.
- **API-02 — Return semantics.** Trace every affected return path, including absent values, collection contents, ordering, and synchronous or asynchronous behavior where relevant.
  Inspect and quote caller use and assumptions when they decide compatibility or a claimed mismatch.
- **API-03 — Handler and event semantics.** Read changed handlers, invoked callees, and dispatch sites before judging their meaning; inspect consumers when needed to establish compatibility or a claimed consequence.
  Compare event names, payloads, timing, propagation, cancellation, and resulting state only where the change affects those contracts.
- **API-04 — Backwards compatibility.** For changed public contracts, search the reviewed-version source corpus for affected API names and their actual invocation forms.
  Compare each discovered caller's arguments, attribute values, listeners, and expected results with the revised implementation.
  Record search coverage and uninspected callers.
- **API-05 — Contract implementation agreement.** Compare documented behavior, applicable tests, and implementation branches for each changed public contract.
  Identify the exact branch or assertion that decides any inconsistency, without treating a comment as proof of implemented behavior.
  For affected controls, distinguish DOM attributes from accessible names, roles, states, focus, and activation behavior.

## Shared Reuse and Consumer Regressions

- **REUSE-01 — Existing shared behavior.** Search for existing implementations of the behavior introduced or replaced by the scoped component change.
  Compare their contracts and consumer requirements before alleging duplication or recommending reuse.
  Cite the deciding implementation differences rather than inventing a house convention.
- **REUSE-02 — Consumer impact.** Trace changed shared behavior into its discovered consumers, including callers outside the scoped file filter.
  Show the before-and-after execution path and the concrete consumer outcome supported by source.
  Keep unresolved runtime consequences separate from established source differences.
- **REUSE-03 — Supported configurations.** Enumerate affected configurations, states, and overrides from component definitions and consumer usage.
  Enumerate only affected initialization, update, clear, disconnect/reconnect, and close/reopen transitions.
  Include null clearing and same-value writes where relevant.
  Distinguish retained-node text mutation from node replacement.
  Trace whether each still reaches the intended shared behavior, citing branches and consumer setup that decide the result.
- **REUSE-04 — Ownership of shared behavior.** Compare revised component responsibilities with existing consumers and analogous shared implementations.
  Identify any newly required consumer workaround or duplicated wiring, and cite the contract change that makes it necessary.

## Cross-Commit Coherence and Migration Completeness

- **STACK-01 — Commit dependencies.** Map changed interfaces and resources to the commits introducing their definitions and consumers.
  Compare each dependent change with its prerequisites and identify the exact incompatible intermediate or final source state.
  Do not report an earlier defect already repaired by the reviewed final state as an unresolved issue.
- **STACK-02 — Token migration.** Search declarations, aliases, imports, and uses for every renamed or removed token.
  Compare the final combined source with the migration intent and cite surviving obsolete references or incompatible replacements.
  Reuse TOKEN-01's declaration-and-use inventory when available, then assess migration intent across captured commits without repeating covered searches.
  In delegated review, request that inventory through the orchestrator and disclose any missing evidence.
- **STACK-03 — Localization and schema migration.** For affected localized identifiers or schemas, compare definitions, references, loaders, and migration code across the stack.
  Cite missing or incompatible counterparts and the consumer path requiring them.
  Mark this check inapplicable when the scoped changes do not affect these resources.
- **STACK-04 — Interface migration.** Search old and new widget interface forms and compare every discovered dependent caller with the final contract.
  Identify partially migrated arguments, properties, events, imports, or registrations using exact source references.
- **STACK-05 — Combined architecture and coverage.** Trace interactions between changed components, resources, and tests in the final combined source.
  Compare those interactions with each commit's assumptions and test coverage, identifying cross-commit gaps invisible in isolated diffs.

## Design Tokens and CSS Custom Properties

- **TOKEN-01 — Declaration and use inventory.** Enumerate added, changed, renamed, and removed custom properties and their scoped consumers.
  Search relevant dependencies for declarations and uses, then cite missing definitions, stale names, or inconsistent meanings.
  Share this inventory with STACK-02, including searched corpus, queries, citations, and coverage limits.
- **TOKEN-02 — Established naming evidence.** Read nearby token definitions and applicable repository documentation before judging a new custom property's name.
  Quote the demonstrated convention and matching examples, or record that no deciding convention was found.
  Do not infer prohibited names or values from personal preference.
- **TOKEN-03 — Complete resolution chains.** Follow every token reference and fallback supporting a claimed value through aliases and conditional definitions to concrete values.
  Record each hop, applicable conditions, and unresolved or cyclic references.
  Mark any consequence requiring unavailable computed values as not verified.
- **TOKEN-04 — Consistent semantics.** Compare modified token definitions and their consumers across applicable component states and style variants.
  Cite the declaration and consuming property that establish an intended equivalence or incompatible use.
  Distinguish deliberate contextual overrides from accidental naming or value mismatches using existing source contracts.

## CSS Cascade Contrast Modes and Layout

- **CSS-01 — Cascade context.** Read complete enclosing rules, imports, selectors, layer declarations, and competing declarations for each claimed CSS regression.
  Report layer order, applicable media conditions, specificity, and importance where they decide the winning declaration.
  A matched property line alone does not establish the cascade.
- **CSS-02 — Contrast-mode branches.** Trace changed declarations through their existing high-contrast, forced-colors, or other contrast-related media branches where present.
  Compare token chains and competing rules in each affected branch, citing the conditions that activate them.
  Do not assert visual legibility from source inspection or introduce unrelated contrast standards.
- **CSS-03 — Layout model first.** Read the component's rendering source and record actual DOM order before making a geometry claim.
  Quote applicable flex or grid directions, ordering rules, and layout constraints before calculating positions or dimensions.
  State which runtime-dependent inputs remain unknown.
- **CSS-04 — Reproducible arithmetic.** Resolve every token contributing to a layout calculation through its full chain to concrete values.
  Show units, equations, assumptions, and deciding declarations, including relevant box-model terms.
  Keep conclusions requiring unobserved computed geometry in the review's follow-up section, as defined by the overview.

## Design-System Structure

- **STRUCT-01 — Resource connectivity.** Trace changed design-system resources through their actual imports, references, registrations, and existing packaging configuration where applicable.
  Cite the definitions and loading paths that establish reachability or a broken connection.
- **STRUCT-02 — Structural relationships.** Compare modified component, stylesheet, and token relationships with their existing definitions and documented responsibilities.
  Identify inconsistent ownership, unresolved dependencies, or incompatible structural assumptions using the exact source links involved.
  Do not require a new directory layout or architecture without repository evidence.
- **STRUCT-03 — Coherent final structure.** Read related changed design-system files together and trace their consumers against the final source state when needed to establish compatibility or a claimed consequence.
  Cite mismatched interfaces, disconnected resources, or incomplete shared changes, and identify the affected consumer path.

## Test Coverage and Evidence Validation

Apply the domain ownership rules above to this category.

### Results and reporting contract

Use one result for each check, with a reason and deciding evidence:

- **PASS:** Deciding evidence satisfies the applicable source check within its recorded scope.
  Source inspection does not establish unobserved runtime behavior.
- **FAIL:** Deciding evidence establishes a specific defect, including its consumer consequence and an independently evaluated falsifier.
- **NOT APPLICABLE:** Explain why the assigned changes do not exercise the check.
- **NOT VERIFIED:** Name missing evidence and specify the exact test or inspection needed, including setup, action, and expected observation.

Quote deciding source verbatim with exact repository `file:line` references against the frozen reviewed source.
Record commands and outcomes only when executed, otherwise record `not run: <reason>`.
Do not execute builds, tests, lint, formatters, or other gates during this review.
Validation and smoke execution are outside this source review.
Assess supplied execution evidence under EVID-04 and retain follow-up for unsettled runtime claims.

Each FAIL finding must identify its check ID, severity, quoted location, mechanism, and concrete effect on consumers.
Include an independent falsifier, its observed result, a fix explanation, and a minimal suggested patch against the frozen source.
Use a fenced unified `diff` with exact repository paths, valid syntax, sufficient unchanged context, and every file required by the fix.
Verify that the explanation and patch address the demonstrated defect rather than a different concern.

Put `NOT RUN` falsifiers, unsettled claims, missing runtime coverage, and specific required tests in the review's follow-up section, not defect findings.
Report refuted claims as corrections, not actionable findings.
Do not promote dismissed allegations or disproven remedies into recommended review rules.
Distinguish valid underlying observations from refuted harmful consequences.
Require fresh deciding evidence before reopening a refuted claim or remedy.
Apply the overview's coverage and clean-verdict requirements.

### Checks

- **EVID-01 — Behavior-to-test mapping.** Enumerate changed contracts, branches, states, and affected consumer interactions, then map each to test setup and assertions.
  Cite existing coverage and identify uncovered behaviors, including interactions across commits.
  Specify the exact missing regression test and expected observation for each unresolved behavior.
- **EVID-02 — Assertions and counterexamples.** Read assertion inputs, expected values, fixtures, and implementation paths together.
  Identify the independent contract evidence supporting each expectation and a concrete incorrect implementation the assertion would reject.
  Distinguish independent test oracles, sensitivity to the changed regression, and protection of unchanged behavior.
  Passing old code alone does not establish tautology.
  Explain source-supported limitations instead of claiming a test failed without execution.
- **EVID-03 — Harness requirements.** Read each relevant harness helper's definition and doc comment before claiming prerequisites, guarantees, or unavailable capabilities.
  Compare test invocation, synchronization, setup, and cleanup with those documented requirements and quote the deciding lines.
- **EVID-04 — Runtime evidence boundaries.** Inspect supplied execution evidence for the reviewed source, named tests, setup, and observed outcomes.
  Verify that supplied artifacts implement the changed API and that execution reaches the named assertions.
  Proxy execution or process exit alone does not establish scenario success.
  Separate source-proven behavior from unexecuted expectations, and specify follow-up when runtime behavior or computed styling remains unsettled.
- **EVID-05 — Universal negatives.** For claims that no caller, pattern, declaration, or test exists, record the searched corpus and exact query.
  Search counterexample forms, alternate invocation or declaration forms, and relevant dependencies rather than only the expected claim wording.
  Report search breadth and exclusions, and limit the conclusion accordingly.
- **EVID-06 — Mechanism and consequence.** Decompose every proposed finding into source behavior, intervening assumptions, and consumer consequence.
  Read the deciding regions for each link, identify the weakest link, and evaluate an independent observation that could refute the claim.
  For public API compatibility, construct a valid consumer configuration from the established contract, including nondefault overrides and relevant state transitions.
  Trace that configuration through complete before-and-after implementation paths to the externally observable result.
  A source-supported counterexample can establish a scoped defect without locating a deployed caller or executing a browser.
  Record the falsifier's actual source observation, and label predicted runtime outcomes as unexecuted.
  Missing usage breadth or author discussion limits prevalence or intent claims, not an otherwise established contract violation.
  If a deciding dependency or intervening assumption is missing, keep the consequence NOT VERIFIED.
- **EVID-07 — Citation drift.** Re-read every cited region against the frozen reviewed source and compare its actual wording with the associated claim.
  Correct inaccurate lines, paths, quotations, or interpretations even when the broader finding survives.
- **EVID-08 — Fix and falsifier agreement.** Compare each actionable finding's observed falsifier result, explanation, and suggested patch with the deciding source.
  Confirm that the patch addresses the established cause and covers every required edit without relying on unobserved execution.
