# NSPR — Netscape Portable Runtime

[![CI](https://github.com/mozilla/nspr/actions/workflows/ci.yml/badge.svg)](https://github.com/mozilla/nspr/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/mozilla/nspr/branch/main/graph/badge.svg)](https://codecov.io/gh/mozilla/nspr)
[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](https://www.mozilla.org/en-US/MPL/2.0/)

> [!WARNING]
> **NSPR is a legacy library (started in 1994!) and should not be used
> for new projects.**
> It predates modern C/C++ standards and the portable threading, I/O,
> time, and networking primitives now available in the standard library
> and the operating system. New code should rely on those instead
> (e.g. `<threads.h>` / `std::thread`, `<chrono>`, POSIX/Winsock APIs).
> NSPR is maintained primarily for the benefit of existing consumers
> such as [NSS](https://github.com/nss-dev/nss) and Firefox.

NSPR (Netscape Portable Runtime) is a platform-neutral API that provides
system-level and libc-like functions. It gives applications a uniform
interface to non-GUI operating system facilities and is used by Mozilla
clients, Red Hat and Oracle server applications, and other software.

NSPR is **functionally complete** and is in maintenance mode: updates
track changes in supported operating systems rather than adding new
features.

## Features

- **Threads** — a unified threading API across platforms ranging from
  those without native threads to those with sophisticated implementations.
- **Thread synchronization** — monitor-style mutual exclusion and
  condition variables, with Java-compatible reentrancy.
- **I/O** — an enhanced BSD-sockets model supporting layered, synchronous
  I/O with optional non-blocking behavior.
- **Network addresses** — manipulation of network addresses with a
  migration path between IPv4 and IPv6.
- **Time** — interval timers for timeouts and scheduling, plus calendar
  functions covering roughly year −30000 to year 30000.
- **Memory management** — `malloc`, `calloc`, `realloc`, `free`.
- **Shared library linking** — load and unload dynamic libraries.

## Getting NSPR

- **Windows** — build from source.
- **macOS** — install via [MacPorts](https://www.macports.org/) or
  [Homebrew](https://brew.sh/).
- **Debian / Ubuntu** — `sudo apt-get install libnspr4-dev`
- **openSUSE** — install `mozilla-nspr` (and `mozilla-nspr-devel` for
  headers) via `zypper` or YaST.

## Building from source

```sh
mkdir target && cd target
../configure
make
```

## Running the test suite

```sh
make -C target/pr/tests
cd target/pr/tests && ./runtests.sh
```

## Related projects

- [NSS](https://github.com/nss-dev/nss) — Network Security Services,
  built on top of NSPR.

## License

NSPR is licensed under the
[Mozilla Public License, version 2.0](https://www.mozilla.org/en-US/MPL/2.0/).
See [LICENSE](LICENSE) for details.
