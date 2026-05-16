# Working with ESR115

Firefox 115 was released in mid-2023 and is going to be supported for some time
for Windows 7 users.

Building it on a modern Linux system (that a lot of Mozilla developer use)
requires working around several toolchain version mismatches. None of the fixes
require patching Firefox source.

Additionally, pushing to try doesn't work out of the box.

This document explains a setup that allows verifying patches locally and pushing
to try, it is Linux only but might work on other OSes.

We'll be working in a separate checkout in this document, since a special
`mozconfig` and `rust-toolchain.toml` files are required.

## Required toolchain versions

| Tool | Required | Reason |
|------|----------|--------|
| Rust | 1.76.0 | Newer versions break bindgen-generated bindings |
| cbindgen | 0.24.3 | 0.29 is too strict: rejects duplicate TOML keys and treats `try` as a reserved keyword |
| libclang | 16 (not 18) | bindgen 0.64 (used by gecko-profiler) generates incomplete bindings with clang 18 |

## Setup

### 1. Pin the Rust toolchain for the tree

Create `rust-toolchain.toml` at the root of the Firefox 115 checkout:

```toml
[toolchain]
channel = "1.76.0"
```

Install the toolchain if not already present needed:

```sh
rustup toolchain install 1.76.0
```

### 2. Install a specific cbindgen

Install `cbindgen` version `0.24.3` in an isolated location so it does not
interfere with other trees that need a newer version:

```sh
cargo install cbindgen --version 0.24.3 --root ~/.local/cbindgen-0.24.3
```

### 3. mozconfig

```
ac_add_options --with-libclang-path=/usr/lib/llvm-16/lib
export CBINDGEN=/home/YOU/.local/cbindgen-0.24.3/bin/cbindgen
```

`--with-libclang-path` tells the build system which `libclang` to hand to
`bindgen`. `CBINDGEN` overrides the `cbindgen` binary for this tree only; the
system-wide `cbindgen` (used by other trees) is left untouched.

`llvm-16` must be installed (`apt install llvm-16 libclang-16-dev` or
equivalent).

## Pushing to try

From a regular checkout (from <https://github.com/mozilla-firefox/firefox>),
`esr115` can be checked out like so:

```
git checkout esr115
```

and will track upstream when pulled.

To push to try, it is required to have `git-cinnabar` in path (that `./mach
vcs-setup` can install), and to run:

```
git -c cinnabar.graft=https://github.com/mozilla-firefox/firefox fetch hg::https://hg.mozilla.org/mozilla-unified
```

`./mach try fuzzy` will then produce some warnings, but work (it is expected
that it takes some time). The push go via SSH, so a level 1 account is
necessary.
