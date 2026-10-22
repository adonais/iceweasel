# Utilities

Various modules provide shared utilities to the other components. Code that runs
only in the parent process can use any of them. Code that can also run in a
content process, such as the input and the view, imports system modules only
behind a check for a privileged realm, and otherwise uses the modules that are
safe in a content realm: *UrlbarShared*, *UrlbarContentPrefs* and
*UrlbarContentUtils*. When adding a helper, put it in *UrlbarShared* if both
sides need it and it uses nothing privileged, and in *UrlbarUtils* otherwise.

## {searchfox}`UrlbarPrefs.sys.mjs <browser/components/urlbar/UrlbarPrefs.sys.mjs>`

Implements a Map-like storage or urlbar related preferences. The values are kept
up-to-date.

```JavaScript
import { UrlbarPrefs } from "moz-src:///browser/components/urlbar/UrlbarPrefs.sys.mjs";

// Always use browser.urlbar. relative branch, except for the preferences in
// PREF_OTHER_DEFAULTS.
UrlbarPrefs.get("delay"); // Gets value of browser.urlbar.delay.
```

:::{note}
Newly added preferences should always be properly documented in UrlbarPrefs.
:::

## {searchfox}`UrlbarContentPrefs.mjs <browser/components/urlbar/content/UrlbarContentPrefs.mjs>`

A content-side module imports this instead of *UrlbarPrefs*. In a privileged
realm it re-exports *UrlbarPrefs* itself. In a content process it forwards to the
port that the *Urlbar* actor publishes on the window, which offers only a subset
of *UrlbarPrefs*, such as `get`, `addObserver` and `removeObserver`. Exposing
another method requires changing the actor.

```JavaScript
import UrlbarPrefs from "chrome://browser/content/urlbar/UrlbarContentPrefs.mjs";

UrlbarPrefs.get("delay"); // Gets value of browser.urlbar.delay.
```

## {searchfox}`UrlbarUtils.sys.mjs <browser/components/urlbar/UrlbarUtils.sys.mjs>`

Includes helpers that need privileged code, such as the search service, Places
or form history. It is a system module, so a content realm can't import it.

```JavaScript
import { UrlbarUtils } from "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs";
```

## {searchfox}`UrlbarShared.mjs <browser/components/urlbar/content/UrlbarShared.mjs>`

Holds the constants shared across all the components, such as the
[result types and sources](overview.md#urlbarresult), and the helpers that both
sides of the [message path](overview.md#direct-path-and-message-path) need. It
can be imported into system and content realms alike, so it must not use
privileged APIs or content-only globals like `window`. Each realm that imports
it gets its own copy of the module, so any state it holds is per-realm.

```JavaScript
import { UrlbarShared } from "chrome://browser/content/urlbar/UrlbarShared.mjs";
```

To check whether a value implements a DOM interface, use
`UrlbarShared.isInstance(value, iface)`. The interface's own `isInstance()` is
chrome-only, so it throws in a content realm, and `instanceof` fails for a value
from another global, such as an event from another window.
`UrlbarShared.isInstance()` calls the interface's `isInstance()` where it
exists, and in a content realm falls back to `instanceof`, which compares
against that realm's own interface object.

## {searchfox}`UrlbarContentUtils.mjs <browser/components/urlbar/content/UrlbarContentUtils.mjs>`

Accessors for things a content module can't reach for itself, such as the
platform, the containers, or whether a window is private. Each accessor goes
through the *Urlbar* actor's port when one is published on the window, and
reaches the value directly otherwise. Because it checks for the port rather than
for the process, an input in the parent process that uses the message path takes
the same route as one in a content process.

```JavaScript
import { UrlbarContentUtils } from "chrome://browser/content/urlbar/UrlbarContentUtils.mjs";
```

```{js:autoclass} UrlbarContentUtils
:members:
```
