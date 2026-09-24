# Test execution requirements and opt-in capabilities

## Status

This document proposes the next step for the execution contract introduced by
`EfficiencyExecutionRequirements`. The typed contract and centralized lifecycle already exist. The annotation-based
API, fixture catalog, and opt-in MockWebServer default described below do not.

The efficiency suite currently runs with JUnit 4.13.2 through `AndroidJUnitRunner`. These recommendations therefore use
JUnit 4 `TestRule`, `Description`, `@Before`, and `@After` semantics. They do not depend on a JUnit Jupiter extension or
annotation engine.

## Problem

An efficiency test inherits environment setup, cleanup, activity launch, and a MockWebServer from `BaseTest`. Until the
execution contract was added, those dependencies were distributed across rules and hooks rather than declared in one
place. The contract makes the behavior typed and overridable, but optional resources still need a clear authoring API.

The main example is MockWebServer. `EfficiencyTestRule` can omit it when a test requests `NOT_NEEDED`, but the current
default is `AVAILABLE`. As a result, every ordinary efficiency test starts a server even when it never requests a test
asset. The mechanism is conditional; suite usage is not yet opt-in.

We want an API that makes dependencies visible at the test, class, or generated-case boundary without making authors
understand rule ordering or manually manage shared resources.

## Design principles

1. **Isolation is mandatory; optional capabilities are opt-in.** App-data cleanup, activity teardown, failure capture,
   and restoration of changed device settings are harness invariants. A test must not disable them merely because it
   does not know it needs them. A server, mock location provider, special permission, or feature-specific fixture is an
   optional capability and should be requested explicitly.
2. **Declarations describe needs, not setup steps.** A test says that it needs web fixtures. The harness decides how to
   start and stop the server, make fixture URLs available, log the resolved contract, and verify cleanup.
3. **One resource has one owner.** `EfficiencyTestRule` should be the sole MockWebServer lifecycle owner in this suite.
   Tests must not add a second `MockWebServerRule` or start a second server.
4. **Undeclared use fails early.** Accessing `mockWebServer` without declaring the capability should produce an error
   that names the missing declaration. It should not silently start the resource on first access, because that hides
   dependencies and makes setup timing depend on test execution order.
5. **One resolved contract drives execution.** Defaults, class annotations, method annotations, and generated-case
   requirements should resolve into one `EfficiencyExecutionRequirements` value before setup begins.
6. **Setup and teardown are symmetric.** If the harness changes or allocates something, it owns cleanup and verifies it
   where practical. Cleanup failures remain test failures rather than log-only warnings.

## Separate invariants from capabilities

Not every setup behavior should become an annotation.

### Harness invariants

These remain automatic for every test:

- failure logging and screen capture;
- app-data and runtime-state boundaries;
- activity and task cleanup;
- input cleanup;
- restoration of device settings changed by the harness; and
- final cleanup verification.

### Baseline execution profile

Defaults that genuinely apply to nearly every efficiency test can remain in `EfficiencyExecutionRequirements`, such as
the normal launch configuration or portrait orientation. They should still be typed and logged. A default belongs here
only when opting out is exceptional and has explicit semantics.

### Optional capabilities

Resources or modes that only some tests use should be opt-in. Likely examples include:

- MockWebServer and named web fixtures;
- mock location;
- runtime-permission variants;
- prompt-abuse or other mutable feature state; and
- specialized external services or test data.

## Recommended authoring API

Use small, typed annotations for common boolean capabilities:

```kotlin
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresMockWebServer

@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresMockLocation
```

A class declaration applies to every test method in that class:

```kotlin
@RequiresMockWebServer
class AddressAutofillTest : BaseTest() {
    // Tests in this class may use server-backed assets.
}
```

A method declaration is preferable when only one test needs the capability:

```kotlin
class SettingsTest : BaseTest() {
    @Test
    @RequiresMockWebServer
    fun verifySiteSetting() {
        // This method may use server-backed assets.
    }
}
```

If the number of boolean annotations grows, a grouped annotation keeps declarations compact without losing type
safety:

```kotlin
enum class TestCapability {
    MOCK_WEB_SERVER,
    MOCK_LOCATION,
}

@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class UsesTestCapabilities(vararg val value: TestCapability)
```

Use a single-purpose parameterized annotation for a setting that carries a value rather than a yes/no capability:

```kotlin
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresOrientation(val value: RequiredOrientation)

@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class RequiresDataSaver(val value: RequiredState)
```

Prefer the smallest form that remains readable. A dedicated annotation is clearest for a common capability. A grouped
annotation is useful for uncommon boolean capabilities. A single-purpose parameterized annotation is appropriate for
a setting with meaningful modes and avoids unrelated default arguments accidentally overriding a broader declaration.

### Profiles for tests with many dependencies

A test with many declarations usually represents a recurring environment profile. Give that profile a domain name
instead of repeating a long list:

```kotlin
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class DownloadFlowEnvironment
```

The contract resolver expands `DownloadFlowEnvironment` into typed requirements. Profiles should describe a cohesive
product scenario, remain uncommon, and have their expansion tested. Avoid generic names such as `FullEnvironment` or a
single profile that gradually accumulates unrelated capabilities.

Under JUnit 4, custom annotations do not automatically compose other annotations. The harness resolver must recognize
and expand each supported profile explicitly.

## Resolution and precedence

Resolve requirements once, before any environment setup or activity launch:

1. mandatory harness invariants;
2. the suite baseline;
3. class-level capability, setting, and profile declarations;
4. method-level capability, setting, and profile declarations; and
5. generated-case requirements, when a factory varies the environment per case.

The result is one immutable `EfficiencyExecutionRequirements` instance recorded in the attempt metadata.

Boolean capabilities combine additively. Scalar settings use the most specific declaration. Contradictory declarations
at the same specificity should fail before setup with a message that names both declarations. A method may override a
class setting only when the setting is explicitly designed to be overridable.

`BaseTest.executionRequirements(description)` is the current resolution seam. The resolver can inspect the JUnit 4
`Description` for method annotations and its test class for class annotations, merge those with the base requirements,
and return the existing typed contract. Tests should not need to override the function for ordinary cases after the
annotation API exists.

### Generated tests and factories

Annotations describe the test method and class, not an individual parameterized or generated case. When cases within
one factory need different environments, the case model must carry typed requirements:

```kotlin
data class ReachabilityCase(
    val target: PageNode,
    val requirements: EfficiencyExecutionRequirements,
)
```

The factory-provided case requirement has the highest specificity because it represents the actual dispatched unit.
This also keeps requirements visible to sharding, logging, replay, and future scheduling tools.

## MockWebServer and web fixtures

### Recommended default

Change `EfficiencyExecutionRequirements.mockWebServer` from `AVAILABLE` to `NOT_NEEDED`, then add an explicit
declaration to tests and generated cases that use server-backed assets.

The expected benefits are:

- no socket, dispatcher, server task runner, or shutdown work for tests that do not use them;
- an accurate dependency contract in logs and generated-case metadata;
- one obvious ownership path; and
- immediate detection of accidental server use.

The runtime saving should be measured rather than assumed. Even if the time saving is modest, explicit ownership and
fail-fast behavior still improve maintainability.

### Fixture declaration

The current asset dispatcher serves files from the test APK by URL path. Tests do not preload or register individual
assets with the server. Helpers construct URLs for those packaged assets after the server has started.

A later, optional layer can make fixture intent visible without changing that mechanism:

```kotlin
enum class WebFixture {
    ADDRESS_FORM,
    CREDIT_CARD_FORM,
    GENERIC_PAGE,
}

@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
@Retention(AnnotationRetention.RUNTIME)
annotation class UsesWebFixtures(vararg val value: WebFixture)
```

`UsesWebFixtures` implies `RequiresMockWebServer`. The rule starts one server, and a fixture catalog resolves the named
fixture to a URL using that server. The URL itself cannot be an annotation argument because its port is only known at
runtime.

This catalog is primarily an authoring and observability improvement. It does not reduce APK asset packaging or server
startup by itself. Tests that need a custom dispatcher can keep test-specific configuration, but the harness should
still own the single server lifecycle.

### Guardrails

- The `mockWebServer` accessor checks the resolved requirement and gives a targeted error when the capability was not
  declared.
- A contract test or lint check rejects another `MockWebServerRule` within the efficiency suite.
- Startup and shutdown are idempotent within the rule but are never used to conceal a second owner.
- Logs include whether the server was requested and, when available, the names of declared fixtures.

## Rules, hooks, and activity scenarios

### JUnit rules

A `TestRule` is the right abstraction for a cross-cutting lifecycle that must wrap `@Before`, the test method, and
`@After`, react to the test `Description`, guarantee cleanup in `finally`, and participate in explicit rule ordering.
That matches environment contracts, resource ownership, activity ownership, and failure reporting.

Keep the number of independently ordered rules small. JUnit 4 does not guarantee a useful order for multiple rules
unless ordering is made explicit. `BaseTest` already assigns rule order; new capabilities should resolve inside the
existing execution rule rather than adding a rule field to every test.

### `@Before` and `@After`

Hooks are appropriate for small fixtures local to a test class: initialize a field used by several methods in
`@Before`, and release exactly that resource in `@After`. They are a poor fit for suite-wide environment ownership
because they cannot naturally wrap all other hooks, centralize ordering, or resolve method annotations before setup.

Every resource acquired in `@Before` needs matching teardown. Teardown should restore the sampled original state when
possible rather than hardcoding a presumed default. Repeated hook pairs that manipulate the same global setting are a
signal to move that behavior into the execution contract.

### `ActivityScenario`

`ActivityScenario` is a lifecycle controller for tests that need to launch an activity directly, move it among
lifecycle states, recreate it, or launch it at a specific point in the test. It should be closed explicitly, normally
with `use`, or owned by `ActivityScenarioRule` for a launch-before-each-test lifecycle.

The efficiency harness does not need to replace its activity rule merely because `ActivityScenario` exists. Its Compose
rule and `HomeActivityIntentTestRule` jointly provide Compose access, configurable Fenix launch behavior, failure
capture while the activity is still visible, and ordered cleanup. A focused lifecycle test may still use
`ActivityScenario` when lifecycle manipulation is the subject of that test, but there should not be two owners for the
same activity.

## Lifecycle

The target lifecycle is:

```text
resolve execution contract
  prepare and verify the environment
    start requested optional resources
      establish app-data boundary
        launch activity
          run @Before
            run @Test
          run @After
        capture failure and close activity
      verify app-data/runtime cleanup
    stop requested optional resources
  restore and verify the environment
record the final attempt outcome
```

This ordering makes resources available to class hooks and the test while ensuring that activity cleanup completes
before environment restoration.

## Current gaps exposed by this review

- MockWebServer is conditionally owned by `EfficiencyTestRule`, but `AVAILABLE` remains the default and the production
  tests do not yet opt out. This is the primary migration proposed here.
- The `mockWebServer` accessor does not yet validate that the resolved contract requested the server.
- `SearchTest` still owns a separate `SearchMockServerRule` to reproduce a legacy 404 dispatcher. That
  documented parity exception must be migrated or represented as typed dispatcher configuration before
  the suite can enforce a single server owner mechanically.
- `POST_NOTIFICATIONS` can be granted during setup, but `EfficiencyTestEnvironment.restoreSnapshot()` does not revoke
  it when the arrival snapshot was denied, and `verifyRestored()` does not compare it. The statement that every applied
  requirement currently has matching restoration and verification is therefore too strong.
- Notifications and shared downloads are deliberate clear-at-both-boundaries policies, not restoration to their
  incoming contents. They should be described as containment rather than symmetric restoration.

## Migration plan

1. Add contract resolution tests for class, method, profile, and generated-case declarations, including conflicts.
2. Add timing fields for optional-resource setup and teardown so the suite can quantify the MockWebServer cost.
3. Add `RequiresMockWebServer` and make the accessor validate the resolved requirement.
4. Annotate current server users, then flip the default to `NOT_NEEDED` in the same patch so no intermediate revision
   silently loses its server.
5. Add a check that prevents direct `MockWebServerRule` ownership in efficiency tests.
6. Add named fixture declarations only if their observability and maintenance value justifies the extra catalog.
7. Move repeated mutable-state hooks, such as prompt-abuse setup, behind typed declarations that snapshot, restore, and
   verify the original value.

Before and after the default flip, run the full efficiency sweep and reachability factory under both the Gradle
orchestrator path and the fleet's `am instrument` path. Compare wall-clock and per-resource timing as well as failures.

## Decision summary

- Keep mandatory isolation and cleanup automatic.
- Make optional resources, beginning with MockWebServer, opt-in.
- Use class annotations for class-wide needs, method annotations for exceptional methods, and typed case data for
  factory-specific needs.
- Resolve every declaration into the existing typed execution contract before setup.
- Keep resource lifecycle in `EfficiencyTestRule`; annotations never perform setup themselves.
- Use named profiles only for coherent, repeated combinations.
- Fail fast on undeclared resource access and conflicting requirements.
- Keep the current Compose-aware activity owner; use `ActivityScenario` only for tests that specifically need direct
  lifecycle control.

## References

- [JUnit 4 `@Rule`](https://junit.org/junit4/javadoc/4.13/org/junit/Rule.html)
- [JUnit 4 annotations](https://junit.org/junit4/javadoc/4.13/org/junit/package-summary.html)
- [AndroidX `ActivityScenario`](https://developer.android.com/reference/androidx/test/core/app/ActivityScenario)
- [Deprecated `ActivityTestRule` migration guidance](https://developer.android.com/reference/androidx/test/rule/ActivityTestRule)
