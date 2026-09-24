# Startup & Shutdown

FOG has some specific behaviours in startup and shutdown.
It uses Firefox Desktop startup and shutdown machinery to decide when and how to instruct the Glean SDK to startup and shutdown.

## Startup

FOG's startup comes in two main phases.

### Component initialization

FOG has a singleton [XPCOM Component](/build/buildsystem/defining-xpcom-components.md)
implementing {searchfox}`toolkit/components/glean/xpcom/nsIFOG.idl`.
It is constructed via `FOG::GetSingleton` during the component initialization phase,
very early in Firefox Desktop's startup.

At this point we register lifecycle listeners for [built-in ping scheduling](builtin_pings.md),
but we do not yet initialize the Glean SDK.
Instead, we register a backstop so that if Firefox Desktop gets all the way to `ShutdownPhase::XPCOMShutdown`,
we can initialize the Glean SDK during shutdown.

This is important because the Glean SDK cannot persist any recorded data unless it is initialized.

### FOG initialization

This is when the Glean SDK is [initialized](https://mozilla.github.io/glean/book/reference/general/initializing.html).

We don't want to do this heavy initialization as early as the component initialization phase,
so {searchfox}`browser/components/StartupTelemetry.sys.mjs` picks an opportune time to call
`nsIFOG::InitiliazeFOG`. This can be some time after startup, but not too late,
as all metric and ping operations before the Glean SDK is initialized are kept in the pre-init queue.
This queue has a limit of one million tasks, which, if exceeded, could lead to data loss.

## Shutdown

In the event of a disorderly shutdown (a crash), FOG and Glean will be in whatever state happened just before the crash.
The Glean SDK tries to configure its storage to be interruptable in this way with minimal data loss.

FOG initializes the Glean SDK with `delay_ping_lifetime_io: true`.
FOG instructs the Glean SDK to only persist data for metrics with `lifetime: ping`
on user idle (and during an orderly shutdown).

### Orderly shutdown phase `AppShutdownConfirmed`

We flush content child processes' pending data over FOG's IPC.
Data recorded after this phase might not make it in time.

### Orderly shutdown phase `AppShutdownNetTeardown`

FOG configures the Glean SDK to use Firefox Desktop's networking stack.
After this shutdown phase, it will no longer be able to upload pings.
FOG declines to attempt upload of pings in and beyond this shutdown phase.

### Orderly shutdown phase `AppShutdownTelemetry` and `XPCOMWillShutdown`

Historically this was the final phase in which Legacy Telemetry would be able to record data.

To support this, [the Glean Interface For Firefox Telemetry](../user/gifft.md)
waits until the very next phase (`XPCOMWillShutdown`) to cease mirroring data to Legacy Telemetry probes.

### Orderly shutdown phase `XPCOMShutdown`

This is the end of operation for FOG. Data recorded after this time has no guarantee of being persisted.
The Glean SDK is shut down in this phase, ensuring operations up to this point have a chance to complete.

#### Init-during-shutdown

In the event that FOG initialization hasn't happened by `XPCOMShutdown`,
we will attempt to initialize the Glean SDK during shutdown in that phase.
This is to attempt to process the pre-init queue and persist the resulting data.

This should only happen in very short application sessions.

```{admonition} Terms of Use, Terms of Service, Data Choices
During the first run of Firefox Desktop,
the init-during-shutdown mechanism is suppressed until the Terms of Use have been accepted.
This ensures we don't erroneously either
a) start with data upload disabled, wiping out the pre-init queue; or
b) start with data upload enabled before the user has had a chance to decide that for themselves.
```

## Non-Firefox-Desktop applications that use FOG

There are non-Firefox-Desktop applications that use FOG, like Thunderbird and
[the Firefox Desktop Background Task Runtime](../../backgroundtasks/index.md).
They all use XPCOM so everything except the precise timing of FOG initialization ought to apply.
