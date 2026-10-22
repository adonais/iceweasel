# Adding a Search Bar

The address bar's code also runs the search bar in the toolbar and the search
bar on the New Tab page. This page lists what a new search bar needs, using
those two as examples. Most steps fail somewhere other than where the mistake
is, often by recording nothing rather than by throwing, so each step says what
you see when it is missing.

Each input has a *search access point* (SAP) name, such as `urlbar`,
`searchbar` or `newtab_searchbar`. The name selects the input's providers and
result groups, decides which shared behaviors it gets, and appears in its
telemetry.

## The Element

Subclass `UrlbarInputBase` and define your own custom element, as
{searchfox}`SearchbarInput.mjs <browser/components/urlbar/content/SearchbarInput.mjs>`
does for `<moz-searchbar>`. Put behavior that belongs to your element alone in
the base class's hooks (`sapInit`, `sapConnectedCallback`,
`sapDisconnectedCallback`, `initSapContextMenuItems`,
`handleEmptyValueNavigation`) rather than in `sapName` checks in the base. The
New Tab search bar predates this and still runs on `<moz-urlbar>`
([Bug 2077531](https://bugzilla.mozilla.org/show_bug.cgi?id=2077531)).

Whatever creates the element has to set its `sap-name` attribute. Without it,
the parent controller can't be created and the input does nothing.

Behavior shared between inputs is keyed by SAP name rather than by class,
because most of it runs in providers in the parent process, which only see
`queryContext.sapName`. Decide which group the new input joins:

- A search field joins `UrlbarShared.SEARCHBAR_SAPS`. It then ignores
  `keyword.enabled`, shows recent searches from all engines, keeps form history
  when `browser.search.suggest.enabled` is off, and keeps its value after a
  result opens in a new tab or window.
- `UrlbarShared.navigationEnabled()` is true for every SAP name except
  `searchbar`. It gives the input URL heuristics and the address bar's
  placeholders, such as "Search or enter address".
- `UrlbarChildController.isCanonizeKeyboardEvent` skips canonization only when
  `sapName` is `searchbar`.
- Other checks for `sapName == "searchbar"`, such as the view hiding action
  labels, belong to the toolbar search bar alone.

[Bug 2064651 comment 7](https://bugzilla.mozilla.org/show_bug.cgi?id=2064651#c7)
records how each of these branches was decided for the New Tab search bar.

Features that belong to the address bar, such as search terms persistence,
run only when `sapName` is `urlbar`, so a new input gets none of them.

## Hosting the Element in a Page

An input in a page lives in a content process and reaches the parent through
the *Urlbar* actor pair, as {doc}`process-boundary` describes. The actor's
registration in
{searchfox}`DesktopActorRegistry.sys.mjs <browser/components/DesktopActorRegistry.sys.mjs>`
lists the pages it runs in, and its `remoteTypes` allow only the parent process
and privileged about pages. Add the new page there, and never a page that loads
in a web content process.
The child actor is created on `DOMDocElementInserted`, before page script runs,
because a content-realm input reads `window.UrlbarActorPort` synchronously as
it connects and cannot create the actor itself.

On about:newtab, register through New Tab's external component registry
(`AboutNewTabComponentRegistry` in
{searchfox}`AboutNewTabComponents.sys.mjs <browser/components/newtab/AboutNewTabComponents.sys.mjs>`)
rather than editing New Tab. A registrant subclasses
`BaseAboutNewTabComponentRegistrant` and is listed under the
`browser-newtab-external-component` category in `BrowserComponents.manifest`;
{searchfox}`UrlbarNewTabComponentRegistrant.sys.mjs <browser/components/urlbar/UrlbarNewTabComponentRegistrant.sys.mjs>`
is the example. The registry admits one component of each type, rejects the
rest with `Failed to validate a configuration`, and keeps whichever registrant
it enumerated first. A search bar that replaces another one therefore needs both
registrants to read the same condition and to call `updated()` when it
changes. Otherwise a flip leaves the page with two search bars, or with none.
The New Tab search bar and the handoff search bar (`SearchNewTabComponentsRegistrant`)
both read `UrlbarPrefs.get("newtabFeatureGate")`.

The registrant's `l10nURLs` has to list every Fluent file the element's strings
come from, including the result group labels, which are in `browser.ftl` and,
for Firefox Suggest, `preview/enUS-searchFeatures.ftl`. Fluent only uses a
locale that has every required file, so a missing file puts the whole page in
en-US rather than leaving one string untranslated.

### Styling

A page gets the address bar's styles by linking `chrome://browser/skin/urlbar.css`
(the registrant's `stylesURLs`). Content can load a stylesheet from a chrome
package marked `contentaccessible`, which `browser` and `global` are and
`mozapps` is not. A load that a node starts, such as an `<img>` pointing at a
`chrome:` URL, is still refused. In a content process,
`UrlbarUtils.getEngineIconUrl()` turns blob and `moz-extension:` engine icon
URLs into data URLs.

The results view is a `popover="manual"` element, so it opens in the top layer.
A page has no toolbar to decide whether the view may extend past the input, so
the input's `in-page` attribute allows the popover in a content document.

## Registering the Search Access Point

Nothing checks that a SAP name is registered everywhere it needs to be, and the
`sap` keys in the metric definitions are `type: string`, so a half-registered
name records wrong or missing data without an error.

- **The name.** Pick one that can't be confused with existing values:
  `newtab_searchbar` sits beside `urlbar_newtab` and `urlbar_handoff`. The name
  ships in telemetry.
- **Providers.** Each entry in `localProviderModules` in
  `UrlbarProvidersManager.sys.mjs` lists its `supportedSAPs`. A new name starts
  with no providers, so its queries return no results.
- **Result groups.** `UrlbarPrefs.getResultGroups()` throws
  `Unknown SAP name` for a name its `switch` doesn't list.
- **Engagement telemetry.** `#searchSourceToSap` in `UrlbarParentController`
  needs a branch for the new input. Without one, an input in a tab falls through
  to the address bar's checks and records the wrong `sap`, such as
  `urlbar_newtab`. An input with no browser window throws instead; the error is
  logged as `Could not record engagement:`, and the engagement, abandonment and
  exposure events are lost.
- **Zero-prefix counters.** `urlbar.zeroprefix2.*` are labeled counters keyed
  by SAP name. An unlisted name counts into `__other__`.
- **Search counts.** `BrowserSearchTelemetry.recordSearch()` logs
  `Unknown source for search:` and records nothing for a source missing from
  `KNOWN_SEARCH_SOURCES`, and records without an action label for one missing
  from its `switch`. `browser.engagement.navigation.<source>` needs a metric for
  the new source; without one, the search is lost along with
  `newtab.search.issued`.
- **Metric documentation.** Add the name to every `sap` description in
  {searchfox}`browser/components/urlbar/metrics.yaml <browser/components/urlbar/metrics.yaml>`,
  to the `urlbar.zeroprefix2` labels there, to the enumerations in
  {searchfox}`browser/components/search/metrics.yaml <browser/components/search/metrics.yaml>`,
  and to the lists in {doc}`/browser/search/telemetry`.
- **Bounce events.** The parent tracks a bounce against the input's `<browser>`.
  An input in a page gets its own browser automatically; an input with no
  browser records no bounce events, while the other engagement events still
  record.
- **`location`.** The `location` extra is required for `smartbar` only. Don't
  add it for a new input.
- **Data classification.** The revision needs the data classification tag that
  matches the `data_sensitivity` of the metrics it touches.
- **Checking it.** On a real profile, open `about:glean`, then perform an
  engagement and an abandonment in the new input, and confirm that each records
  with the new `sap`.

## Navigation and Focus

Decide where a picked result loads (the same tab, or a new one under
modifiers), what focuses the input, where focus goes when the view is
dismissed, and what a query records when its tab goes to the background. If a
pick unloads the page the input lives in, the engagement still has to be
recorded.
[Engagements from a search bar in a web page](telemetry.md#engagements-from-a-search-bar-in-a-web-page)
describes how the New Tab search bar orders its messages so that it is.

## Tests

Give the input its own test suite, with a manifest that sets the prefs it
needs. {doc}`testing` describes the shared test utilities, and how a test drives
an input that lives in a page.
