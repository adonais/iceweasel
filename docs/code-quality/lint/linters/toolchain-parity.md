# Toolchain Parity

This linter checks that tasks definitions marked `local-toolchain` (in
`taskcluster/kinds/toolchain`) and `local-fetch` (in `taskcluster/kinds/fetch`)
cover all tier-1 host platforms. These are the tasks that
`mozbuild.bootstrap.bootstrap_toolchain()` uses to fetch a prebuilt binary for
local development (e.g. from `mach lint`, `mach vendor`, etc.).

Known, accepted gaps are listed in
{searchfox}`exclusions.yml <tools/lint/toolchain-parity/exclusions.yml>`. See
that file for the policy on adding new entries -- it isn't meant as a
general-purpose way to silence the linter.

## Run Locally

This mozlint linter can be run using mach:

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter toolchain-parity taskcluster/kinds/toolchain taskcluster/kinds/fetch

```

## Configuration

This linter runs over `taskcluster/kinds/toolchain` and
`taskcluster/kinds/fetch`.

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/toolchain-parity.yml>`
- {searchfox}`Source <tools/lint/toolchain-parity/__init__.py>`
