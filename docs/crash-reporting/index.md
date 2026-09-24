# Firefox Crash Reporting

Firefox ships with an open-source crash reporting system. This system is
combination of projects:

- [Google
  Breakpad](https://chromium.googlesource.com/breakpad/breakpad)
  client and server libraries
- Mozilla-specific crash reporting user interface and bootstrap code
- [Socorro](https://github.com/mozilla-services/socorro) Collection
  and reporting server

## Where did my crash get submitted?

Crash data submitted using the Mozilla Crash Reporter is located on
[crash-stats](https://crash-stats.mozilla.org/). If you want to find
a specific crash that you submitted, you first need to find the Crash ID
that the server has assigned your crash. Type `about:crashes` into
your location bar to get a page listing both submitted and unsubmitted
crash reports. For more information, see [How to get a stacktrace for a bug report](/contributing/debugging/stacktrace_report.md).

## Reports and queries

crash-stats has built-in reports of "topcrashes" for each release
grouped by signature. There is also a [custom query tool](https://crash-stats.mozilla.org/search/)
which allows users to limit searches on more precise information.

Finally, a set of Mozilla employees have access to directly query the
underlying data in either SQL summary or using mapreduce on the storage
cluster. If you are interested in obtaining this advanced access, read
[Crash Stats Documentation: Protected Data Access](https://crash-stats.mozilla.org/documentation/protected_data_access/)

## See also

- [Understanding Crash Reports](/contributing/debugging/understanding_crash_reports.md)
- [A guide to searching crash reports](searching_crash_reports.md)
- [crash-stats](https://crash-stats.mozilla.org/)
- [Crash pings (Telemetry) and crash reports (Socorro/Crash
  Stats)](https://bluesock.org/~willkg/blog/mozilla/crash_pings_crash_reports.html)
- [Building with Debug Symbols](/setup/building_with_debug_symbols.md)
- {ref}`Environment variables affecting crash reporting <environment-variables-affecting-crash-reporting>`
- [Uploading symbols to Mozilla's symbol server](uploading_symbol.md)
- [Crash Reporter](/toolkit/crashreporter/crashreporter/index.md)
- [Crash Manager](/toolkit/components/crashes/crash-manager/index.md)
- [Crash Ping Lifecycle](/toolkit/components/crashes/crash-manager/crash-ping-lifecycle.md)

```{toctree}
:hidden:
:maxdepth: 1

searching_crash_reports
uploading_symbol
```
