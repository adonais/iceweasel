# SpiderMonkey source checks

This linter runs the three SpiderMonkey consistency checks that used to run as
part of `mach build`. They are whole-tree checks: each one walks the sources
itself rather than looking only at the files you changed.

## spidermonkey-style

Checks that `#include` directives in {searchfox}`js/src <js/src/>` and
{searchfox}`js/public <js/public/>` use the right path and form (`"..."` for
in-tree headers, `<...>` for system headers), are sorted, don't include an
inline header from a vanilla header, and don't form header cycles.

The check compares its whole output against the output expected for the
deliberately broken fixtures in {searchfox}`js/src/tests/style
<js/src/tests/style/>`. If the baseline itself stops matching -- usually because
the fixtures were edited -- the raw diff is reported instead, and
`expected_output` in {searchfox}`tools/lint/spidermonkey/check_spidermonkey_style.py
<tools/lint/spidermonkey/check_spidermonkey_style.py>` needs updating.

## spidermonkey-macroassembler

Checks that every `MacroAssembler` method declared in
{searchfox}`js/src/jit/MacroAssembler.h <js/src/jit/MacroAssembler.h>` with a
`DEFINED_ON(...)` annotation is defined for each architecture it lists, and vice
versa.

## spidermonkey-opcode

Checks that the bytecode documentation comments in
{searchfox}`js/src/vm/Opcodes.h <js/src/vm/Opcodes.h>` can be parsed by
{searchfox}`js/src/vm/jsopcode.py <js/src/vm/jsopcode.py>`, which generates the
bytecode reference documentation.

## Run Locally

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter spidermonkey <file paths>
```

All three checks run together, since selecting a linter selects a configuration
file. They take about a second in total.

## Configuration

This linter is enabled by default, and will run if you make changes to
SpiderMonkey sources.

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/spidermonkey.yml>`
- {searchfox}`Source <tools/lint/spidermonkey/__init__.py>`
