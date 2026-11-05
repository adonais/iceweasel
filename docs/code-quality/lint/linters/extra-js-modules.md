# EXTRA_JS_MODULES

Firefox is migrating towards using the `moz-src://` protocol to address
files within the codebase, these uris are more easily understood by
tooling and editors.

This linter prevents new files from being added to `EXTRA_JS_MODULES` in
`moz.build` files. New modules should be added to `MOZ_SRC_FILES` instead and
loaded with a `moz-src:///` URI. `EXTRA_PP_JS_MODULES` and
`FINAL_TARGET_FILES.modules` / `FINAL_TARGET_PP_FILES.modules`, which install
files to the same place, are checked in the same way.

Files that are already installed this way are listed in
{searchfox}`the allowlist <tools/lint/extra-js-modules/allowlist.txt>`. Any
entry that is not in the allowlist is reported as an error.

When a file is moved out of these variables, its allowlist entry must be
removed. The linter reports stale entries and can remove them with `--fix`.

## Run Locally

This mozlint linter can be run using mach:

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter extra-js-modules <file paths>
```

## Configuration

This linter is enabled by default, and will run if you make changes to
`moz.build` files.

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/extra-js-modules.yml>`
- {searchfox}`Source <tools/lint/extra-js-modules/__init__.py>`
- {searchfox}`Allowlist <tools/lint/extra-js-modules/allowlist.txt>`
