# pnpm-audit

[pnpm audit](https://pnpm.io/cli/audit) checks the vendored node packages in
`third_party/node` against the npm advisory database.

The linter reads `third_party/node/pnpm-lock.yaml` and does not need
`third_party/node/node_modules` to be present. Advisories rated critical or high
are reported as errors, everything else as a warning.

## Run Locally

This mozlint linter can be run using mach:

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter pnpm-audit
```

Pass `-v` to include every dependency path an advisory reaches, rather than the
first three.

## Raised Advisories

An advisory means a package in the vendored set has a published vulnerability.
For a direct dependency, bump the pin in
{searchfox}`third_party/node/package.json <third_party/node/package.json>` and
in the consumer manifest that has to agree with it, then run `mach vendor node`
to regenerate the lock file and the tree. For a transitive dependency, run
`mach vendor node --force`, which discards the lock file so a patched version
can be resolved.

{searchfox}`pnpm-workspace.yaml <third_party/node/pnpm-workspace.yaml>` sets a
`minimumReleaseAge`, so a patched version published inside that window is
rejected with `ERR_PNPM_NO_MATURE_MATCHING_VERSION`. To take a security fix
before it ages out, add the package to `minimumReleaseAgeExclude`:

```yaml
minimumReleaseAgeExclude:
  - fast-uri@3.1.5
```

Name the exact version. A bare package name exempts every future release of it
as well. Treat the entry as temporary and remove it once the version is old
enough.

If an advisory does not apply, for example because it covers a code path the
build never reaches, add the text it is reported under to the `exclude-error`
list in {searchfox}`pnpm-audit.yml <tools/lint/pnpm-audit.yml>` along with a bug
number. Matching is on a substring, so prefer the GHSA identifier over the
package summary line, since a package name would also suppress unrelated
advisories filed against that package later.

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/pnpm-audit.yml>`
- {searchfox}`Source <tools/lint/pnpm-audit/__init__.py>`
