# Extensions

The WebDriver BiDi specification provides a flexible framework that allows browser vendors to define custom modules and arguments. This document outlines the Firefox-specific extensions implemented in WebDriver BiDi, including any custom functionality beyond the core specification.

## Debugging module

The `moz:debugging` module provides a JavaScript debugger for browsing
contexts, allowing callers to set breakpoints, pause execution and step
through code.
See the `remote/webdriver-bidi/cddl/Debugging.cddl` file for the full type definitions.

### moz:debugging.setDebuggerEnabled

Enables or disables the debugger for the given browsing contexts, user
contexts, or globally. While enabled, execution pauses on `debugger;`
statements and on breakpoints set via `moz:debugging.setBreakpoint`.
Disabling the debugger resumes any paused execution and clears the live
breakpoints.

* `contexts`: Optional list of top-level browsing context IDs to enable or
  disable the debugger for.

* `enabled`: `true` to enable the debugger, or `null` to disable it.

* `userContexts`: Optional list of user context IDs to enable or disable
  the debugger for.

### moz:debugging.setBreakpoint

Sets a breakpoint at the provided location. Breakpoints are matched against
every script loaded in a context where the debugger is enabled, including
scripts loaded after the breakpoint was set.

* `location`: The requested breakpoint location, made of a `url`, a `line`
  and an optional `column`.

The result contains a `breakpoint` property holding the unique ID of the
newly created breakpoint.

### moz:debugging.removeBreakpoint

Removes a previously set breakpoint.

* `breakpoint`: The ID of the breakpoint to remove, as returned by
  `moz:debugging.setBreakpoint`.

An `InvalidArgumentError` is thrown if no breakpoint with the given ID
exists.

### moz:debugging.getScriptSource

Retrieves the source text of a script known by the debugger for a specific
browsing context. Only scripts currently loaded for the context's global
can be retrieved; this does not fetch the source from `scriptUrl` directly.

* `context`: The ID of the browsing context that the script should be
  retrieved from.

* `scriptUrl`: The URL of the script for which the source should be
  retrieved.

The result contains a `source` property holding the source text.

An `UnsupportedOperationError` is thrown if the debugger is not enabled for
the context. An `InvalidArgumentError` is thrown if no script matches
`scriptUrl`.

### moz:debugging.listScripts

Retrieves the list of script URLs currently known by the debugger for a
specific browsing context. Scripts that have been garbage collected are not
included.

* `context`: The ID of the browsing context that the scripts should be
  retrieved from.

The result contains a `scripts` property holding the array of known script
URLs.

An `UnsupportedOperationError` is thrown if the debugger is not enabled for
the context.

### moz:debugging.resume

Resumes execution of a context currently paused on a breakpoint or
`debugger;` statement.

* `context`: The ID of the browsing context where execution is paused.

### moz:debugging.stepOver

In a paused context, steps over the current statement without entering
into called functions.

* `context`: The ID of the browsing context where execution is paused.

### moz:debugging.stepInto

In a paused context, steps into the next function call.

* `context`: The ID of the browsing context where execution is paused.

### moz:debugging.stepOut

In a paused context, steps out of the current frame and pauses again once
the calling frame regains control.

* `context`: The ID of the browsing context where execution is paused.

### moz:debugging.paused

This event is emitted when the debugger pauses execution in a context, whether at a
breakpoint, a `debugger;` statement, or as a result of a stepping command.

* `context`: The ID of the browsing context where execution paused.

* `url`, `line`, `column`: The location where execution paused.

* `callFrames`: The call stack at the pause location, starting with the
  innermost frame. Each frame has a `callFrameId`, `functionName`, its
  `location`, and a `scopeChain` describing the variables visible in each
  enclosing scope.

### moz:debugging.resumed

This event is emitted when a previously paused context resumes execution.

* `context`: The ID of the browsing context that resumed execution.

## Profiler module

The `moz:profiler` module allows starting and stopping the built-in Firefox Profiler.
See the `remote/webdriver-bidi/cddl/Profiler.cddl` file for the full type definitions.

### moz:profiler.isActive

Returns whether the profiler is currently running.

* `active`: `true` if the profiler is currently recording, `false`
  otherwise.

### moz:profiler.start

Starts the profiler. Callers must provide either a `preset` name or the
full set of explicit recording options (`entries`, `interval`, `features`,
`threads`), but not both.

* `preset`: Name of a profiler preset to use (e.g. `web-developer`,
  `firefox-platform`). Cannot be combined with the explicit recording
  options below.

* `entries`: Entry count to keep in the buffer. Required when no preset is
  given.

* `interval`: Interval in milliseconds between samples. Required when no
  preset is given.

* `features`: Profiler features to enable. Required when no preset is
  given.

* `threads`: Threads to profile. Required when no preset is given.

* `activeContext`: ID of the top-level browsing context to mark as the
  active tab for the profile, used by the profiler to associate samples
  with a tab. This does not restrict profiling to the given tab; the
  profiler always samples globally.

An `InvalidArgumentError` is thrown if `preset` is combined with any of the
explicit recording options, or if an unknown preset name is given. An
`UnsupportedOperationError` is thrown if the profiler is already running.

### moz:profiler.stop

Stops the profiler. Unless discarded, the recorded profile is saved to a
uniquely named file in the preferred downloads directory.

* `discard`: If `true`, stop the profiler and discard the recording instead
  of saving it to disk. Defaults to `false`.

The result contains a `path` property holding the path to the saved
profile, or `null` when nothing was saved, i.e. when `discard` was `true`
or the profiler was not running.

## Commands

Firefox provides additional commands for certain modules, as detailed in the list below.
See the `remote/webdriver-bidi/cddl/Commands.cddl` file for the full type definitions.

### webExtension.moz:listExtensions

Returns an array of WebExtension information objects. Hidden extensions are
excluded. Non-hidden extensions are included even when disabled.

`policy` and `sourceURL` are only returned when `RemoteAgent.allowSystemAccess`
is `true`. Otherwise, both fields are omitted.

Description:

* `manifestVersion`: The manifest version used by the WebExtension. It stays
  available even when the WebExtension has no active `WebExtensionPolicy`.

* `hidden`: True if the WebExtension should not be shown to the user, for
  instance because it is provided by the application.

* `temporarilyInstalled`: True if the WebExtension is installed temporarily,
  ie. it will be uninstalled when the browser shuts down.

* `sourceURL`: The URL of the source the WebExtension was installed from,
  or `null` if unknown.

* `policy`: Details derived from the WebExtensionPolicy. It is `null` if the
  WebExtension has no active `WebExtensionPolicy`, for instance when the
  extension is disabled. `isActive` reflects the enabled state of the
  WebExtension.

Inside `policy`:

* `uuid`: The uuid used for the WebExtension's `moz-extension:` URLs.

* `baseURL`: The `file:` or `jar:` URL used as the base of the WebExtension's
  `moz-extension:` URL root.

* `extensionURL`: The root URL of the WebExtension's `moz-extension:`
  namespace, ie. `moz-extension://<uuid>/`.

* `backgroundScripts`: The paths of the WebExtension's background scripts,
  or an empty array if it has none.

## Fields

Firefox provides additional fields for certain types, defined in the `remote/webdriver-bidi/cddl/Fields.cddl` file.
Each extension group in this file has a name `<SomeType>Extension` and provides additional fields for the corresponding `<SomeType>` type in the CDDL file for the BiDi spec, as if `<SomeType>Extension` had been included in that type.
The individual fields are described below.

### browsingContext.GetTreeParametersExtension

* `moz:scope`: The scope from which browsing contexts are retrieved. This parameter cannot be used when a root browsing context is specified.

### browsingContext.InfoExtension

* `moz:name`: The name of the browsing context.

* `moz:scope`: The scope of the browsing context.

### session.CapabilityRequestExtension

* `moz:firefoxOptions`: see https://developer.mozilla.org/en-US/docs/Web/WebDriver/Reference/Capabilities/firefoxOptions

### webExtension.InstallParametersExtension

* `moz:allowPrivateBrowsing`: When set to `true`, the web extension will be allowed in private browsing mode.

* `moz:permanent`: When set to `true`, the web extension will be installed permanently. This requires the extension to be signed. Unsigned extensions can only be installed temporarily, which is the default behavior.
