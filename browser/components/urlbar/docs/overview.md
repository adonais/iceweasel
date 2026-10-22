(urlbar-architecture-overview)=

# Architecture

The address bar and the search bars are implemented as a
*model-view-controller* (MVC) system. One of the scopes of this architecture is
to allow easy replacement of its components, for easier experimentation.

Each search is represented by a unique object, the *UrlbarQueryContext*. This
object, created by the *View*, describes the search and is passed through all of
the components, along the way it gets augmented with additional information.
The *UrlbarQueryContext* is passed to the *Controller*, and finally to the
*Model*. The model appends results to a property of *UrlbarQueryContext* in
chunks, it sorts them through a *Muxer* and then notifies the *Controller*.

See the specific components below, for additional details about each one's tasks
and responsibilities.

## The UrlbarQueryContext

The *UrlbarQueryContext* object describes a single instance of a search.
It is augmented as it progresses through the system, with various information.
{doc}`UrlbarQueryContext` lists its properties.

## The Model

The *Model* is the component responsible for retrieving search results based on
the user's input, and sorting them accordingly to their importance.
At the core is the {searchfox}`ProvidersManager <browser/components/urlbar/UrlbarProvidersManager.sys.mjs>`,
a component tracking all the available search providers, and managing searches
across them.

The *ProvidersManager* is a singleton, it registers internal providers on
startup and can register/unregister providers on the fly.
It can manage multiple concurrent queries, and tracks them internally as
separate *Query* objects.

The *Controller* starts and stops queries through the *ProvidersManager*.
It's possible to wait for the promise returned by *startQuery* to know when no
more results will be returned, it is not mandatory though.
Queries can be canceled.

:::{note}
Canceling a query will issue an interrupt() on the database connection,
terminating any running and future SQL query, unless a query is running inside
a *runInCriticalSection* task.
:::

The *searchString* gets tokenized by the {searchfox}`UrlbarTokenizer <browser/components/urlbar/UrlbarTokenizer.sys.mjs>`
component into tokens, some of these tokens have a special meaning and can be
used by the user to restrict the search to specific result type (See the
*UrlbarTokenizer::TYPE* enum).

:::{caution}
The tokenizer uses heuristics to determine each token's type, as such the
consumer may want to check the value before applying filters.
:::

{doc}`ProvidersManager` documents the *ProvidersManager* API.

### UrlbarProvider

A provider is specialized into searching and returning results from different
information sources. Internal providers are usually implemented in separate
*sys.mjs* modules with a *UrlbarProvider* name prefix. External providers can be
registered as *Objects* through the *ProvidersManager*.
Each provider is independent and must satisfy a base API, while internal
implementation details may vary deeply among different providers.

:::{important}
Providers are singleton, and must track concurrent searches internally, for
example mapping them by UrlbarQueryContext.
:::

:::{note}
Internal providers can access the Places database through the
*PlacesUtils.promiseLargeCacheDBConnection* utility.
:::

{doc}`UrlbarProvider` documents the API a provider implements.

### UrlbarMuxer

The *Muxer* is responsible for sorting results based on their importance and
additional rules that depend on the UrlbarQueryContext. The muxer to use is
indicated by the UrlbarQueryContext.muxer property.

:::{caution}
The Muxer is a replaceable component, as such what is described here is a
reference for the default View, but may not be valid for other implementations.
:::

{doc}`UrlbarMuxer` documents the API a muxer implements.

## The Controller

The controller is responsible for reacting to the user's input, by communicating
the proper course of action to the Model (e.g. starting/stopping a query) and the
View (e.g. showing/hiding a panel). It is also responsible for reporting Telemetry.

It is split into two classes:

- {searchfox}`UrlbarParentController <browser/components/urlbar/UrlbarParentController.sys.mjs>`
  runs in the parent process. It owns the *ProvidersManager*, drives the query
  lifecycle, and reports Telemetry.
- {searchfox}`UrlbarChildController <browser/components/urlbar/content/UrlbarChildController.mjs>`
  lives alongside the *View* (in a content process for about:newtab, or in the
  parent process for the toolbar). The *Input* and *View* talk to it; it forwards
  query work to the *UrlbarParentController* and dispatches result notifications
  to listeners.

:::{note}
Each *View* has a different controller instance.
:::

{doc}`UrlbarParentController` and {doc}`UrlbarChildController` document the
two classes.

### Direct path and message path

The *UrlbarChildController* reaches its *UrlbarParentController* in one of two
ways, chosen when the controller is created:

- **Direct path.** Both controllers live in the parent process, so the child
  controller creates the parent controller itself and calls it directly. The
  address bar and the search bar in the toolbar use this path.
- **Message path.** The child controller holds a
  {searchfox}`UrlbarParentControllerProxy <browser/components/urlbar/content/UrlbarParentControllerProxy.mjs>`
  instead, which sends each call to the parent process as a message over the
  *Urlbar* JSWindowActor pair.
  {searchfox}`UrlbarParent <browser/components/urlbar/actors/UrlbarParent.sys.mjs>`
  creates the real controller on the other side and sends its notifications
  back. A search bar in a content process, such as the one on about:newtab, uses
  this path.

Both paths give the child controller the same interface, but on the message path
every call and notification is asynchronous. Setting
`browser.urlbar.ipc.chromeMessagePassing` to `true` puts the toolbar's inputs on
the message path too, which lets tests exercise it in the parent process.

On the message path the parent keeps one controller per input. It drops the
controller when the input is garbage collected, or when the input's window
global goes away.

## The View

The View is the component responsible for presenting search results to the
user and handling their input.

% caution
%
% The View is a replaceable component, as such what is described here is a
% reference for the default View, but may not be valid for other implementations.

### {searchfox}`UrlbarInputBase.mjs <browser/components/urlbar/content/UrlbarInputBase.mjs>`

Implements an input box *View*, owns an *UrlbarView*. Each input is a custom
element extending *UrlbarInputBase*: *UrlbarInput* (`<moz-urlbar>`) and
*SearchbarInput* (`<moz-searchbar>`). {doc}`UrlbarInputBase` documents its API.

### {searchfox}`UrlbarView.mjs <browser/components/urlbar/content/UrlbarView.mjs>`

Represents the base *View* implementation, communicates with the *Controller*.
{doc}`UrlbarView` documents its API.

## UrlbarResult

An {searchfox}`UrlbarResult <browser/components/urlbar/content/UrlbarResult.mjs>`
instance represents a single search result with a result type, that
identifies specific kind of results.
Each kind has its own properties, that the *View* may support, and a few common
properties, supported by all of the results.

:::{note}
Result types are also enumerated by *UrlbarShared.RESULT_TYPE*.
:::

{doc}`UrlbarResult` documents its properties.

The following RESULT_TYPEs are supported:

```JavaScript
// An open tab.
// Payload: { icon, url, userContextId }
TAB_SWITCH: 1,
// A search suggestion or engine.
// Payload: { icon, suggestion, keyword, query, providesSearchMode, inPrivateWindow, isPrivateEngine }
SEARCH: 2,
// A common url/title tuple, may be a bookmark with tags.
// Payload: { icon, url, title, tags }
URL: 3,
// A bookmark keyword.
// Payload: { icon, url, keyword, postData }
KEYWORD: 4,
// A WebExtension Omnibox result.
// Payload: { icon, keyword, title, content }
OMNIBOX: 5,
// A tab from another synced device.
// Payload: { icon, url, device, title }
REMOTE_TAB: 6,
// An actionable message to help the user with their query.
// Payload: { buttons, helpL10n, helpUrl, icon, titleL10n, type }
TIP: 7,
// A type of result which layout is defined at runtime.
// Payload: { dynamicType }
DYNAMIC: 8,
```
