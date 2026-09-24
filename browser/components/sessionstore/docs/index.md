(sessionstore)=

# Session Restore

Session restore keeps track of the windows, tabs and tab groups a user has open
or recently closed, along with state information for each tab (history, scroll
position, form data, etc.). It persists that state to disk, and puts it back
when Firefox starts again or when the user reopens something they closed.

`SessionStore` is the component's entry point. It observes browser windows and
their tabs, holds the collected state in memory, and exposes the API that the
rest of the front-end uses to read state, to reopen closed tabs, windows and tab
groups, and to save and restore whole sessions. The remaining modules in
{searchfox}`browser/components/sessionstore
<browser/components/sessionstore/>` support it:

`SessionStartup`
: Reads the session file at startup and decides whether the previous session
  should be restored.

`SessionSaver`, `SessionFile` and `SessionWriter`
: Schedule and perform the disk I/O that persists the session state.

`TabState`, `TabStateCache` and `TabStateFlusher`
: Collect per-tab state, cache it, and let callers wait for a tab's latest data.

`RunState`
: Tracks whether session restore is stopped, running or quitting.

`GlobalState`, `SessionCookies`, `TabAttributes` and `TabGroupState`
: Hold the parts of the session state that aren't per-tab.

```{toctree}
:maxdepth: 1

api
```
