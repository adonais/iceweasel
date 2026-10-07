# ffvpx symbols

`FFmpegLibWrapper` resolves every libavcodec/libavutil entry point by name at
runtime, and the `AV_FUNC_OPTION` / `AV_FUNC_OPTION_SILENT` variants leave the
function pointer null when the lookup fails. The bundled copy of FFmpeg
(ffvpx) only exports the names listed in its `.symbols` files, so an entry
naming a symbol ffvpx does not export is silently dead whenever ffvpx is the
backing library. There is no link failure and no warning: the breakage shows up
far from the wrapper, as a codec behaving as though a feature were unavailable.

Bumping ffvpx's major version is the usual way to introduce one, because it
activates version masks that were never exercised against ffvpx before.

This linter reads `LIBAVCODEC_VERSION_MAJOR` from
`media/ffvpx/libavcodec/version_major.h` and, for every `AV_FUNC*` entry whose
mask is active at that version, checks that the symbol appears in the matching
`.symbols` file. It reports two problems:

- the symbol is in neither `.symbols` file, so the pointer will be null on
  ffvpx,
- the symbol is exported by the other library, meaning the mask uses the wrong
  `AV_FUNC_*` family and the wrapper searches the wrong `dlopen` handle. On ELF
  this happens to work, because `dlsym` also searches the object's dependency
  tree, but `GetProcAddress` does not, so the entry is null on Windows only.

Preprocessor guards in the `.symbols` files are ignored: a name exported in
only some build configurations still counts as exported.

## Run Locally

This mozlint linter can be run using mach:

```{eval-rst}
.. parsed-literal::

    $ mach lint --linter ffvpx-symbols

```

## Configuration

This linter is enabled on `FFmpegLibWrapper.cpp` and on ffvpx's `.symbols`
files.

## Sources

- {searchfox}`Configuration (YAML) <tools/lint/ffvpx-symbols.yml>`
- {searchfox}`Source <tools/lint/ffvpx-symbols/__init__.py>`
