# Objects Replaced by Navigations

There are 3 major types of navigations, each of which can cause different
objects to be replaced. The general rules look something like this:

| Class/Id | [in-process navigations](#in-process-navigations) | [cross-process navigations](#cross-process-navigations) | [cross-group navigations](#cross-group-navigations) |
| --- | --- | --- | --- |
| BrowserId [^bid] | preserved | preserved | preserved |
| BrowsingContextWebProgress | preserved | preserved | preserved |
| BrowsingContextGroup | preserved | preserved | replaced |
| BrowsingContext | preserved | preserved | replaced |
| nsFrameLoader | preserved | replaced | replaced |
| RemoteBrowser | preserved | replaced | replaced |
| Browser{Parent,Child} | preserved | replaced | replaced |
| nsDocShell | preserved | replaced | replaced |
| nsGlobalWindowOuter | preserved | replaced | replaced |
| nsGlobalWindowInner | replaced [^inner] | replaced | replaced |
| WindowContext | replaced [^inner] | replaced | replaced |
| WindowGlobal{Parent,Child} | replaced [^inner] | replaced | replaced |
| Document | replaced | replaced | replaced |

[^bid]: The BrowserId is a unique ID on each `BrowsingContext` object, obtained
    using `GetBrowserId`, not a class. This ID will persist even when a
    `BrowsingContext` is replaced (e.g. due to
    `Cross-Origin-Opener-Policy`).

[^inner]: When navigating from the initial `about:blank` document to a same-origin
    document, the same `nsGlobalWindowInner`, `WindowContext` and
    `WindowGlobal{Parent,Child}` may be used. This initial `about:blank`
    document is the one created when synchronously accessing a newly-created
    pop-up window from `window.open`, or a newly-created document in an
    `<iframe>`.

## Types of Navigations

(in-process-navigations)=

### in-process navigations

An in-process navigation is the traditional type of navigation, and the most
common type of navigation when {ref}`Fission` is not enabled.

These navigations are used when no process switching or BrowsingContext
replacement is required, which includes most navigations with Fission
disabled, and most same site-origin navigations when Fission is enabled.

(cross-process-navigations)=

### cross-process navigations

A cross-process navigation is used when a navigation requires a process
switch to occur, and no BrowsingContext replacement is required. This is a
common type of load when {ref}`Fission` is enabled, though it is also used
for navigations to and from special URLs like `file://` URIs when
Fission is disabled.

These process changes are triggered by `DocumentLoadListener` when it
determines that a process switch is required. See that class's documentation
for more details.

(cross-group-navigations)=

### cross-group navigations

A cross-group navigation is used when the navigation's [response requires
a browsing context group switch](https://html.spec.whatwg.org/multipage/origin.html#browsing-context-group-switches-due-to-cross-origin-opener-policy).

These types of switches may or may not cause the process to change, but will
finish within a different `BrowsingContextGroup` than they started with.
Like {ref}`cross-process navigations`, these navigations are triggered using
the process switching logic in `DocumentLoadListener`.

As the parent of a content browsing context cannot change due to a navigation,
only toplevel content browsing contexts can cross-group navigate. Navigations in
chrome browsing contexts [^chromebc] or content subframes only experience
either in-process or cross-process navigations.

As of the time of this writing, we currently trigger a cross-group navigation
in the following circumstances, though this may change in the future:

- If the [Cross-Origin-Opener-Policy](https://html.spec.whatwg.org/multipage/origin.html#the-cross-origin-opener-policy-header)
  header is specified, and a mismatch is detected.
- When switching processes between the parent process, and a content process.
- When loading an extension document in a toplevel browsing context.
- When navigating away from a preloaded `about:newtab` document.
- When putting a `BrowsingContext` into BFCache for the session history
  in-parent BFCache implementation. This will happen on most toplevel
  navigations without opener relationships when the `fission.bfcacheInParent`
  pref is enabled.

State which needs to be saved over cross-group navigations on
`BrowsingContext` instances is copied in the
`CanonicalBrowsingContext::ReplacedBy` method.

[^chromebc]: A chrome browsing context does **not** refer to pages with the system
    principal loaded in the content area such as `about:preferences`.
    Chrome browsing contexts are generally used as the root context in a chrome
    window, such where `browser.xhtml` is loaded for a browser window.

    All chrome browsing contexts exclusively load in the parent process and
    cannot process switch when navigating.
