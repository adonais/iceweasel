# Source Headers

This linter checks for consistency between `SOURCE_HEADERS` in `moz.build` and
header files in the associated directory.

## Principle

If a header file (`.h`, `.hh` or `.hpp` extension) lives in a directory but is
not referenced as an `EXPORT` or `SOURCE_HEADERS` in the associated `moz.build`,
this is considered an error.

Those entries are used as input for the static analyzer to make sure they match
our coding standard.

## Run Locally

The mozlint integration of this linter can be run using `mach`:

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter source-headers <file paths>

```

## Autofix

The `source-headers` linter does *not* provide a `--fix` option.

## Builders

[Serge Guelton (sergesanspaille)](https://people.mozilla.org/p/sergesanspaille) owns
the builders. Questions can also be asked on #static-analysis:mozilla.org on Matrix.

### misc(mozbuild)

This is a tier-1 task. For test failures the patch causing the
issue should be backed out or the issue fixed.

The fix generally consists in adding or removing the blamed header from `SOURCE_HEADERS`.

For test harness issues, file bugs in Developer Infrastructure :: Lint and Formatting.

## Sources

- {searchfox}`Linter Configuration (YAML) <tools/lint/source-headers.yml>`
- {searchfox}`Source <tools/lint/source_headers/__init__.py>`
