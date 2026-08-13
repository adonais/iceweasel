# RST Linter

[rstcheck] is a popular linter for restructuredtext.

## Run Locally

The mozlint integration of rst linter can be run using mach:

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter rst <file paths>

```

## Configuration

All directories will have rst linter run against them.
If you wish to exclude a subdirectory of an included one, you can add it to the `exclude`
directive.

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/rst.yml>`
- {searchfox}`Source <tools/lint/rst/__init__.py>`

[rstcheck]: https://github.com/myint/rstcheck
