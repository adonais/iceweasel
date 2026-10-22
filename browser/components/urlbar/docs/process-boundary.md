# The Process Boundary

On the [message path](overview.md#direct-path-and-message-path), the input and
the view run on the child side of the *Urlbar* JSWindowActor pair, and the
parent controller, the providers and the muxers run on the parent side.
Everything that passes between them is a message, so what arrives is a
structured clone of what was sent. This page describes what crosses that
boundary and what provider and view code has to account for.

On the direct path both sides share the same objects, so code that breaks these
rules usually still works there. To catch it, run the tests with
`browser.urlbar.ipc.chromeMessagePassing` set to `true`, which puts the
toolbar's address and search bars on the message path too.

## Results

A result crosses as the plain object that
{searchfox}`UrlbarResult.toWire() <browser/components/urlbar/content/UrlbarResult.mjs>`
returns, and `UrlbarResult.fromWire()` turns it back into a result. Any property
set on a result other than `id`, `rowIndex`, `commands` and `isSERP` is lost.

Every result a provider adds gets an `id` from the providers manager. Results
that the view builds itself have none. When a result comes back to the parent,
for example on a selection or an engagement, `fromWire()` looks the id up among
the results of the parent's last query and returns the original object, so a
provider sees the result it created. If the result isn't there, because the
query has moved on or the result came from a one-off heuristic query such as
paste and go, `fromWire()` builds a new result from the wire form. That copy is
a different object from the one the provider created, its payload is a
structured clone of the original, as described below, and it skips payload
validation.

### Payloads

The `UrlbarResult` constructor makes a shallow copy of the payload it is given.
This copy reads each getter once and keeps only own enumerable properties that
aren't `null` or `undefined`, on both paths. On the message path the payload is
then structured-cloned, so a function in it makes the message fail, and a class
instance arrives as a plain object without its prototype or methods. For
example, a Firefox Suggest result from the Rust backend keeps the Rust
component's `Suggestion` object in its payload as `suggestionObject`. The view
gets it as a plain object, so code that needs the real object, such as a
dismissal, has to run in the parent against the original result.

Payload validation needs system modules, so it is skipped in a content realm.
Provider results are validated in the parent before they cross, but a result
that a view in a content process builds itself is not validated. An invalid
payload in such a result throws when the view runs in the parent, regardless of
`browser.urlbar.ipc.chromeMessagePassing`, but goes unnoticed in a content
process.

### View data

Everything the view needs from the provider is computed in the parent and put
into the `UrlbarResult`, so the view can read it synchronously without calling
back across the boundary.

A provider that needs to change a row afterwards has to add a new result in a
later query. For the result menu only, `view.updateResultMenuCommands()`
replaces the commands of a row that is already shown.

### DOM nodes and events

DOM nodes and events never cross. The engagement data sent to the parent drops
`details.element` and `details.event`, so a provider's `onEngagement()` sees
`null` for both on the message path. `onBeforeSelection()` receives no element
there either.

## Loads

When the user picks a result, the content side asks the parent to load it. The
load parameters it sends can include principals such as `triggeringPrincipal`.
Post data travels as a string, and the parent turns it back into a stream.
Neither a `<browser>` nor the chrome `document` can be sent, so the parent adds
them itself: the target `<browser>` for a load into the current tab, and the
chrome `document` for a load elsewhere.

The parent decides which `<browser>` a load targets. An input in a content
process always targets its own tab, whatever `browserId` it sends. An input in
the chrome window identifies the browser by its `browserId`, which the parent
resolves with `BrowsingContext.getCurrentTopByBrowserId()`, and gets the
selected browser when it sends none.

An `nsIURI` doesn't survive a structured clone, and neither does an
`nsIURIFixupInfo`. URI fixup results reach the content side as plain values
instead: `URIFixupPrimitives` holds the `keywordAsSent` and the
`preferredURIDisplaySpec` of a fixup, and the fallback navigation on Enter
returns the URL to load as a string, with its post data and `keywordAsSent`.

## Provider hooks in the parent

Provider hooks such as `onEngagement()`, `onImpression()`, `onAbandonment()`
and `onSelection()` always run in the parent. On the message path they receive
the results that `fromWire()` resolved, and the view sends
`onBeforeSelection()` and `onSelection()` as messages without waiting for the
provider.

The `controller` passed to a provider is the parent controller. On the message
path, its `input` and `view` are stand-ins built by
{searchfox}`UrlbarParent <browser/components/urlbar/actors/UrlbarParent.sys.mjs>`.
They offer only the methods listed in
`UrlbarShared.INVOKABLE_CONTENT_ACTIONS`, such as:

- `input`: `search()`, `setValue()` and `startQuery()`
- `view`: `acknowledgeFeedback()`, `clearL10nCache()`, `clearTopSitesCache()`,
  `close()` and `updateResultMenuCommands()`

Every other property reads `undefined`. A call sends a message and returns
nothing, so its effect on the input or the view happens after the hook has
returned. If the page with the input has already gone away, the call is dropped
silently. Calling another method from the parent requires adding it to
`INVOKABLE_CONTENT_ACTIONS`, and its arguments have to be structured-clonable.
A result passed as an argument arrives without its private fields, so pass the
result's `id` instead, as `acknowledgeFeedback()` and
`updateResultMenuCommands()` do.

A provider that needs the chrome window reads `controller.browserWindow`, which
the parent resolves from the actor. `controller.input.window` doesn't exist on
the message path. The results that were visible at engagement time come with the
engagement data rather than from the view, since the parent's view has none.
