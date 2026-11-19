# Train-hop langpack smoke test

`browser/components/newtab/test/python/test_trainhop_langpacks.py` guards
against the class of regression fixed in
[bug 2049845](https://bugzilla.mozilla.org/show_bug.cgi?id=2049845): an
`AboutNewTabResourceMapping` observer cascade that explodes memory when a
train-hop newtab XPI is registered while many langpacks are active, as on
MSIX, Snap and Flatpak installs, which bundle a langpack for every shipped
locale.

## Why it reproduces

`registerFluentSources()` registers a shadow Fluent source inside every
active langpack's metasource. Each shadow source only covers the locales in
the XPI's `supported-locales.json` that are also available, and the
`AboutNewTabResourceMapping.observe()` comment describes how those
registrations re-entered the observer without the fix.

So the test needs real locale codes on both sides: the XPI must support them
and langpacks must provide them. With made-up locale codes the shadow sources
are empty and the cascade never starts.

## How it works

The test runs with `./mach python-test --subsuite newtab-trainhop` against a
local build, or `GECKO_BINARY_PATH` in CI. It:

1. Starts Firefox headless under Marionette, with `intl.multilingual.enabled`
   and `intl.locale.requested` set to `en-US`.
2. Generates a minimal langpack for every locale in
   `browser/locales/shipped-locales`, and installs them all as temporary
   add-ons.
3. Builds a minimal train-hop XPI whose `supported-locales.json` lists
   `en-US` plus every shipped locale, which is how
   `browser/extensions/newtab/webext-glue/moz.build` packages a shipped
   train-hop XPI.
4. Calls `AboutNewTabResourceMapping.registerFluentSources()` against that
   XPI from chrome JS while sampling RSS of the Firefox process tree.

The locale list comes from the tree, not from a build's l10n repacks, so the
test reproduces at the same scale on try, autoland and mozilla-central.

## Interpreting pass/fail

The test fails if RSS grows by more than `MAX_GROWTH_MIB` (300) during the
call, in which case it kills Firefox, or if fewer langpacks than expected were
active. Measured locally on macOS:

| | RSS growth | Result |
|---|---|---|
| Fix backed out | > 300 MiB within a few seconds | FAIL |
| Fix applied | 0-12 MiB | PASS |

## Running locally

```shell
./mach python-test --subsuite newtab-trainhop
```

In CI it runs as `source-test-python-newtab-trainhop` (`py3(ntm)`), defined in
`taskcluster/kinds/source-test/python.yml`.
