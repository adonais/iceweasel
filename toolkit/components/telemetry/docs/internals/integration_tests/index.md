# telemetry-tests-client integration tests

The `telemetry-tests-client` suite verifies that Firefox collects telemetry,
aggregates it, and submits pings to an HTTP server. The suite uses
[Marionette Python tests](/remote/marionette/PythonTests.md) to mimic user
behavior while making as few assumptions as possible about Firefox's internal
implementation. wptserve provides the HTTP ping server.

The integration test suite for Firefox Client Telemetry runs on CI with
Treeherder symbol `tt(c)` at each platform's default
[tier](https://wiki.mozilla.org/Sheriffing/Job_Visibility_Policy); see the
{searchfox}`task definition <taskcluster/kinds/test/misc.yml>`.
The client tests are listed in the
{searchfox}`client test manifest <toolkit/components/telemetry/tests/marionette/tests/client/manifest.toml>`
and stored in the
{searchfox}`client test directory <toolkit/components/telemetry/tests/marionette/tests/client/>`.

The client manifest is the authoritative list of client tests. The suite
covers areas such as:

- Legacy Telemetry ping contents and behavior across browser sessions and
  subsessions.
- Firefox on Glean pings, and opt-out and `deletion-request` behavior for both
  Legacy Telemetry and FOG.
- Ping submission and payload correctness.

## Running the tests locally

Run the commands in this section from the source root using
[mach](/mach/index.md).

```shell
./mach telemetry-tests-client
```

The default command also runs the harness self-tests. To run only the client
tests while preserving manifest filtering, use:

```shell
./mach telemetry-tests-client --tag client
```

The client manifest sets `tags = "client"` in its `[DEFAULT]` section, while
the harness self-tests are tagged `unit`; use `--tag unit` to run them.

You can also pass a test manifest, test file, or directory to the command.
Passing a test file or a directory bypasses the manifest. This means that
`skip-if` conditions are ignored and tests that are not expected to pass on
your platform might run. The `--tag` option also has no effect in this mode.

See [Marionette testing](/remote/marionette/Testing.md) for runner options such
as `--gecko-log`, `--headless`, and `--binary`.

## Adding a test

Name new test files `test_*.py` and subclass
{searchfox}`TelemetryTestCase <toolkit/components/telemetry/tests/marionette/harness/telemetry_harness/testcase.py>`
or, for tests that need a Glean ping server,
{searchfox}`FOGTestCase <toolkit/components/telemetry/tests/marionette/harness/telemetry_harness/fog_testcase.py>`.
Add the test to the
{searchfox}`client test manifest <toolkit/components/telemetry/tests/marionette/tests/client/manifest.toml>`
so that the default command and CI run it. See
[Marionette Python tests](/remote/marionette/PythonTests.md) for test structure
and assertions.

A new directory of tests additionally needs its own `manifest.toml`. Set its
`tags` value in the `[DEFAULT]` section and include it from the suite's
{searchfox}`top-level manifest <toolkit/components/telemetry/tests/marionette/tests/manifest.toml>`.
It also needs an entry in `default_tests` in
{searchfox}`testing/mozharness/scripts/telemetry/telemetry_client.py`, which CI
reads instead of the top-level manifest.

## Running the tests on try

You can run the tests across all platforms on the try server using
[mach](/mach/index.md):

```shell
./mach try fuzzy -q "'telemetry-tests-client"
```

## Disabling an individual failing test

To disable a test only in affected configurations, add a `skip-if` condition
with a bug number to its entry in the
{searchfox}`client test manifest <toolkit/components/telemetry/tests/marionette/tests/client/manifest.toml>`.
See
[manifest conditional expressions](/mozbase/manifestparser.md#manifest-conditional-expressions)
for the syntax.

To skip an individual test method in code, call
[self.skipTest("reason")](https://docs.python.org/3/library/unittest.html#skipping-tests-and-expected-failures).

## Who to contact for help

Ask in the
[#telemetry](https://chat.mozilla.org/#/room/#telemetry:mozilla.org) Matrix
room. See the [Telemetry module](/mots/index.md#telemetry) for the current
owners and peers.

## Bugzilla

Bugs can be filed under the Toolkit product for the Telemetry component.
