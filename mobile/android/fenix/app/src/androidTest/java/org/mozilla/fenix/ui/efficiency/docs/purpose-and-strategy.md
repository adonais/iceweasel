# Purpose and release-testing strategy

**Audience:** release stakeholders, reviewers, test architects, and harness contributors.

This document explains why the efficiency harness exists. It describes the direction of travel, not a
claim that every part of the release-planning system is implemented today. Current implementation
details live in [`architecture.md`](architecture.md).

## The problem is larger than test syntax

Fenix has valuable authored UI tests and years of release evidence. The problem is not that those tests
are uniformly bad or that a shorter test method is automatically better. The harder problems are:

1. **Maintenance cost.** Tests duplicate selectors, navigation, setup, waiting, and cleanup. A product
   change can require many local repairs, and the cost of the next test remains high.
2. **Trust and diagnosis.** A failure may represent a product defect, a stale locator, navigation drift,
   leaked state, an unavailable dependency, or an incomplete assertion. When those causes are
   indistinguishable, red results are expensive and green results may be misleading.
3. **Release decisions.** A pile of test methods is not an explicit denominator of possible coverage.
   It is difficult to ask which product states and transitions are modeled, which are unsupported, and
   which subset provides the best evidence for a particular change and risk budget.

The harness addresses these as one system. Shared mechanics reduce maintenance, executable contracts
make results more trustworthy, and a model gives factories and future planning tools structured inputs.

## What "efficiency" means

Efficiency is the amount of useful, attributable release evidence obtained for the engineering and
execution cost spent. It includes:

- lowering the marginal cost of adding and maintaining coverage;
- detecting harness and model defects before they masquerade as product results;
- containing state so a result does not depend on test order or an earlier attempt;
- enumerating a defined testing space instead of relying only on historically accumulated examples;
- selecting from that space according to change impact, risk, context, and available time;
- producing evidence that a person or deterministic tool can audit.

Individual test runtime and lines of code matter, but optimizing either in isolation can reduce trust.
For example, caching one UI snapshot may make several checks faster while making the following action
operate on stale state. The harness favors reliable evidence and diagnosable failures over local-looking
speedups.

## From product intent to release evidence

The intended pipeline is:

1. Model observable pages and app states, the transitions between them, and the conditions under which
   those transitions are valid.
2. Attach independent oracles that identify pages, establish readiness, and verify transition,
   interaction, and behavior outcomes.
3. Let factories enumerate candidate cases from that model. This creates a measurable testing-space
   denominator for what has been modeled.
4. Reject or label candidates whose setup, oracle, context, or cleanup contract is incomplete.
5. Map a product change to the affected model surface. Impact determines scope; risk determines
   priority and depth.
6. Select a deterministic suite profile that fits the decision and execution budget, then retain
   structured evidence from each attempt.

Today, the harness implements much of the model and execution foundation: centralized selectors,
page/readiness contracts, state-aware navigation, explicit launch and resource requirements, cleanup
boundaries, structured logging, and a reachability factory. Broader risk selection, coverage analysis,
and several other factory types remain follow-up work. Keeping that boundary explicit prevents a design
goal from being mistaken for a current guarantee.

### Enumeration, selection, and gating are different jobs

- **Factories enumerate** candidate coverage from the model and expose what is representable or missing.
- **Suite profiles select** a useful subset for a build check, affected-area run, nightly run, or release
  decision.
- **Gates decide** when that profile runs and whether its evidence blocks progress.

Conflating these jobs makes factories encode release policy, or makes static suite lists stand in for a
coverage model. Keeping them separate allows reviewed candidates to be reused as risk, time, and product
impact change.

## Before and after

| Concern | Historically common test shape | Harness direction |
| --- | --- | --- |
| Navigation | Each test or robot repeats a procedural route | Pages contribute typed routes to one per-test graph |
| Page arrival | One text match or an implicit assumption | A live identity/readiness contract checks every visited page |
| State | Setup is distributed or depends on prior execution | Launch, resources, modeled facts, and cleanup have explicit owners |
| Assertions | An action or presence check may pass without proving the behavior | Oracles are named by the result they establish; missing proof stays visible |
| Failure output | Product, harness, and environment failures look alike | Structured steps, state, routes, and screen dumps support attribution |
| Coverage growth | Add another independently maintained method | Reuse the model or enumerate a well-defined factory candidate |
| Release selection | Mostly static suite membership and historical knowledge | Planned: change impact and risk select from the modeled testing space |

This is not a claim that all legacy tests are vacuous or unstable. Authored tests remain essential for
domain-specific behavior and critical journeys, and the legacy suite remains part of release evidence
while the new system earns trust. The comparison is about making assumptions explicit and reusable.

## Why factories need a trustworthy model

A factory amplifies both good and bad abstractions. If page identity is weak, setup leaks, or an action
has no result oracle, enumeration creates more ambiguous executions rather than more confidence.
Consequently, the foundation is deliberately strict:

- every discoverable navigable page must have a readiness contract;
- every graph endpoint and checkpoint verifier is validated at graph construction;
- graph ownership is per test rather than process-global;
- navigation advances modeled state only after the arrived page satisfies its checkpoint;
- selector catalogs are discoverable, typed, and validated;
- setup, cleanup, and evidence contracts are part of execution rather than hidden convention.

These constraints are not ceremony around page objects. They are what let a generated test case mean
something and what allow future analysis to distinguish known coverage, missing setup, missing oracles,
and unsupported contexts.

## What this approach does not promise

- It is not a complete model of Fenix. The analyzable denominator includes only the states, transitions,
  contexts, and oracles that have been modeled.
- It does not eliminate authored behavior tests or exploratory testing.
- It does not prove the app correct or provide formal conformance guarantees.
- It does not make every generated combination a runnable or valuable test.
- It does not use runtime AI judgment as a release gate. Tools may propose mappings or cases, but a gate
  must be replayable from reviewed rules and evidence.
- It cannot remove all environmental intermittency. It should expose, contain, and attribute it.

The practical objective is narrower and useful: make Fenix UI coverage cheaper to maintain, harder to
pass vacuously, easier to diagnose, and structured enough to support progressively better risk-based
release testing.
