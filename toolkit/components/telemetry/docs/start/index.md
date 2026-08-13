# Getting started

If you are interested in extending data collection by adding new probes have a look at

```{toctree}
:glob: true
:maxdepth: 2
:titlesonly: true

adding-a-new-probe
remove-telemetry
report-gecko-telemetry-in-glean
```

If you want to work with the telemetry code itself, for example to fix a bug, it is often helpful to start with these steps:

1. Have a look at <about:telemetry> to see which data is being collected and sent.
2. Increase the log level in <about:config> by setting toolkit.telemetry.log.level to Debug or Trace. This will show telemetry information in the browser console. To enable the browser console follow [these instructions](../../../../devtools-user/browser_console/index.html).
3. Run a local telemetry receiver, e.g. [this one](https://github.com/mozilla/gzipServer) and set `toolkit.telemetry.server` to “localhost” (Like the next preference this needs a restart.)
4. Set `toolkit.telemetry.send.overrideOfficialCheck = true`, otherwise local debug builds will not send telemetry data. (Requires restart.)

More information about the internals can be found [here](../internals/index.html).

## Further Reading

- [Telemetry Portal](https://telemetry.mozilla.org/) - Discover all important resources for working with data
- [Telemetry Data Documentation](https://docs.telemetry.mozilla.org/) - Find what data is available & how to use it
