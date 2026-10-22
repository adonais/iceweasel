# Address Bar and Search Bars

This document describes the implementation of Firefox's address bar, also known
as the quantumbar or urlbar. The address bar was also called the awesomebar
until Firefox 68, when it was substantially rewritten.

The same code also runs the search bar in the toolbar and the search bar on the
New Tab page, so most of these pages apply to all three.

The address bar is a specialized search access point that aggregates data from
several different sources, including:

- Places (Firefox's history and bookmarks system)
- Search engines (including search suggestions)
- WebExtensions
- Open tabs

## Where to Start

If you want a high level, nontechnical summary of how the address bar works,
read {doc}`nontechnical-overview`.

If you are interested in the technical details, you might want to skip ahead to
{doc}`overview`.

## Codebase

The code lives in {searchfox}`browser/components/urlbar <browser/components/urlbar/>`,
which is where the often-used *urlbar* shorthand comes from.

## Table of Contents

```{toctree}
nontechnical-overview
overview
lifetime
process-boundary
message-path
utilities
telemetry
firefox-suggest-telemetry
debugging
ranking
dynamic-result-types
adding-a-search-bar
preferences
testing
contact
```

## API Reference

```{toctree}
ProvidersManager
UrlbarChildController
UrlbarInputBase
UrlbarMuxer
UrlbarParentController
UrlbarProvider
UrlbarQueryContext
UrlbarResult
UrlbarView
```
