# Writing Code for the Message Path

{doc}`process-boundary` describes what crosses between the two sides of the
*Urlbar* actor pair. This page gives the rules for writing code that works on
both [paths](overview.md#direct-path-and-message-path). Code that breaks them
usually still works on the direct path, so run its tests
[over the message path](testing.md#testing-over-the-message-path) too.

Some failures only show in a content process, because in the parent process
every realm is privileged. The tests in
{searchfox}`tests/browser-newtab <browser/components/urlbar/tests/browser-newtab/>`
run the New Tab search bar, which lives in a content process.

## A payload is plain data

Whatever crosses the boundary arrives as a structured clone: no getters, no
private fields, no class identity, no DOM nodes, and no properties the sender
didn't serialize. Object identity is lost too, so results are matched by their
`id` rather than by reference. {doc}`process-boundary` describes how results,
payloads and loads follow this rule.

## A value has to be cloned into the realm that reads it

The `UrlbarChild` actor runs with system privileges. In a content process, an
object it leaves in its own realm reaches content code through an Xray wrapper.
An array then throws as soon as content code iterates it
(`Permission denied to access property Symbol.iterator`). A class instance
fails without an error, with every property reading `undefined`.

`Cu.cloneInto(value, win)` copies a value into the realm of the content window.
That fixes an array, but drops the prototype of a class instance, so a class
crosses in its wire form and is rebuilt on the content side, as
`UrlbarQueryContext.fromWire()` does. An object with methods, such as a
listener, needs `cloneFunctions: true`. The caller has to keep the clone,
because `removeListener()` only matches the object that was added;
`NewtabSearchbarContentTestUtils.addControllerListener()` returns it for that
reason.

Waiving Xrays on the object you call says nothing about the arguments you pass
it. `UrlbarChild` waives Xrays on the content-side input and view to call their
methods, and still clones the arguments into the content window. Waiving Xrays
on an element also changes which members you see: its JS properties appear, and
its `[ChromeOnly]` WebIDL members such as `documentGlobal` disappear.

## One strong reference keeps the whole chain alive

On the message path the parent holds its controller until the input is
garbage collected. `UrlbarChild` registers each input in a
`FinalizationRegistry` and sends `Destroy` when the input is collected, and the
parent then drops the controller. A strong reference to the input from anything
that outlives it keeps the input alive, so the registry never fires. The parent
still drops the controller when the actor is torn down with its window global,
so the controller lives as long as the page, or the browser window for an input
in chrome, rather than forever.

A strong reference to anything that holds the input has the same effect. The
child controller holds the input, so `UrlbarChild` holds each child controller
only through a `WeakRef`.

## Calls to the parent are asynchronous

On the direct path, a synchronous call to the parent controller may have done
all of its work, apart from any asynchronous work it starts, by the time it
returns. On the message path it returns a promise or nothing, and
the parent's answer arrives at least one round trip later. That has two
consequences:

- Anything the view needs synchronously has to arrive with the results. This is
  why a provider's view data is computed in the parent and stored in the result
  (see [View data](process-boundary.md#view-data)).
- Anything that resolved by returning has to resolve when the work is done, not
  when the message is sent, or the caller acts on state that hasn't arrived yet.

The search engine store is an example. On the direct path, an input fills its
store synchronously through `maybeInitEngineStore()` when the search service is
already initialized. The message path has no synchronous call, so every input
fills its store after a round trip. Each consumer of the store decides what to
do until then: code that picks results waits for `engineStore.init()`, and the
placeholder and search icon update once the store is ready.

## A difference between transports belongs to the transport

Where the two paths have to behave differently, put the difference inside the
transport and keep one implementation above it. For example, `UrlbarChild`
clones a value into the content window only when the input runs in a content
process, and passes it through unchanged in the parent. The code that sends the
value is the same on both paths.

Rebuilding a class instance from its wire form is the exception. The transport
runs in the system global, so an object it built there would reach content code
as an Xray. The child controller rebuilds the query context in its own realm
instead, in `notifyFromWire()`.

## Failures are silent in a content process

Code that breaks these rules in a content process rarely throws where you can
see it. `UrlbarInputBase.handleEvent()` catches any exception from an `_on_*`
event handler and reports it with `console.error()`, and a content process's
`console.error()` output doesn't reach a mochitest's log. A chrome-only access
in content code therefore looks like a feature doing nothing. `dump()` output
does reach the log.

Content code that needs a chrome-only API such as `windowUtils`, or something
only the browser window has, such as `gBrowser`, has two options. It can ask
the parent through the actor, as the accessors in
{doc}`UrlbarContentUtils <utilities>` do. Or it can check
`typeof ChromeUtils` and fall back to a content-safe equivalent, as
`UrlbarShared.getBoundsWithoutFlushing()` and `UrlbarShared.isInstance()` do.
