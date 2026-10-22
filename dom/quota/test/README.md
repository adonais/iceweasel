# How to run storage tests

This document shows how to run tests for DOM Workers & Storage components.
You can run tests on your machine or on the try server.

## Try presets

Use `./mach try --preset <name>` to push tests to the try server.

| Preset | What it tests |
|---|---|
| `dom-workers-storage` | All storage and worker components |
| `dom-storage` | All storage components, but not workers |
| `quota-manager` | Quota Manager |
| `indexedDB` | IndexedDB |
| `cache-api` | Cache API |
| `web-storage` | localStorage and sessionStorage |
| `bucket-file-system` | Origin Private File System |

Use a narrow preset to save CI time during development.
Use `dom-workers-storage` for the final test before you ask for review.

### Examples

Push only IndexedDB tests to try:

    ./mach try --preset indexedDB

Limit to one platform:

    ./mach try --preset dom-storage -xq 'linux64'

Skip software rendering, standalone (one test per run) and 32-bit Windows:

    ./mach try --preset dom-storage -xq '!standalone !swr !-32'

See which tasks a preset selects, but do not push:

    ./mach try --preset dom-storage --no-push
