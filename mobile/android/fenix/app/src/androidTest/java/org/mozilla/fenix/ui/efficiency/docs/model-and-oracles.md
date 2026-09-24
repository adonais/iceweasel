# Model-based testing and trustworthy oracles

**Audience:** harness maintainers, factory authors, and reviewers of modeling decisions.

The harness applies model-based-testing ideas to Fenix UI automation. The model is executable and
deliberately independent of the app's production navigation implementation: it describes what a user
can observe and do, while the app remains the system under test.

This is an engineering approach, not a claim of formal conformance testing. The model is intentionally
partial, and its guarantees extend only as far as its states, transitions, contexts, and oracles.

## What the model contains

| Model concept | Harness representation | Question it answers |
| --- | --- | --- |
| Observable surface | page or component in `PageContext` | What UI state can a test name? |
| State identity | `IDENTIFIED` readiness selectors and rules | Is this the intended surface rather than a lookalike? |
| Usable state | `NAVIGATION_READY` and `INTERACTIVE` profiles | Has enough content arrived for the next modeled operation? |
| Transition | `NavigationEdge` and `NavigationStep` | Which user-observable action moves between states? |
| Preconditions | route `requires` and `forbids` facts | When is this transition valid? |
| State effects | route `provides`, `invalidates`, and typed effects | What relevant state changes after it runs? |
| Execution context | launch and execution requirements | Which environment and resources make the case meaningful? |
| Evidence | structured events, checkpoints, and failure artifacts | What proves what ran and why it passed or failed? |

`PageContext` composes these declarations into a new graph for each test. Keeping the test model outside
the production router preserves oracle independence: copying the app's own route table would make the
test repeat the implementation's assumptions instead of checking them.

## An oracle is more than an assertion call

An oracle decides whether an observed result is acceptable. UI automation often has several nested
oracles, each protecting a different claim:

1. **Identity oracle:** a sufficient fingerprint distinguishes the intended page or component from
   nearby or visually similar states.
2. **Readiness oracle:** the content needed for a transition or interaction is present in the relevant
   runtime state.
3. **Transition oracle:** after an action, the destination identity/readiness and modeled state effects
   hold.
4. **Interaction oracle:** a control changed the immediate state it was meant to change.
5. **Behavior oracle:** the user-visible domain outcome holds, possibly across several pages or actions.
6. **Isolation oracle:** setup and teardown establish the declared boundary, so the result is not caused
   by another test or attempt.
7. **Evidence oracle:** the named case actually ran, completed, and produced enough structured evidence
   to interpret its outcome.

The lower layers do not replace the higher ones. Reaching a correctly identified Settings page proves
reachability; it does not prove that changing a setting affected browser behavior. Conversely, a
behavior assertion is difficult to trust if the setup and intermediate page identities were assumed.

### Avoiding vacuous success

An executable step without an observable result is a candidate, not proof. For example, clicking a
toggle and observing no failure does not establish that the value changed, and finding one shared text
label may not establish which page is open. Factories must retain this distinction: a combination with
missing setup or a missing result oracle should be rejected or reported as incomplete rather than
silently counted as coverage.

Readiness contracts are intentionally non-vacuous. A profile succeeds only when at least one applicable
rule exists and every applicable rule succeeds. Conditional rules make variant-specific UI explicit
without turning an optional element into an unconditional requirement.

## Page fingerprints and readiness

A page fingerprint is the evidence used by the `IDENTIFIED` profile. There is no universal required
number of selectors. Use the smallest set that reliably distinguishes the page across its supported
states. A unique toolbar title may be enough; a shared settings row is not. Multiple independent anchors
are useful when no single stable handle identifies the surface, but arbitrary selector-count minimums
encourage redundant or fragile text checks.

The profiles have separate purposes:

- `IDENTIFIED` is a fast probe used to recognize the page.
- `NAVIGATION_READY` proves an intermediate page has the content needed to continue its outgoing route.
- `INTERACTIVE` proves a destination or explicit waypoint is ready for test interaction.

Selector metadata provides common rules through `IDENTITY_ANCHOR` and `READY_CONTENT`.
`PageReadinessRule` adds `AllOf`, `AnyOf`, and state- or route-dependent conditions when static metadata
is insufficient.

Each probe resolves against the live UI. The harness does not reuse a hierarchy snapshot or cached
coordinates for the following action, and it does not treat global UI idleness as a stable page oracle.
Background work can redraw a surface after either snapshot or idleness, so the interaction resolves its
target again just in time.

## Navigation is stateful planning plus observation

The graph is not merely a list of shortest click sequences. A navigation request may require waypoints,
facts, or routes; exclude pages or routes; and express soft avoidance preferences. Route guards and
effects produce a sequence of modeled `NavigationState` values. The planner ranks eligible paths
deterministically, preferring setup routes and avoiding undesirable intermediate surfaces before
considering path length.

Execution then checks the starting page, runs one edge, verifies the arrived page, and only after that
checkpoint advances `PageStateTracker`. This order prevents the model from claiming a transition that
the app did not visibly complete. Intermediate pages use navigation readiness; destinations and
waypoints use interactive readiness unless a typed per-request override says otherwise.

## Factories enumerate; planning selects

Factories turn model structure into candidate coverage:

- reachability covers modeled page/state nodes;
- transition coverage covers individual valid edges;
- transition-sequence coverage covers state-dependent paths;
- interaction and behavior factories pair actions with their result oracles;
- context matrices vary supported environment dimensions.

Enumeration provides a denominator only for the modeled space. Before a candidate becomes executable
coverage, it needs a valid setup, action, oracle, supported context, state footprint, and cleanup policy.

Risk-based selection is a separate concern. Change impact determines which part of the model is relevant;
risk determines how deeply and urgently to test it; suite profiles and execution budgets determine what
runs. Keeping enumeration and selection separate lets the same reviewed model support a small build
check, affected-area validation, nightly depth, or release confidence without hand-maintaining unrelated
suite lists.

## Design limits and maintenance obligations

- A model can drift. Graph construction checks structural contradictions, while reachability and authored
  behavior tests check the model against the live app.
- State-space growth is real. Model only decision-relevant state, use typed facts and equivalence classes,
  and do not enumerate every data value as a distinct state.
- Identity anchors can be ambiguous or state-specific. Prefer stable semantic handles and encode variants
  explicitly.
- The oracle problem remains: some outcomes are difficult or expensive to observe. Mark missing proof
  rather than substituting an unrelated presence check.
- Independent models can be wrong as well as production code. Review model changes as test logic, retain
  evidence, and compare against known behavior and release expectations.

## Relationship to testing theory

The model follows standard model-based-testing vocabulary: abstract states, transitions, guards, test
generation, execution, and verdicts. State fingerprints also address the state-identification concern
found in finite-state-machine conformance testing. T. S. Chow's 1978 W-method work is relevant background,
but this harness does not meet the assumptions required for a W-method conformance guarantee and should
not be described as doing so.

Useful background:

- [A Taxonomy of Model-Based Testing Approaches](https://ethz.ch/content/dam/ethz/special-interest/infk/inst-infsec/information-security-group-dam/research/publications/pub2006/uow-cs-wp-2006-04.pdf)
- [Testing Software Design Modeled by Finite-State Machines](https://archiv.infsec.ethz.ch/intranet_secured/r/1/chow-testingFSMs.pdf)
- [The Oracle Problem in Software Testing](https://discovery.ucl.ac.uk/id/eprint/1471263/1/06963470.pdf)
