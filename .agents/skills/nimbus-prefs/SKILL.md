---
name: nimbus-prefs
description: >
  Use this skill when a Firefox preference has to be remotely controllable: putting a new feature
  behind a pref so it can be experimented on, rolled out gradually, or disabled remotely via
  Nimbus. Covers declaring prefs (StaticPrefList.yaml, firefox.js), adding a feature to
  toolkit/components/nimbus/FeatureManifest.yaml, choosing between `fallbackPref` and `setPref`,
  reading values from JS and C++, recording exposure events, and pairing the pref with Glean
  telemetry. Trigger on "put this behind a pref", "make this Nimbus-controllable", "add a
  feature gate", "run an experiment on this", "setPref vs fallbackPref".
---

For background on Nimbus itself — experiment design, the Experimenter console, analysis — see
[experimenter.info](https://experimenter.info/). This skill covers the in-tree side.

## Goal

New user-facing features should ship **behind a Nimbus feature**, so they can be experimented on,
rolled out gradually, and turned off remotely without a ride-along release.

A Nimbus feature does not require a pref, and the platform team's recommended default is not to add
one. If only your own JS reads the value, read it straight from the Nimbus API and skip the pref
entirely. Add a pref when code you do not control has to read the value, notably C++ and Rust. See
[Pref Experiments](https://experimenter.info/platform-guides/desktop/pref-experiments).

Up to three names are involved, and **the build does not check that they refer to anything**: the
pref name, the Nimbus variable name, and the Glean metric name are independent hand-written strings.
The manifest is checked for internal consistency at build time, but nothing verifies that a pref you
name actually exists. Keeping the three aligned is on you and the reviewer.

## Pick a mechanism

| You want | Use | Does Nimbus write the pref? | What an enrollment changes | Code reads |
|---|---|---|---|---|
| A default that experiments may override | `fallbackPref` | no | the value `getVariable()` returns, in memory only | `NimbusFeatures.<id>.getVariable()` |
| An experiment to change a pref other code already reads (incl. C++ `StaticPrefs`) | `setPref` | yes | the pref itself, restored on unenrollment | `Services.prefs` / `StaticPrefs::` as usual |
| A value with no pref at all | neither | n/a | the value `getVariable()` returns | `getVariable()` + `?? DEFAULT` at every call site |
| A pref Nimbus must never touch | plain pref | no | nothing | `Services.prefs` |

`setPref` and `fallbackPref` are **mutually exclusive on one variable** (enforced by the schema).

Prefer no pref at all for new JS-only feature gates. Use `fallbackPref` when the value also has to be
settable from `about:config`: one declaration, and `onUpdate` fires for both Nimbus changes and pref
changes. Use `setPref` when the value must reach code you don't control — notably anything reading a
`StaticPrefList.yaml` pref from C++ or Rust.

## Step 1 — declare the pref

- **C++ or Rust needs to read it** → `modules/libpref/init/StaticPrefList.yaml`. Requires
  `name`, `type`, `value`, `mirror`; use `mirror: always` if Nimbus is going to change it (see
  the C++ section below). Keep the alphabetical section order.
- **JS/front-end only** → `browser/app/profile/firefox.js` (Firefox-only) or
  `modules/libpref/init/all.js` (all apps). Android-only: `mobile/android/app/geckoview-prefs.js`.

Default the feature **off**.

Do not declare the same pref in both `StaticPrefList.yaml` and a `.js` pref file with the same
value — `./mach lint -l lintpref` rejects that.

**Make sure a `fallbackPref` names a pref that really exists.** Nimbus installs
`defineLazyPreferenceGetter(..., fallbackPref, null, ...)`, so if the pref is not declared anywhere
`getVariable()` returns `null`. A caller writing `?? DEFAULT` still gets its default (`??` catches
`null`), so this is usually not a wrong-value bug — but:

- a typo in the pref name means the override silently never works, and nothing tells you;
- callers that use the value without a nullish guard get `null`, which coerces to `0` in
  arithmetic — an `int` variable silently becomes a zero interval or a zero limit instead of
  failing visibly (`undefined`, and therefore `NaN`, is the *no* `fallbackPref` case);
- the manifest claims a pref supplies the default when it does not, which misleads the next reader
  and hides the knob from `about:config`.

A deliberately undeclared pref is a legitimate pattern when the variable is a pure *override* and
the real default is a JS constant — `aboutwelcome.backdrop` works this way, defaulting via
`featureConfig.backdrop ?? defaults.backdrop` in `AboutWelcomeChild.sys.mjs`. If that is what you
are doing, say so in the variable's description so it does not read as a mistake.

## Step 2 — add the Nimbus feature

Features are **top-level keys** in `toolkit/components/nimbus/FeatureManifest.yaml`. `description`,
`owner`, `hasExposure` and `variables` are required; `exposureDescription` is required when
`hasExposure: true`.

```yaml
contentRelevancy:
  description: >-
    A feature for interest-based content relevance ranking and personalization
    for Firefox.
  owner: disco-team@mozilla.com
  hasExposure: false
  variables:
    enabled:
      description: Enable this feature
      type: boolean
      fallbackPref: toolkit.contentRelevancy.enabled
    timerInterval:
      description: >-
        The interval (in seconds) of the background update timer for the content
        relevancy manager
      type: int
      setPref:
        branch: user
        pref: toolkit.contentRelevancy.timerInterval
```

- `type` is one of `int`, `string`, `boolean`, `json`. It **must match the pref's type**.
  `PrefUtils.setPref` dispatches on the value's JS type, so a boolean value aimed at a pref already
  registered as int calls `setBoolPref` and throws `NS_ERROR_UNEXPECTED` mid-enrollment. Nothing
  catches it, and because `addEnrollment()` runs before the prefs are applied, the enrollment is
  stored while its prefs, its pref observers and its enrollment telemetry are all skipped. It does
  not look wrong in telemetry, it looks absent.
  - A **`json`** variable writes `JSON.stringify(value)`, so its `setPref` target must be a
    **string** pref (and a `json` `fallbackPref` reads a string pref and parses it). `json`
    `setPref` requires Firefox 126+.
  - There is **no `float` type**. libpref stores float prefs as strings, so drive one from a
    `string` variable and parse at the call site. An `int` variable pointed at a float pref is the
    `NS_ERROR_UNEXPECTED` case above.
- `setPref` needs `branch: user` or `branch: default`. Default-branch values are re-applied every
  startup; user-branch values persist to `prefs.js` and show as modified in `about:config`.
- Add `enum:` for string/int variables with a closed set of legal values. Experimenter validates
  recipe feature values against the published manifest, enums included, when a recipe is authored,
  and tests that build enrollments through `NimbusTestUtils` check the same thing locally
  (`validateFeatureValueEnum`). The client re-checks as well: `RemoteSettingsExperimentLoader`
  validates each branch against a schema generated from the manifest and refuses to enroll in an
  invalid recipe, so an out-of-enum value surfaces as a client-side enrollment failure in the logs
  (governed by `nimbus.validation.enabled`, true on all channels; opted out per recipe with
  `featureValidationOptOut`). That generated schema only carries `enum` for `string` variables,
  so int enums are not enforced on the client.
- **Do not use `isEarlyStartup`.** It is deprecated behind a frozen allowlist (bug 1875331); the
  build fails if you add a new one.
- A pref cannot be the `setPref` target of two variables, and a pref used as a `fallbackPref`
  anywhere in the manifest is not supposed to be a `setPref` target anywhere else (documented as
  build-time enforced, though the check in `generate_feature_manifest.py` looks unreachable in
  practice, so do not rely on it catching you). A feature that sets `allowCoenrollment: true` cannot
  use `setPref` at all. Some prefs are permanently off-limits (`DISALLOWED_PREFS` in
  `toolkit/components/nimbus/generate/generate_feature_manifest.py`: disabling telemetry or Nimbus,
  repointing Remote Settings, `nimbus.debug`, and the sandbox and automation prefs).

The manifest is validated at **build time** by `generate_feature_manifest.py`, so a malformed entry
breaks `./mach build`, not a lint.

## Step 3 — read the value

### JS

```js
ChromeUtils.defineESModuleGetters(lazy, {
  NimbusFeatures: "resource://nimbus/ExperimentAPI.sys.mjs",
});

const NIMBUS_VARIABLE_ENABLED = "enabled";

get shouldEnable() {
  return (
    lazy.NimbusFeatures.contentRelevancy.getVariable(
      NIMBUS_VARIABLE_ENABLED
    ) ?? false
  );
}
```

Hoist variable names into constants rather than inlining string literals. Always write
`?? DEFAULT`: `getVariable()` returns `undefined` when there is no enrollment and no `fallbackPref`.

**Wait for the store before the first read.** Until Nimbus has loaded its enrollments,
`getVariable()` silently returns the `fallbackPref` value (or `undefined`) even for a client that is
enrolled. There is no throw and no warning, and the caller cannot tell "not enrolled" from "not
loaded yet".

Where that sits in startup: Nimbus initialises from the `browser-before-ui-startup` category, but it
waits for `sessionstore-windows-restored` before loading enrollments. Anything that runs before the
first window has been restored, which is most component initialisation, sees the unenrolled state.
Only `isEarlyStartup` features are exempt, and that flag is closed to new features.

Either await readiness before reading:

```js
await lazy.NimbusFeatures.contentRelevancy.ready();
const enabled = lazy.NimbusFeatures.contentRelevancy.getVariable("enabled") ?? false;
```

or read eagerly and re-read from `onUpdate`, which fires with reason `"feature-enrollments-loaded"`
once the store is up. Do **not** read once in `init()` and cache the result: that is the most common
way to pin a feature to its unenrolled value for an entire session.

Register and **unregister** listeners symmetrically:

```js
// This will handle both Nimbus updates and pref changes.
lazy.NimbusFeatures.contentRelevancy.onUpdate(this._nimbusUpdateCallback);
// ... and in uninit():
lazy.NimbusFeatures.contentRelevancy.offUpdate(this._nimbusUpdateCallback);
```

A `fallbackPref` change emits an update with reason `"pref-updated"`, so one `onUpdate` listener
covers both sources — you do not need a separate pref observer.

One catch: `onUpdate()` only registers a listener on the experiment store. The pref observer lives
in the `XPCOMUtils.defineLazyPreferenceGetter` that `fallbackPref` installs, and that observer is
only added when the lazy getter is **first read**. If you register `onUpdate` in `init()` and never
touch the variable, an `about:config` flip fires nothing.

Reading once during initialisation is the fix, but read with `getAllVariables()`, not
`getVariable()`. `getVariable()` returns early on an experiment or rollout value and never reaches
the pref getter, so while a client is enrolled it does not install the observer at all.
`getAllVariables()` spreads every `fallbackPref` getter and therefore always does.

### Reacting to change on the `setPref` path

All of the above is for variables you read through the Nimbus API. If your value arrives as a pref
via `setPref`, `onUpdate` is not the mechanism: watch the pref the normal way, with
`Services.prefs.addObserver` or a `mirror: always` static pref that keeps itself current.

You do have to watch it. `setPref` values are applied once Nimbus has started, which is after early
startup, so a feature that reads the pref at init and caches the result is wrong for the whole
session in which the client enrolls, and wrong again in the session where it unenrolls.

The one rule that differs from a normal pref observer: **never write the pref from the handler.**
Any write unenrolls the client.

### C++

`mozilla::NimbusFeatures::GetBool/GetInt` (`toolkit/components/nimbus/lib/NimbusFeatures.h`) take an
explicit default and resolve experiment → rollout → `fallbackPref` → default. **But they only see
values for `isEarlyStartup` features**, and that flag is closed to new features.

So for C++ and Rust: declare the pref in `StaticPrefList.yaml` with `mirror: always`, give the
Nimbus variable a `setPref` pointing at it, and read it normally via `StaticPrefs::`. Nimbus writes
the pref; your code never knows Nimbus exists.

For Rust the pref additionally needs `rust: true` in its `StaticPrefList.yaml` entry before
`static_prefs::pref!("your.pref")` will resolve, and Rust reads the mirror variable directly rather
than through the getter function.

Two constraints come with that, and both fail silently:

- **`mirror: always`.** A `mirror: once` pref is snapshotted into its mirror variable and never
  refreshed, so an enrollment that writes it mid-session has no effect for the rest of the session
  and the feature simply is not remotely controllable. Delaying your own first read does not help:
  every `once` mirror in the process is filled in together, the first time *any* `once` pref's
  getter runs, which some unrelated caller will do early. The tell at a call site is the `_AtStartup`
  suffix libpref adds to a `once` getter.
- **Startup timing.** `setPref` values are applied when Nimbus starts up
  (`ExperimentManager._restoreEnrollmentPrefs`), which is after early startup pref reads. With
  `branch: default` anything reading the pref before that point sees the in-tree default and the
  experiment looks like it did not apply. Use `branch: user` for prefs that may be read early:
  user-branch values are persisted in `prefs.js`, so `_restoreEnrollmentPrefs` can skip them and
  they are already set before early startup reads. Note this only holds from the **second** session
  after enrollment — on the session where the client first enrols, the pref is written mid-session,
  after early reads, whatever the branch. Do not expect a first-session effect. This is what
  `isEarlyStartup` used to paper over.

## Step 4 — record exposure

If the feature branches user-visible behaviour, set `hasExposure: true`, write an
`exposureDescription` saying exactly when exposure fires, and record it **at the point where
behaviour actually diverges** — not at startup:

```js
if (isExternal) {
  lazy.NimbusFeatures.externalLinkHandling.recordExposureEvent({ once: true });
}
const behavior =
  lazy.NimbusFeatures.externalLinkHandling.getVariable("openBehavior");
```

`{ once: true }` de-duplicates per process: the flag lives on the per-process feature object, so an
exposure point that runs in content processes records once per content process.

`hasExposure` is declarative only. Nothing checks it, so `hasExposure: true` with no
`recordExposureEvent()` call records nothing, and a call on a `hasExposure: false` feature still
fires. Keep the two in step by hand.

Without exposure telemetry an experiment is still analysed, on the **enrollment** basis, which is
Jetstream's default. What you lose is the exposure basis: the effect is then measured diluted across
every enrolled client, including those who never encountered the feature, which on a feature only
some enrolled clients reach can shrink a real effect below detectability. See
[Enrollment vs Exposure](https://experimenter.info/data-analysis/jetstream/overview#enrollment-vs-exposure).

If your feature sets `allowCoenrollment: true`, the whole single-enrollment API is unavailable:
`getVariable()`, `getAllVariables()` and `getEnrollmentMetadata()` all throw, you read values through
`getAllEnrollments()`, and `recordExposureEvent()` must be passed the `slug` of the enrollment you
are recording for. A co-enrolling feature also cannot use `setPref` or `isEarlyStartup`.

## Step 5 — pair it with Glean

Add metrics to the component's own `metrics.yaml` (registered in
`toolkit/components/glean/metrics_index.py`). Every metric needs `expires`.

Two rules that save real debugging:

- **Have telemetry read the same variable the code applied**, not the raw pref. Then the reported
  value cannot diverge from the effective one.
- **Use static metric identifiers.** In JS, `Glean.myfeature.sawThing` is a runtime lookup that
  yields `undefined` for a name not in `metrics.yaml`, so both a typo and a computed
  `Glean.myfeature["saw" + suffix]` throw at the `.record()` call. Nothing catches either at build
  time (C++ is different: the generated headers make it a compile error). A static identifier is
  still the right choice because it is greppable and can be checked by eye against `metrics.yaml`,
  which a concatenated one cannot.

Do **not** add prefs to `Glean.preferences.userPrefs`. It is explicitly frozen
(`modules/libpref/metrics.yaml`), and the list it fossilises is `DEFAULT_ENVIRONMENT_PREFS` in
`toolkit/components/telemetry/app/Environment.sys.mjs`. Instrument your pref with its own metric
instead.

## Resolution order and its traps

`getVariable()` resolves: **experiment → rollout → `fallbackPref` → `undefined`**.

- The test is `typeof !== "undefined"`, so an enrollment setting a variable to `null`, `false` or
  `0` **wins over** the pref. That is intended, and it surprises people.
- `getAllVariables({ defaultValues })` spreads
  `{ ...fallbackPrefValues, ...defaultValues, ...experimentValue }` — so your `defaultValues`
  **override** the `fallbackPref` values, the opposite of what "default" suggests. Don't mix
  `defaultValues` with `fallbackPref` on the same feature.
- `getVariable()` never reads a `setPref` **pref**, but the variable itself is still part of the
  enrollment, so while enrolled `getVariable()` does return its value — and returns `undefined`
  once unenrolled, while the pref is restored. Read `setPref` variables through `Services.prefs` /
  `StaticPrefs::`, not `getVariable()`.
- **Renaming or deleting a `setPref` variable unenrolls live clients** (`PREF_VARIABLE_MISSING` /
  `PREF_VARIABLE_NO_LONGER` / `PREF_VARIABLE_CHANGED`), and deleting the feature itself does too
  (`INVALID_FEATURE`). Check Experimenter for live recipes before touching an existing variable.
  Note this only bites enrollments that actually set a pref: a manifest change is harmless to an
  active experiment whose branch sets no pref-setting variable.
- An unknown variable name throws **only** on Nightly and in automation — on Release it silently
  returns `undefined`. Test on Nightly.

## Follow the good examples

- **`fallbackPref` done right** — the `enabled` and `ingestEnabled` variables of
  `contentRelevancy` in the manifest +
  `toolkit/components/contentrelevancy/ContentRelevancyManager.sys.mjs`: named constants,
  `onUpdate`/`offUpdate` symmetry, explicit `?? false`. The `timerInterval` variable in the same file
  is a `setPref` variable read as `getVariable(...) ?? Services.prefs.getIntPref(...)`; the pref
  fallback is load-bearing because `getVariable()` returns `undefined` once the client unenrolls,
  and it is the restored pref that then carries the value. Reading the pref directly is the simpler
  rule for a `setPref` variable, per the resolution-order section below.
- **Exposure done right** — `externalLinkHandling` + `browser/modules/BrowserDOMWindow.sys.mjs`:
  typed `enum`, exposure at the branch point, and `BrowserUsageTelemetry` reading the same variable.
- **Isolation done right** — `ipProtection` + `toolkit/components/ipprotection/IPPNimbusHelper.sys.mjs`:
  a ~56-line helper holding all the Nimbus glue, with control-branch handling. Copy the shape, not
  the manifest entry: the feature is declared `hasExposure: false` while the helper does record
  exposure, which is the mismatch Step 4 warns about.

## Anti-patterns

- Declaring a Nimbus variable, then reading a *different*, hand-rolled pref with a raw string
  literal that is declared in no pref file. The names look related; nothing checks them.
- `hasExposure: false` on a feature that does branch behaviour, which forfeits exposure-basis
  analysis and leaves the effect measured diluted across clients who never saw the feature.
- No `fallbackPref` and no pref, so the default is an object literal duplicated at each call site
  and the copies drift.
- Building Glean metric names by string concatenation.
- `isEarlyStartup` on a variable instead of the feature — the schemas lack
  `additionalProperties: false`, so misplaced keys are **silently ignored**.

## When NOT to add a Nimbus entry

Not every pref should be Nimbus-controllable. Leave these alone:

- **Temporary state** written by the app — `hasSeen*`, `*Dismissed`, `*Completed`, counters,
  timestamps. `modules/libpref/docs/index.md` calls these "application data prefs".
- **User settings** already exposed in `about:preferences`.
- **Debug and logging flags** (`*.loglevel`).
- **Test-only prefs.**
- **Web-exposed API and CSS gates** (`layout.css.*`, `dom.*.enabled` interface flags) — those ship
  by release channel and WPT coverage, not by experiments. This is about exposing new syntax or
  interfaces to content; behaviour changes under a `dom.*` or `network.*` pref are routinely
  rolled out through Nimbus (see `dom.security.https_first`, `network.cookie.CHIPS.enabled`).

## Verify

```bash
./mach lint -l lintpref .                  # no duplicate pref declarations
./mach build toolkit/components/nimbus     # validates FeatureManifest.yaml
./mach test toolkit/components/nimbus/test/unit
./mach test toolkit/components/nimbus/test/browser
./mach test toolkit/components/nimbus/test/python   # the manifest generator's own tests
./mach lint -W .                           # -W is required to see warnings
```

Check the behaviour with a real enrollment rather than by guessing.

The quickest path is [Nimbus Developer
Tools](https://experimenter.info/platform-guides/desktop/enroll-locally), which enrolls from a raw
feature config with no recipe at all. Otherwise set `nimbus.debug` to `true` and open the opt-in URL:

```
about:studies?optin_slug=<slug>&optin_branch=<branch>
```

Append `&optin_collection=nimbus-preview` only for a recipe in Preview. On a live recipe that
argument points the lookup at the wrong collection and the opt-in silently does nothing.

For automated coverage, write two kinds of test, because they fail for different reasons.
`SpecialPowers.pushPrefEnv` proves your code does the right thing when the pref changes, and
exercises none of the Nimbus wiring. One enrollment test built with
`NimbusTestUtils.enrollWithFeatureConfig`
(`toolkit/components/nimbus/test/NimbusTestUtils.sys.mjs`, in an xpcshell or browser test) proves
the wiring: that the manifest variable really maps to the pref you think it does, and that the
cleanup handler puts the pref back on unenrollment. Each is a few lines.

## After it lands

Landing the manifest change is not the last step. Experimenter fetches
`toolkit/components/nimbus/FeatureManifest.yaml` from `mozilla-firefox/firefox` on a bot schedule, as
an unversioned copy plus one per release version, so a new feature does not appear the moment your
patch lands. If it is not in the branches dropdown yet, the fetch has not run.

Two consequences when the experiment owner goes to build the recipe:

- A feature is only selectable once it appears in the **unversioned** manifest. Features seen only in
  a versioned manifest are created disabled.
- Branch feature values are validated against the schemas for the recipe's Firefox version range, so
  a recipe whose minimum version predates the release carrying your variable fails validation. Set
  the experiment's minimum Firefox version to the release your change ships in.
