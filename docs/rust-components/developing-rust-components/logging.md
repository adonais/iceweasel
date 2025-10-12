# Logging

## Rust code

Make sure to use the logging macros from the `tracing_support` crate (`tracing_support::debug!`, `tracing_support::info!`, etc).
`error_support` also contains a copy of the same macros, which can be a more convenient import for components that already depend on `error_support`.

## Forwarding logs to the browser console

Rust logs can be forwarded to the JavaScript browser console using the `toolkit.rust-components.logging.crates` pref.
This pref stores a comma-separated list of items, where each item is a logging target and an optional logging level.

Each item in the comma separated list can be:

* A tracing level (`error`, `warn`, `info`, `debug`, `trace`).
  This will forward all events with that level or greater.
* A target plus tracing level (e.g. `logins:warn`)
  This will forward all events for that target with that level or greater.
  "target" here means crate name unless the crate specifically sets a target, which is rare.
* A bare target (e.g. `logins`).
  This will forward all events for that target that are `debug` or higher.

For example, `logins,autofill:warn,error,suggest` would forward:

- Logins logs at the debug level
- Autofill logs at the warning level
- Suggest logs at the debug level
- All other logs at the error level.

## Error reporting

Errors from the error reporter have level `error` so they will be forwarded to the browser console by default.
Add the `app-services-error-reporter` target to get breadcrumbs forwarded as well.

## setupLoggerForTarget

An alternative logging mechanism is `setupLoggerForTarget`.
This allows you to connect tracing events to the `Log.sys.mjs` logger.
The main reason to do this is to connect to an existing logger like the Sync logger.

```
// At the top of your JS module
ChromeUtils.defineESModuleGetters(lazy, {
  setupLoggerForTarget: "resource://gre/modules/AppServicesTracing.sys.mjs",
});

// In your initialization code
lazy.setupLoggerForTarget("tabs", "Sync.Engine.Tabs");
```
