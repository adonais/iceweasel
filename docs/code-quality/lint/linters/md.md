# md

The `md` linter checks the Markdown files in the tree. It is powered by
[rumdl](https://github.com/rvben/rumdl), a fast Markdown linter and formatter
written in Rust. It is a drop-in replacement for markdownlint and ships with
71 rules covering Markdown style and consistency.

## Run Locally

The mozlint integration can be run using [`mach`](https://firefox-source-docs.mozilla.org/mach/):

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter md <file paths>
```

## Configuration

Rules are configured in {searchfox}`tools/lint/rumdl.toml <tools/lint/rumdl.toml>`.
To enable the linter on a new directory, add the path to the `include` section in
{searchfox}`md.yml <tools/lint/md.yml>`.

## Autofix

rumdl supports automatic fixing via the upstream `--fix` flag. Pass `--fix`
to `mach lint` to apply fixes:

```
$ mach lint --linter md --fix <file paths>
```

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/md.yml>`
- {searchfox}`Source <tools/lint/python/rumdl.py>`
