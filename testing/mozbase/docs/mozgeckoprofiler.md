# {mod}`mozgeckoprofiler` --- Gecko Profiler utilities

This module contains various utilities to work with the Firefox Profiler, Gecko's
built-in performance profiler. Gecko itself records the profiles, and can dump them
out to file once the browser shuts down. This package takes those files, symbolicates
them (turns raw memory addresses into function or symbol names), and provides utilities
like opening up a locally stored profile in the Firefox Profiler interface. This
is done by serving the profiles locally, and opening a custom url in profiler.firefox.com.

Symbolication is performed by loading the profile into a local
[samply](https://github.com/mstange/samply) symbol server and rewriting the profile
with the profiler-edit Node tool, both of which are fetched as toolchain artifacts.
