# Events and notifications

Session Restore reports what it is doing in two ways: DOM events dispatched on
a browser window or on a tab, and observer service notifications.

All of the DOM events bubble and none of them is cancelable. `SSTabRestored` is
a `CustomEvent`; the rest carry no data.

In the diagrams below, blue pill-shaped boxes are DOM events and rectangular
amber boxes are observer notifications.

## Restoring a session at startup

A previous session is restored automatically after a restart due to an update or
crash, or with automatic session restore enabled via the "Open previous windows
and tabs" setting (`browser.startup.page = 3`).

```{mermaid}
:caption: A session being restored at startup, from reading the session file to the last tab getting restored.

---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TD
    classDef event fill:#dbeafe,stroke:#1e40af,color:#1a1a1a;
    classDef topic fill:#fef3c7,stroke:#92400e,color:#1a1a1a;

    init["sessionstore-init-started"]
    read["sessionstore-state-read"]
    final["sessionstore-state-finalized"]
    restoring["sessionstore-restoring-on-startup"]
    wRestoring(["SSWindowRestoring"])
    wBusy(["SSWindowStateBusy"])
    wReady(["SSWindowStateReady"])
    wRestored(["SSWindowRestored"])
    single["sessionstore-single-window-restored"]
    tRestoring(["SSTabRestoring"])
    tRestored(["SSTabRestored"])
    all["sessionstore-windows-restored"]
    perf["sessionstore-finished-restoring-initial-tabs"]

    init -->|"session file read"| read
    read -->|"session state parsed"| final
    final -->|"first window's delayed startup finished"| restoring
    restoring -->|"for each window in the session"| wRestoring
    wRestoring -->|"immediately after"| wBusy
    wBusy -->|"window sized and its tabs created"| wReady
    wReady -->|"immediately after"| wRestored
    wRestored -->|"immediately after"| single
    wBusy -->|"for each tab, concurrently"| tRestoring
    tRestoring -->|"tab content restored"| tRestored
    single -->|"after the last window"| all
    all -->|"ten seconds idle"| perf

    class init,read,final,restoring,single,all,perf topic;
    class wRestoring,wBusy,wReady,wRestored,tRestoring,tRestored event;
```

`SessionStartup` reads the session file and decides what kind of session it
holds; `SessionStore` then restores the windows in it, and each window restores
its tabs.

`SSWindowRestoring` and `SSWindowStateBusy` fire back to back here, but they
mark different things. `SSWindowRestoring` and `SSWindowRestored` belong to a
window being restored. `SSWindowStateBusy` and `SSWindowStateReady` bracket any
restore into the window, including a single tab reopened later in the session,
which fires that pair without either of the other two. They are driven by a
counter, so nested restores fire them once: `SSWindowStateBusy` when the count
leaves zero and `SSWindowStateReady` when it returns to zero.

A window's tabs restore on their own schedule, so the diagram's two branches
run concurrently: the window's busy counter does not track tab content, and a
tab can fire `SSTabRestoring` and `SSTabRestored` before or after its window
fires `SSWindowStateReady` and `SSWindowRestored`.
`sessionstore-single-window-restored` means the window exists with its tabs in
it, not that their content has been restored.

Most tabs are not restored when their window is. With
`browser.sessionstore.restore_on_demand` and
`browser.sessionstore.restore_tabs_lazily` both on, which is the default,
Session Restore creates a tab without a browser element and restores it when
the user selects it -- possibly minutes later, or never. Such a tab fires
neither `SSTabRestoring` nor `SSTabRestored` in the meantime, though it does get
its label and icon from the session state, so a consumer waiting on
`SSTabRestoring` to read either one waits too long. Pinned tabs are the
exception and restore with their window, unless
`browser.sessionstore.restore_pinned_tabs_on_demand` is set.

`sessionstore-windows-restored` is the tree's startup milestone as much as it is
a Session Restore signal, and
{doc}`/browser/BrowserStartup` covers that role and the races around it. What
Session Restore means by it is narrow: every window of the startup session has
been opened and populated. It fires exactly once per browser session, including
when there was nothing to restore, so it is safe to use as "the browser is up".
A whole-session restore that happens later notifies
`sessionstore-browser-state-restored` instead, precisely so the startup
observers do not run a second time.

## Restoring a browser window later

`undoCloseWindow()`, `setWindowState()` and `restoreLastSession()` reuse the
per-window part of the sequence above: `SSWindowRestoring`, `SSWindowStateBusy`,
then `SSWindowStateReady`, `SSWindowRestored` and
`sessionstore-single-window-restored` for each window they restore. The
startup-only topics do not fire again.

Restoring a single closed tab with `undoCloseTab()` fires the busy/ready pair on
its window and the restoring/restored pair on the tab, and nothing else.

## Closing a browser window or a tab

```{mermaid}
:caption: A browser window being closed, and the closed-objects notification that follows.

---
config:
  flowchart:
    wrappingWidth: 400
---
flowchart TD
    classDef event fill:#dbeafe,stroke:#1e40af,color:#1a1a1a;
    classDef topic fill:#fef3c7,stroke:#92400e,color:#1a1a1a;
    classDef step fill:#e5e7eb,stroke:#4b5563,color:#1a1a1a;

    dwc["domwindowclosed"]
    closing(["SSWindowClosing"])
    collect["window state collected;<br/>tabs moved to the<br/>closed-windows list"]
    changed["sessionstore-closed-objects-changed"]
    flush["sessionstore-browser-shutdown-flush"]

    dwc -->|"tracked by Session Restore"| closing
    closing -->|"consumers have written their state"| collect
    collect -->|"a tick later"| changed
    changed -.->|"then, per browser, once its<br/>last update arrives"| flush

    class dwc,changed,flush topic;
    class closing event;
    class collect step;
```

`SSWindowClosing` is the last point at which a consumer can still write window
data with `setCustomWindowValue()`; after it, Session Restore stops tracking the
window.

Closing a tab is the same story without the window part: the `TabClose` handler
moves the tab into its window's closed-tabs list and asks for
`sessionstore-closed-objects-changed`.

`sessionstore-browser-shutdown-flush` fires per browser element (`MozBrowser`),
once its last state update has arrived from the content process -- not at application
shutdown, despite the name. It matters because that update can still change the
closed-tab list after `sessionstore-closed-objects-changed` already fired, which
is why Firefox View refreshes its list on both topics.

## Reading closed state after a change

`sessionstore-closed-objects-changed` and `sessionstore-saved-tab-groups-changed`
are dispatched from a zero-delay timer, and the first one is coalesced behind a
dirty flag. So a consumer that closes a tab and then reads `getClosedTabCount()`
synchronously gets the count from before the close, and several changes in one
turn of the event loop produce one notification. Read the lists from the
observer, not from the code that made the change.

## Rewriting the session before it is used

`sessionstore-state-read` is an extension point rather than a signal. Its
subject is an `nsISupportsString` holding the session file's JSON, and
`SessionStartup` reparses the string after notifying: an observer that assigns
to `subject.data` changes the session that gets restored. Rewriting it to
something that does not parse leaves the browser with no session at all.

## DOM events

```{list-table}
:header-rows: 1
:widths: 25 15 60

* - Event
  - Target
  - Fires when
* - `SSWindowClosing`
  - browser window
  - The window is closing, before Session Restore stops tracking it.
* - `SSWindowStateBusy`
  - browser window
  - The window started restoring itself or one of its tabs.
* - `SSWindowStateReady`
  - browser window
  - The window finished the restores that made it busy.
* - `SSWindowRestoring`
  - browser window
  - Session Restore is about to restore state into the window.
* - `SSWindowRestored`
  - browser window
  - The window's own state is restored and its tabs exist.
* - `SSTabRestoring`
  - `MozTabbrowserTab`
  - The tab's chrome is restored: label, icon and session history.
* - `SSTabRestored`
  - `MozTabbrowserTab`
  - The tab's content finished restoring.
```

## Observer notifications

Startup and restore:

```{list-table}
:header-rows: 1
:widths: 40 20 40

* - Topic
  - Subject
  - Fires when
* - `sessionstore-init-started`
  - `null`
  - `SessionStartup` starts initializing, which is also the
    `sessionRestoreInit` startup-timeline marker.
* - `sessionstore-state-read`
  - `nsISupportsString`
  - The session file has been read, before its JSON is parsed.
* - `sessionstore-state-finalized`
  - `null`
  - `SessionStartup` has decided what kind of session it has, so `state`,
    `sessionType` and `previousSessionCrashed` can be read.
* - `sessionstore-restoring-on-startup`
  - `null`
  - There is a session to restore at startup. Does not fire when there is
    nothing to restore.
* - `sessionstore-initiating-manual-restore`
  - `null`
  - The user asked for the previous session, through `restoreLastSession()` or
    the restore button on `about:sessionrestore`.
* - `sessionstore-single-window-restored`
  - the browser window
  - One browser window has been restored, at startup or later.
* - `sessionstore-windows-restored`
  - `null`
  - The startup session's last browser window has been restored. Fires once
    per browser session.
* - `sessionstore-browser-state-restored`
  - `null`
  - A whole session has been restored after startup, by `restoreLastSession()`
    or `setBrowserState()`.
* - `sessionstore-finished-restoring-initial-tabs`
  - `null`
  - `StartupPerformance` considers the startup restore finished, ten seconds
    after the last `sessionstore-single-window-restored`.
```

Closed tabs, windows and tab groups:

```{list-table}
:header-rows: 1
:widths: 40 20 40

* - Topic
  - Subject
  - Fires when
* - `sessionstore-closed-objects-changed`
  - `null`
  - The list of closed tabs, windows or tab groups changed. Coalesced, and
    dispatched a tick late.
* - `sessionstore-saved-tab-groups-changed`
  - `null`
  - The list of saved tab groups changed. Dispatched a tick late.
* - `sessionstore-browser-shutdown-flush`
  - `MozBrowser`
  - A browser element's final state update has been processed.
* - `sessionstore-last-session-cleared`
  - `null`
  - The previous session has been discarded, so it can no longer be restored.
* - `sessionstore-last-session-re-enable`
  - `null`
  - The previous session became restorable again, which happens when the last
    regular browser window closes while a taskbar tab window stays open.
```

Persisting to disk:

```{list-table}
:header-rows: 1
:widths: 40 20 40

* - Topic
  - Subject
  - Fires when
* - `sessionstore-state-write-complete`
  - `null`
  - `SessionSaver` finished writing the session file.
* - `sessionstore-final-state-write-complete`
  - `null`
  - The last write of the session finished. `CrashMonitor` records it as a
    checkpoint, and a missing checkpoint is how the next startup learns that
    the previous one crashed.
```

Internal and test-only, listed so they are recognizable rather than to be
consumed:

```{list-table}
:header-rows: 1
:widths: 40 20 40

* - Topic
  - Subject
  - Fires when
* - `sessionstore-one-or-no-tab-restored`
  - `null`
  - A tab's content finished restoring, or there was nothing to restore.
    `PresShell` uses the first one to mark the parent process interactable for
    its input-response telemetry.
* - `sessionstore-debug-tab-restored`
  - `MozBrowser`
  - A tab's content finished restoring. Requires
    `browser.sessionstore.debug`, and exists for tests that follow network
    loads.
* - `sessionstore-domwindowclosed-handled`
  - `null`
  - Session Restore has handled `domwindowclosed`. Requires
    `browser.sessionstore.debug`.
```

## Topics Session Restore observes

Most of what Session Restore listens for is browser lifecycle it has no say
over. Three topics are different, in that notifying them asks it to do
something:

`browser:purge-session-history`
: Wipe the session file and drop everything Session Restore is holding: closed
  tabs and windows, saved tab groups, the previous session, and the session
  history of open tabs. This is what sanitization uses.

`browser:purge-session-history-for-domain`
: The same, restricted to the domain passed as the notification's data.

`clear-origin-attributes-data`
: Forget closed tabs belonging to the `userContextId` in the notification's
  JSON data. Used when a container is deleted.
