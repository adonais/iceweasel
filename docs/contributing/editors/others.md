# Other Editors

## Eclipse

You can generate an Eclipse project by running:

```
./mach ide eclipse
```

See also the [Eclipse CDT](https://developer.mozilla.org/en-US/docs/Mozilla/Developer_guide/Eclipse/Eclipse_CDT) docs on MDN.

## Visual Studio

You can run a Visual Studio project by running:

```
./mach ide visualstudio
```

## Zed

You can generate a Zed configuration by running:

```
./mach ide zed
```

This will generate a `.zed/settings.json` file in the Firefox project root and won't change global Zed settings.

(compiledb-back-end-compileflags)=

## CompileDB back-end / compileflags

You can generate a {code}`compile_commands.json` in your object directory by
running:

```
./mach build-backend --backend=CompileDB
```

This file, the compilation database, is understood by a variety of C++ editors / IDEs
to provide auto-completion capabilities. You can also get an individual compile command by
running:

```
./mach compileflags path/to/file
```

This is how the [Vim / Neovim](vim.md) integration works, for example.
