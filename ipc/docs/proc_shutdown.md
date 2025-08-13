# Shutdown handling of processes

Shutting down a multi-process, multi-threaded application is not an easy task. We want to achieve different, partly conflicting goals:

* Be fast and non-disturbing for the user
* Ensure that important things have been accomplished (like sending telemetry, closing files in a non-corrupting way, ...)
* Free all resources in a predictable way (at least in leak-checking builds)

So we cannot just `_exit(0)` at any point in time, regardless the inner status we have.

> **Note:** However we must always be aware that processes can be killed anytime for reasons that are out of our control and thus we should minimize the risk to break anything if we were not able to do an orderly shutdown. This is particularly true on Android where it is very likely to be just killed randomly by the system to reduce resource usage.

## Shutdown flavors

### Main process Shutdown

If the browser is asked to close by the user or by other external events, the main process needs to orchestrate the shutdown of all child processes and itself. This shutdown is organized in phases to allow us to manage dependencies, to some extent.

> **Note:** As many things in Gecko, shutdown is managed via notification observers. But in order to have a stricter model of subsequent shutdown phases that **must** happen in a certain order after passing the point of no return, `AppShutdown` and `ShutdownPhase` provide a stricter wrapper around the pre-existing notification topics. Only topics that have a corresponding `ShutdownPhase` are considered to be relevant and only those phases can be used with shutdown related functions as `Clear/RunOnShutdown` or `AsyncShutdown`.

| ShutdownPhase               | Notification Topic                  | Notes   |
| --------------------------- | ----------------------------------- | ------- |
| n/a                         | `"quit-application-granted"`        | We passed the point of no return. Observers of this notification should be aware, that we are sure to shutdown, but did not yet initialize the shutdown supporting infrastructure to detect hangs (that is: `nsTerminator`, see below). |
| n/a                         | `"quit-application-forced"`         | We passed the point of no return. This is currently only used by `nsAppStartup` itself and can and should be normally ignored. |
| `AppShutdownConfirmed`      | `"quit-application"`                | We initialized our hang monitoring. Breaks existing `spinEventLoopUntilOrQuit` loops (and also remaining modal dialogs). Some chrome code shutdown blockers react on this. Interrupts content processes' content JS execution.  |
| `AppShutdownNetTeardown`    | `"profile-change-net-teardown"`     | The network is going away. |
| `AppShutdownTeardown`       | `"profile-change-teardown"`         | Shut down some components like preallocated processes manager, GMP, places, … |
| `AppShutdown`               | `"profile-before-change"`           | All content processes are shut down. A lot of remaining application services and components shut down. |
| `AppShutdownQM`             | `"profile-before-change-qm"`        | Shutdown the quota manager and its clients. Can be IO heavy and is thus hang prone. |
| `AppShutdownTelemetry`      | `"profile-before-change-telemetry"` | Send last telemetry and shut down the service. |
| `XPCOMWillShutdown`         | `"xpcom-will-shutdown"`             | Only a few listeners. From this point we are inside `ShutdownXPCOM`. |
| `XPCOMShutdown`             | `"xpcom-shutdown"`                  | The last phase in which we can do things in a sane XPCOM environment. Quite a few components register a shutdown blocker here. |
| `XPCOMShutdownThreads`      | `"xpcom-shutdown-threads"`          | Shutdown and join all `nsThread` based threads (and pools) except the main thread, as well as the timer thread and servo thread pools. Once we get here we are already in a partly dysfunctional state, things that shutdown here should not depend on many other things working for them to shutdown cleanly. Ideally the threads are idling already when we get here. |
| `XPCOMShutdownFinal`        | n/a                                 | Main thread shutdown, last round of main thread events execution. The observer service is already dead at this stage. |
| `CCPostLastCycleCollection` | n/a                                 | We destroy the main thread's JS Context and unload static XPCOM components. |

> **Note:** There is a dance of other notifications and checks before we really enter shutdown in order to determine, if we can actually shutdown, in particular to manage `beforeunload` event handlers in content processes. This is out of scope here.

#### Fast Shutdown

In opt builds, the shutdown sequence can finish earlier depending on the `toolkit.shutdown.fastShutdownStage` preference.

| Stage | Bail out before Phase       |
| ----- | --------------------------- |
| 0     | none, normal shutdown       |
| 1     | `CCPostLastCycleCollection` |
| 2     | `XPCOMShutdownThreads`      |
| 3     | `XPCOMShutdown`             |

The basic idea is that in the late shutdown phases in theory nothing important happens other than freeing process resources that will be freed easier and faster by the OS on `_exit(0)`. As of July 2025, this is `1` in release builds, and there is no active effort to shift shutdown earlier.

### ProcessChild Shutdown

Single child processes are created and closed during a normal browsing session frequently. This is particularly true for content processes. Shutting down a single child process should not block the user while interacting with the application.

In order to make the child process aware as early as possibly that it is meant to go away, IPC allows to send the `IMPENDING_SHUTDOWN_MESSAGE_TYPE` via `MessageChannel::NotifyImpendingShutdown()` which is elaborated directly on the `IPC I/O child` thread without passing through the main thread. It basically sets a global, atomic flag that can be checked via `AppShutdown::IsShutdownImpending()`.

As of July 2025, this is used for `ContentChild` derived processes to signal them to interrupt content JS processing to ensure they can timely process the shutdown events on the main thread and for some other child-only shutdown checks.

> **Note:** Calling `AppShutdown::IsShutdownImpending()` in other process types than content is basically equivalent with checking `AppShutdown::IsInOrBeyond(ShutdownPhase::AppShutdownConfirmed)` (though it is actually flipped **before** `"quit-application-granted"` is notified in the parent). It can always be used as the earliest sure indicator of shutdown in any process type.

Of the above shutdown phases, child processes are only aware of:

| ShutdownPhase               | Notification Topic              | Notes          |
| --------------------------- | ------------------------------- | -------------- |
| `AppShutdownConfirmed`      | `"content-child-will-shutdown"` | Only in content processes, see the notification topic. We passed the point of no return. Will break existing `spinEventLoopUntilOrQuit` loops. |
| `XPCOMWillShutdown`         | `"xpcom-will-shutdown"`         | Same as parent. Note that in non-leak-checking builds, content processes exit before entering XPCOM shutdown at all! |
| `XPCOMShutdown`             | `"xpcom-shutdown"`              | Same as parent. |
| `XPCOMShutdownThreads`      | `"xpcom-shutdown-threads"`      | Same as parent. |
| `XPCOMShutdownFinal`        | n/a                             | Same as parent. |
| `CCPostLastCycleCollection` | n/a                             | Same as parent. |

## Make your Code Shutdown aware

As of July 2025, we do not have a standardized way to manage dependencies of lazily constructed components that we could leverage on shutdown. Instead components must be shut down in the correct phase.

> **Note:** For the ease of discussion we use the term "component" in a very broad way here. It may be any of component, singleton, service like in "something that wants to do something at shutdown". Often this is something with explicit initialization via a lazy getter or similar.

There are a few things you can and most likely should consider to avoid later surprises:

* Assuming your component is created lazily: What is the latest shutdown phase when it should be created?
* When should it be torn down and/or stop serving clients?
* When should it be entirely destroyed?

### Late Initialization and/or Resurrection Checks

A lazily instantiated component should always check, if it is still the case to get instantiated. In C++ you can do this like this:

```
if (AppShutdown::IsInOrBeyond(ShutdownPhase::AppShutdownConfirmed)) {
    return NS_ERROR_ILLEGAL_DURING_SHUTDOWN;
}
```

The example uses an early phase on purpose, as most likely you want to avoid the useless creation of a component as early as possible.

> **Note:** This check works from any thread, as opposed to `PastShutdownPhase` which needs to run from the main thread.

In chrome JS instead the equivalent check would look like this:

```
if (
    Services.startup.isInOrBeyondShutdownPhase(
    Ci.nsIAppStartup.SHUTDOWN_PHASE_APPSHUTDOWNCONFIRMED
    )
) {
    // reject some promise or similar...
    return;
}
```

> **Note:** In JS, each `await AsyncFooService.ready();` or similar inside an initializing routine may open up a can of worms if that other service is not shutdown aware and able to signal an error. Please check your callees for their behavior when hardening against resurrection.

### Selfmade Shutdown Handler: Observe a Shutdown Topic

You can simply register for one of the shutdown topics and react on it. Be aware that this approach has the disadvantage that observer notifications are synchronously executed one by one. Any heavy processing or potentially blocking I/O made here would block the main thread - unless you start adding `SpinEventLoopUntil` calls on your own, which have their own caveats.

> **Note:** The order of execution within one phase is the inverse order of registration. It is good practice to not rely on this but choose different phases to manage dependencies.

This is considered to be a legacy approach. There might be still valid reasons to do this, but first look at the other methods, please.

### Simple Shutdown Handler for C++: RunOnShutdown and ClearOnShutdown

You can run a lambda or other callable simply with:

```
#include "mozilla/ClearOnShutdown.h"

...

  RunOnShutdown([] {
    // Do something on the main thread.
  }, ShutdownPhase::<SomePhase>);
```

This has basically the same effect as a registered observer for a shutdown topic. Again it is run synchronously and should not do any heavy or async things.

This method is mostly useful for simple cleanups that can and should run late, thus the default phase of `ShutdownPhase::XPCOMShutdownFinal`.

You can also just pass a reference to any (static) `SmartPtr` to `ClearOnShutdown`. It will be cleared during the given shutdown phase, the default is again `ShutdownPhase::XPCOMShutdownFinal`, always on the main thread like for `RunOnShutdown`.

> **Note:** The order of execution within one phase is the inverse order of registration (mixed between `ClearOnShutdown` and `RunOnShutdown`). It is good practice to not rely on this but to choose different phases to manage dependencies. The entire list is executed before the observer notification is fired.

### Full blown Shutdown Handler: AsyncShutdown Blockers

They are easy to use from JS but also helpful in C++ ([yet a bit verbose](https://bugzilla.mozilla.org/show_bug.cgi?id=1796566)). The main advantage is the async, promise-based execution, that is while they are still executed on the main thread, when a blocker waits for async things (like something running on a different thread), the other blockers of the same phase continue to run, hopefully widening the sequential bottleneck of the main thread.

Be aware that (as of this writing) `AsyncShutdown` is implemented in JS and can only be used in parent and content processes.

> **Warning:** You cannot rely on any order of execution between different blockers running inside the same phase.

See [AsyncShutdown](/toolkit/modules/toolkit_modules/AsyncShutdown.rst) for a general introduction.

Predefined barriers:

| ShutdownPhase          | Barrier                 | Processes         |
| ---------------------- | ----------------------- | ----------------- |
| `AppShutdownConfirmed` | `appShutdownConfirmed`  | Parent only.      |
| `AppShutdownTeardown`  | `profileChangeTeardown` | Parent only.      |
| `AppShutdown`          | `profileBeforeChange`   | Parent only.      |
| `AppShutdownTelemetry` | `sendTelemetry`         | Parent only.      |
| `XPCOMWillShutdown`    | `xpcomWillShutdown`     | Parent & Content. Note that in non-leak-checking builds, content processes exit before entering XPCOM shutdown at all! |

> **Note:** The confusing names of the `profile*` barriers have legacy reasons, stemming from old notification topic names that lost most of their meaning during time. They might eventually change to better reflect the shutdown phases.

If you wish to have more predefined barriers, please make sure that they are [mapping to existing shutdown phases](https://searchfox.org/mozilla-central/rev/ac605820636c3b964542a2c0589af04a02235d00/toolkit/components/asyncshutdown/AsyncShutdown.sys.mjs#1097-1100). And be aware that the current JS implementation of `AsyncShutdown` does not work well with later XPCOM phases.

#### C++: Consider splitting the Shutdown

You might want a component to stop requests to be served and close all in-flight work relatively early, for example during `AppShutdownConfirmed`. On the other hand it is not necessary to free all its resources such early, the later you do so the more likely you might benefit from [Fast Shutdown](#fast-shutdown).

A strategy is to intercept an early shutdown phase with one of the above methods, do whatever it needs to deactivate the component, and delegate the boring rest of the cleanup to a later phase (via `RunOnShutdown` or `ClearOnShutdown`). Note that JS code usually does not need to bother about memory cleanups, of course.

### Test harness special cases

Be aware that not all test harnesses leverage all shutdown phases. gtests are not supposed to use any of them for the main process (but in launched child/browser processes yes), xpcshell-tests do [not go through all of them](https://searchfox.org/mozilla-central/rev/beba5cde846f944c4d709e75cbe499d17af880a4/xpcom/tests/TestHarness.h#96-105). Other test harnesses might run a random selection of tests before shutting down the parent process, so you cannot know if a shutdown is going to happen after your test. This might lead to missing test coverage if whatever shutdown behavior you want to be tested implicitly is never run or in moments you don't expect. Due to this many shutdown code paths are rarely tested intentionally and problems pop up randomly, either on CI or in the wild.

## Shutdown Hang Detection

As we execute a lot of code on multiple threads during shutdown, there are many things that can go wrong and cause us to hang. Be it for high CPU load, life- or deadlocks, blocking IO or other reasons, shutdown hangs are quite easily caused when adding shutdown blocking code. We thus have some instrumentation to detect and examine those hangs.

### Main Process Hangs

There are two standard ways of detecting shutdown hangs in the parent.

#### AsyncShutdown Blocker Timeout Crash

The `AsyncShutdown` handler will timeout-crash after `toolkit.asyncshutdown.crash_timeout` ms, currently 60s by default. The timeout is reset on the start of every phase.

The resulting crash reports will carry `AsyncShutdownTimeout` in their signature, plus a hint on where the hang is located. In its annotations you can find `AsyncShutdownTimeout` with details on the blocker that caused the hang.

#### nsTerminator Timeout Crash

The separate `nsTerminator` watchdog is initialized before entering `ShutdownPhase::AppShutdownConfirmed` and for each phase it resets a shutdown timeout of `toolkit.asyncshutdown.crash_timeout + 3000` ms, that is currently 63s. It captures all things ongoing between the notification of two shutdown phases, not only `AsyncShutdown` blockers, in particular everything synchronous happening in response to observer notifications. It is active for all shutdown phases, also the latest that `AsyncShutdown` cannot cover.

The resulting crash reports carry `shutdownhang` in their signature, with a crash reason `Shutdown hanging at step <shutdown phase>. Something is blocking the main-thread.`. The `XPCOMSpinEventLoopStack` annotation might give hints on where we're waiting, in case the main thread stack is truncated.

> **Tip:**: `nsThread` names are modified during their shutdown with the following markers: `SHDRCV` once the thread is aware to be asked to shutdown and `SHDACK` once the thread finished its shutdown and sent the ack back to the parent thread. In case of hangs in `XPCOMShutdownThreads` this can be helpful to see in the crash report, which threads are trying to shutdown. A common cause for threads not joining timely is the parent (most of the times: main) thread being too busy to ever process the acknowledgement.

### Content Process Hangs

Content processes are force killed by the parent after `dom.ipc.tabs.shutdownTimeoutSecs` if they do not shutdown timely (by default within 20s). In this case the parent continues to run and only the child is killed.

Only in nightly builds this will cause the generation of a so-called "paired minidump". The resulting crash report carries `ShutDownKill` in the signature. The stacks visible in crash-stats refer to the child process, but in the "Raw data and minidumps" tab authorized users can download the minidump of both the child and the parent process in the moment of hanging.
