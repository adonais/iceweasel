# Search Lifecycle

When a character is typed into the address bar, or the address bar is focused,
we initiate a search. What follows is a simplified version of the
lifetime of a search, describing the pipeline that returns results for a typed
string. Some parts of the query lifetime are intentionally omitted from this
document for clarity.

The search described in this document is internal to the address bar. It is not
the search sent to the default search engine when you press Enter. Parts of this
process often occur multiple times per keystroke, as described below.

It is recommended that you first read the {doc}`nontechnical-overview` to become
familiar with the terminology in this document. This document is current as
of April 2023.

01. The user types a query (e.g. "coffee near me") into the *UrlbarInput*
    [\<input> DOM element](https://searchfox.org/mozilla-central/rev/1f4f99a8f331cce8467a50742178b6d46914ab89/browser/base/content/navigator-toolbox.inc.xhtml#330-336).
    That DOM element {searchfox}`tells <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarInput.mjs#5567>`
    *UrlbarInput* that text is being input.

02. *UrlbarInput* {searchfox}`starts a search <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarInput.mjs#2372>`.
    It {searchfox}`creates <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarInput.mjs#5820>`
    a [UrlbarQueryContext](https://firefox-source-docs.mozilla.org/browser/urlbar/overview.html#the-urlbarquerycontext)
    and passes it to the {searchfox}`UrlbarChildController <browser/components/urlbar/content/UrlbarChildController.mjs>`,
    which forwards it to the *UrlbarParentController*. The controller is split in
    two: the *UrlbarChildController* lives alongside the input, while the
    *UrlbarParentController* owns the *ProvidersManager* and runs the query. This
    split is what lets the input run in a content process (such as about:newtab)
    while the providers stay in the parent process.
    The query context is an object that will exist for the lifetime of the query
    and it's how we keep track of what results to show. It contains information
    like what kind of results are allowed, the search string ("coffee near me",
    in this case), and other information about the state of the Urlbar. A new
    *UrlbarQueryContext* is created every time the text in the input changes.

03. *UrlbarParentController* {searchfox}`tells ProvidersManager <browser/components/urlbar/UrlbarParentController.sys.mjs>`
    that the providers should fetch results.

04. *ProvidersManager* tells {searchfox}`each <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProvidersManager.sys.mjs#408>`
    provider to decide if it wants to provide results for this query by calling
    their {searchfox}`isActive <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProvidersManager.sys.mjs#422>`
    methods. The provider can decide whether or not it will be active for this
    query. Some providers are rarely active: for example,
    *UrlbarProviderTopSites* {searchfox}`isn't active if the user has typed a search string <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProviderTopSites.sys.mjs#97>`.

05. *ProvidersManager* then tells the *active* providers to fetch results by
    {searchfox}`calling their startQuery method <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProvidersManager.sys.mjs#462>`.

06. The providers fetch results for the query asynchronously. Each provider
    fetches results in a different way. As one example, if the default search
    engine is Google, *UrlbarProviderSearchSuggestions* would send the string
    "coffee near me" to Google. Google would return a list of suggestions and
    *UrlbarProviderSearchSuggestions* would create a *UrlbarResult* for each one.

07. The providers send their results back to *ProvidersManager*. They do
    this one result at a time by {searchfox}`calling the addCallback callback <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProviderSearchSuggestions.sys.mjs#292>`
    passed into startQuery. *ProvidersManager* takes all the results from all the
    providers and {searchfox}`puts them into the list of unsorted results <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProvidersManager.sys.mjs#607>`.

    Due to the asynchronous and parallel nature of providers, this and the
    following steps may occur multiple times per search. Some providers may take
    longer than others to return their results. We don't want to wait for slow
    providers before showing results. To handle slow providers,
    *ProvidersManager* gathers results from providers in "chunks". A timer
    fires on an internal. Every time the timer fires, we take whatever results we
    have from the active providers (the "chunk" of results) and perform the
    following steps.

08. *ProvidersManager* {searchfox}`asks <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProvidersManager.sys.mjs#648>`
    *UrlbarMuxer* to sort the unsorted results.

09. *UrlbarMuxer* chooses the results that will be shown to the user. It groups
    and sorts the results to determine the order in which the results will be
    shown. This process usually involves discarding irrelevant and duplicate
    results. We also cap results at a limit, defined in the
    `browser.urlbar.maxRichResults` preference.

10. Once the results are sorted, *ProvidersManager*
    {searchfox}`tells UrlbarParentController <mozilla-central/rev/0ffaecaa075887ab07bf4c607c61ea2faa81b172:browser/components/urlbar/UrlbarProvidersManager.sys.mjs#675>`
    that results are ready to be shown.

11. *UrlbarParentController* {searchfox}`sends out a notification <browser/components/urlbar/UrlbarParentController.sys.mjs>`
    that results are ready to be shown. The notification is dispatched by the
    *UrlbarChildController*, which *UrlbarView* was {searchfox}`listening <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarView.mjs#79>`
    to. Once the view gets the notification, it {searchfox}`calls #updateResults <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarView.mjs#1310>`
    to create {searchfox}`DOM nodes <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarView.mjs#1449>`
    for each *UrlbarResult* and {searchfox}`inserts them <firefox-main/rev/88b0f8e6a5925058755d2671bdac5a76d84bd224:browser/components/urlbar/content/UrlbarView.mjs#1460>`
    into the view's DOM element.

    As described above, we may reach this step multiple times per search. That
    means we may be updating the view multiple times per keystroke. A view that
    visibly changes many times after a single keystroke is perceived as
    "flickering" by the user. As a result, we try to limit the number of times
    the view needs to update.

    :::{figure} assets/lifetime/lifetime.png
    :align: center
    :alt: |-
    :  A chart with boxes representing the various components of the
    :  address bar. An arrow moves between the boxes to illustrate a query
    :  moving through the components.
    :scale: 80%
    :::
